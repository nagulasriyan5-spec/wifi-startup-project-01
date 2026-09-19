import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { merchants, payments, wifiTickets } from "@db/schema";
import { appendLedgerEntry } from "../queries/ledger";
import { publishRealtimeEvent } from "../realtime";
import { generateOTP, generateTicketCode } from "./ticket-codes";
import type { PaymentGatewayProvider } from "./payment-gateways";
import {
  destroyPaymentConnectivitySessionForPayment,
  markPaymentConnectivitySessionFailed,
} from "./payment-connectivity";

type TicketType = "qr" | "otp";

type PaymentRef = {
  paymentId?: number;
  transactionId?: string;
  gatewayOrderId?: string;
};

type GatewayCompletionInput = PaymentRef & {
  provider: PaymentGatewayProvider;
  gatewayPaymentId?: string;
  durationMinutes?: number;
  ticketType?: TicketType;
  source: "checkout" | "webhook";
  gatewayEvent?: unknown;
};

type GatewayFailureInput = PaymentRef & {
  provider: PaymentGatewayProvider;
  gatewayPaymentId?: string;
  source: "checkout" | "webhook";
  reason?: string;
  gatewayEvent?: unknown;
};

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function findPayment(ref: PaymentRef) {
  const db = getDb();
  if (ref.paymentId) {
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.id, ref.paymentId))
      .limit(1);
    if (rows.at(0)) return rows[0];
  }
  if (ref.transactionId) {
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, ref.transactionId))
      .limit(1);
    if (rows.at(0)) return rows[0];
  }
  if (ref.gatewayOrderId) {
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.gatewayOrderId, ref.gatewayOrderId))
      .limit(1);
    if (rows.at(0)) return rows[0];
  }
  return null;
}

function assertPaymentMatchesGatewayRef(
  payment: typeof payments.$inferSelect,
  input: GatewayCompletionInput | GatewayFailureInput
) {
  if (payment.gatewayProvider && payment.gatewayProvider !== input.provider) {
    throw new Error("Payment provider does not match the gateway callback.");
  }
  if (input.transactionId && payment.transactionId !== input.transactionId) {
    throw new Error("Payment transaction does not match the gateway callback.");
  }
  if (input.gatewayOrderId) {
    if (!payment.gatewayOrderId) {
      throw new Error("Payment has no stored gateway order id.");
    }
    if (payment.gatewayOrderId !== input.gatewayOrderId) {
      throw new Error("Payment gateway order id does not match the callback.");
    }
  }
}

async function getTicketById(ticketId?: number | null) {
  if (!ticketId) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(wifiTickets)
    .where(eq(wifiTickets.id, ticketId))
    .limit(1);
  return rows.at(0) ?? null;
}

function ticketPayload(ticket: typeof wifiTickets.$inferSelect | null) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    code: ticket.ticketCode,
    type: ticket.type,
    durationMinutes: ticket.durationMinutes,
    price: Number(ticket.price ?? 0),
    expiresAt: ticket.expiresAt,
  };
}

async function hasSuccessfulTicketPayment(ticketId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.ticketId, ticketId), eq(payments.status, "success")))
    .limit(1);
  return Boolean(rows.at(0));
}

export async function completeSuccessfulPayment(input: GatewayCompletionInput) {
  const db = getDb();
  const payment = await findPayment(input);
  if (!payment) {
    throw new Error("Payment was not found for the gateway callback.");
  }
  assertPaymentMatchesGatewayRef(payment, input);

  const existingTicket = await getTicketById(payment.ticketId);
  const ticketWasAlreadyPaid = existingTicket
    ? await hasSuccessfulTicketPayment(existingTicket.id)
    : false;
  if (payment.status === "success") {
    await destroyPaymentConnectivitySessionForPayment(
      payment.id,
      "payment_already_verified"
    );
    return {
      success: true,
      ticket: ticketPayload(existingTicket),
      paymentId: payment.id,
      idempotent: true,
    };
  }

  const originalMetadata = asMetadata(payment.metadata);
  const isPaymentConnectivity =
    typeof originalMetadata.connectivitySessionId === "string";
  const metadata = {
    ...originalMetadata,
    gatewayCompletionSource: input.source,
    gatewayCompletedAt: new Date().toISOString(),
    gatewayEvent: input.gatewayEvent,
  };

  await db
    .update(payments)
    .set({
      status: "success",
      gatewayProvider: input.provider,
      gatewayOrderId: input.gatewayOrderId ?? payment.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId ?? payment.gatewayPaymentId,
      metadata,
    })
    .where(eq(payments.id, payment.id));

  let generatedTicket = existingTicket;

  if (payment.merchantId) {
    await db
      .update(merchants)
      .set({
        walletBalance: sql`CAST(walletBalance AS DECIMAL(10,2)) + CAST(${payment.amount} AS DECIMAL(10,2))`,
      })
      .where(eq(merchants.id, payment.merchantId));

    if (!generatedTicket && !isPaymentConnectivity) {
      const metadataDuration = Number(originalMetadata.durationMinutes);
      const metadataTicketType =
        originalMetadata.ticketType === "qr" ? "qr" : "otp";
      const ticketType = input.ticketType ?? metadataTicketType;
      const durationMinutes =
        input.durationMinutes ??
        (Number.isFinite(metadataDuration) && metadataDuration > 0
          ? metadataDuration
          : 60);
      const code =
        ticketType === "otp" ? generateOTP() : generateTicketCode(12);
      const expiresAt = new Date(Date.now() + durationMinutes * 60000);
      const ticketResult = await db.insert(wifiTickets).values({
        merchantId: payment.merchantId,
        ticketCode: code,
        type: ticketType,
        durationMinutes,
        maxDevices: 1,
        price: Number(payment.amount).toFixed(2),
        expiresAt,
      });

      const ticketId = Number(ticketResult[0].insertId);
      await db
        .update(payments)
        .set({ ticketId })
        .where(eq(payments.id, payment.id));
      generatedTicket = {
        id: ticketId,
        merchantId: payment.merchantId,
        branchId: null,
        ticketCode: code,
        type: ticketType,
        status: "active",
        durationMinutes,
        dataLimitMb: null,
        speedLimitMbps: null,
        maxDevices: 1,
        price: Number(payment.amount).toFixed(2),
        currency: payment.currency,
        accessApprovalStatus: "auto_approved",
        accessApprovedAt: null,
        accessRejectedAt: null,
        accessDecisionReason: null,
        deviceFingerprint: null,
        macAddress: null,
        usedAt: null,
        expiresAt,
        createdAt: new Date(),
      };

      await appendLedgerEntry({
        entityType: "ticket",
        entityId: ticketId,
        action: "CREATED",
        merchantId: payment.merchantId,
        data: {
          ticketCode: code,
          type: ticketType,
          price: Number(payment.amount),
          source: "payment_gateway",
        },
      });

      publishRealtimeEvent({
        topic: "ticket",
        action: "created",
        merchantId: payment.merchantId,
        entityId: ticketId,
        data: { code, type: ticketType },
      });
    } else if (generatedTicket && !ticketWasAlreadyPaid) {
      await appendLedgerEntry({
        entityType: "ticket",
        entityId: generatedTicket.id,
        action: "PAID",
        merchantId: payment.merchantId,
        data: {
          ticketCode: generatedTicket.ticketCode,
          amount: Number(payment.amount),
          paymentId: payment.id,
          provider: input.provider,
        },
      });

      publishRealtimeEvent({
        topic: "ticket",
        action: "paid",
        merchantId: payment.merchantId,
        entityId: generatedTicket.id,
        data: {
          code: generatedTicket.ticketCode,
          amount: Number(payment.amount),
        },
      });
    }
  }

  await appendLedgerEntry({
    entityType: "payment",
    entityId: payment.id,
    action: "COMPLETED",
    merchantId: payment.merchantId ?? undefined,
    data: {
      provider: input.provider,
      gatewayOrderId: input.gatewayOrderId ?? payment.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId ?? payment.gatewayPaymentId,
      source: input.source,
    },
  });

  publishRealtimeEvent({
    topic: "payment",
    action: "completed",
    merchantId: payment.merchantId ?? undefined,
    entityId: payment.id,
    data: {
      status: "success",
      ticketId: generatedTicket?.id,
      provider: input.provider,
    },
  });

  await destroyPaymentConnectivitySessionForPayment(
    payment.id,
    "payment_verified"
  );

  return {
    success: true,
    ticket: ticketPayload(generatedTicket),
    paymentId: payment.id,
    idempotent: false,
  };
}

export async function markPaymentFailed(input: GatewayFailureInput) {
  const db = getDb();
  const payment = await findPayment(input);
  if (!payment) {
    throw new Error("Payment was not found for the gateway callback.");
  }
  assertPaymentMatchesGatewayRef(payment, input);

  if (payment.status === "success") {
    return { success: true, paymentId: payment.id, ignored: true };
  }

  await db
    .update(payments)
    .set({
      status: "failed",
      gatewayProvider: input.provider,
      gatewayOrderId: input.gatewayOrderId ?? payment.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId ?? payment.gatewayPaymentId,
      metadata: {
        ...asMetadata(payment.metadata),
        gatewayFailureSource: input.source,
        gatewayFailedAt: new Date().toISOString(),
        gatewayFailureReason:
          input.reason ?? "Gateway reported payment failure",
        gatewayEvent: input.gatewayEvent,
      },
    })
    .where(eq(payments.id, payment.id));

  await appendLedgerEntry({
    entityType: "payment",
    entityId: payment.id,
    action: "FAILED",
    merchantId: payment.merchantId ?? undefined,
    data: {
      provider: input.provider,
      gatewayOrderId: input.gatewayOrderId ?? payment.gatewayOrderId,
      reason: input.reason,
      source: input.source,
    },
  });

  publishRealtimeEvent({
    topic: "payment",
    action: "failed",
    merchantId: payment.merchantId ?? undefined,
    entityId: payment.id,
    data: { status: "failed", provider: input.provider },
  });

  await markPaymentConnectivitySessionFailed(
    payment.id,
    input.reason ?? "Gateway reported payment failure"
  );

  return { success: true, paymentId: payment.id };
}
