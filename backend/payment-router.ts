import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { merchants, payments, wifiTickets } from "@db/schema";
import { getFirstMerchantOrNull } from "./queries/local-data";
import { appendLedgerEntry } from "./queries/ledger";
import { publishRealtimeEvent } from "./realtime";
import {
  createGatewayOrder,
  getPaymentGatewayRuntimeStatus,
  resolvePaymentGatewayProvider,
  verifyRazorpayCheckoutSignature,
} from "./lib/payment-gateways";
import type {
  GatewayCheckout,
  PaymentGatewayProvider,
} from "./lib/payment-gateways";
import { completeSuccessfulPayment } from "./lib/payment-service";
import {
  bindPaymentConnectivitySessionToPayment,
  getValidPaymentConnectivitySession,
  markPaymentConnectivitySessionFailed,
} from "./lib/payment-connectivity";
import { env } from "./lib/env";

function generateTransactionId(): string {
  return `TXN${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function generateInvoiceNumber(): string {
  return `INV${Date.now().toString().slice(-10)}`;
}

function normalizeTicketCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function appendReturnParams(returnUrl: string, params: Record<string, string>) {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    forwardedFor ??
    null
  );
}

function storedCheckout(metadata: Record<string, unknown>): GatewayCheckout | null {
  const checkout = metadata.gatewayCheckout;
  if (!checkout || typeof checkout !== "object" || Array.isArray(checkout)) return null;

  const mode = (checkout as { mode?: unknown }).mode;
  if (mode === "razorpay" || mode === "cashfree" || mode === "redirect") {
    return checkout as GatewayCheckout;
  }

  return null;
}

const paymentStatusSchema = z.enum(["pending", "success", "failed", "refunded"]);
const gatewayProviderSchema = z.enum(["razorpay", "phonepe", "cashfree"]);
const ticketTypeSchema = z.enum(["qr", "otp"]);
type PaymentAttemptSource = "direct_payment" | "ticket_scan" | "payment_connectivity";

function gstBreakdown(amount: number) {
  const gstPercentage = 18;
  const baseAmount = amount / (1 + gstPercentage / 100);
  const gstAmount = amount - baseAmount;

  return {
    gstAmount,
    gstPercentage,
  };
}

export type CreatePaymentOrderInput = {
  merchantId: number;
  userId?: number;
  ticketId?: number;
  ticketCode?: string;
  amount: number;
  paymentMethod: "upi" | "card" | "wallet" | "cash" | "subscription";
  currency: string;
  provider?: PaymentGatewayProvider;
  returnUrl?: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  durationMinutes?: number;
  ticketType?: "qr" | "otp";
  connectivitySessionId?: string;
  connectivityToken?: string;
  deviceFingerprint?: string;
  scannerIpAddress?: string | null;
  scannerUserAgent?: string | null;
  source?: PaymentAttemptSource;
};

function scannerMetadata(input: CreatePaymentOrderInput) {
  const scanner = compactRecord({
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    deviceFingerprint: input.deviceFingerprint,
    ipAddress: input.scannerIpAddress,
    userAgent: input.scannerUserAgent,
    ticketCode: input.ticketCode,
    startedAt: new Date().toISOString(),
  });

  return {
    source: input.source ?? (input.connectivitySessionId ? "payment_connectivity" : "direct_payment"),
    scanner,
  };
}

function paymentPayload(payment: typeof payments.$inferSelect) {
  return {
    id: payment.id,
    merchantId: payment.merchantId ?? undefined,
    transactionId: payment.transactionId ?? undefined,
    invoiceNumber: payment.invoiceNumber ?? undefined,
    amount: Number(payment.amount ?? 0),
    gstAmount: Number(payment.gstAmount ?? 0),
    status: payment.status,
    gatewayProvider: payment.gatewayProvider ?? undefined,
    gatewayOrderId: payment.gatewayOrderId ?? undefined,
    currency: payment.currency,
  };
}

function canManageMerchant(
  user: { id: number; role: string },
  merchant?: typeof merchants.$inferSelect | null
) {
  return (
    merchant?.userId === user.id ||
    user.role === "admin" ||
    user.role === "super_admin"
  );
}

async function findPendingScannedPayment(input: {
  ticketId: number;
  deviceFingerprint?: string;
}) {
  if (!input.deviceFingerprint) return null;

  const db = getDb();
  const rows = await db.select()
    .from(payments)
    .where(and(
      eq(payments.ticketId, input.ticketId),
      eq(payments.status, "pending"),
      sql`JSON_UNQUOTE(JSON_EXTRACT(${payments.metadata}, '$.scanner.deviceFingerprint')) = ${input.deviceFingerprint}`,
    ))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  return rows.at(0) ?? null;
}

export async function createPaymentOrder(input: CreatePaymentOrderInput) {
  const db = getDb();
  const provider = resolvePaymentGatewayProvider(input.provider);
  if (Boolean(input.connectivitySessionId) !== Boolean(input.connectivityToken)) {
    throw new Error("Payment connectivity session id and token must be provided together.");
  }
  if (input.connectivitySessionId && input.connectivityToken) {
    await getValidPaymentConnectivitySession({
      publicId: input.connectivitySessionId,
      token: input.connectivityToken,
      merchantId: input.merchantId,
    });
  }
  const transactionId = generateTransactionId();
  const invoiceNumber = generateInvoiceNumber();
  const { gstAmount, gstPercentage } = gstBreakdown(input.amount);
  const paymentMetadata = {
    ticketCode: input.ticketCode ?? null,
    durationMinutes: input.durationMinutes ?? null,
    ticketType: input.ticketType ?? "otp",
    checkoutProvider: provider,
    connectivitySessionId: input.connectivitySessionId ?? null,
    requestedAt: new Date().toISOString(),
    ...scannerMetadata(input),
  };

  const result = await db.insert(payments).values({
    merchantId: input.merchantId,
    userId: input.userId,
    ticketId: input.ticketId,
    amount: input.amount.toFixed(2),
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    transactionId,
    gatewayProvider: provider,
    status: "pending",
    gstAmount: gstAmount.toFixed(2),
    gstPercentage: gstPercentage.toFixed(2),
    invoiceNumber,
    metadata: paymentMetadata,
  });

  const paymentId = Number(result[0].insertId);
  let checkout: GatewayCheckout;
  let gatewayOrderId: string;

  try {
    if (input.connectivitySessionId && input.connectivityToken) {
      await bindPaymentConnectivitySessionToPayment({
        publicId: input.connectivitySessionId,
        token: input.connectivityToken,
        merchantId: input.merchantId,
        paymentId,
        provider,
      });
    }

    const order = await createGatewayOrder({
      provider,
      paymentId,
      merchantId: input.merchantId,
      transactionId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      returnUrl: input.returnUrl ?? `${env.publicAppUrl.replace(/\/$/, "")}/payment`,
      customer: {
        id: input.userId
          ? `user_${input.userId}`
          : input.ticketId
            ? `ticket_${input.ticketId}`
            : `payment_${paymentId}`,
        name: input.customerName,
        email: input.customerEmail,
        phone: input.customerPhone,
      },
      ticketCode: input.ticketCode,
    });
    checkout = order.checkout;
    gatewayOrderId = order.gatewayOrderId;

    await db.update(payments)
      .set({
        gatewayOrderId,
        metadata: {
          ...paymentMetadata,
          gatewayOrder: order.raw,
          gatewayCheckout: order.checkout,
          gatewayOrderCreatedAt: new Date().toISOString(),
        },
      })
      .where(eq(payments.id, paymentId));
  } catch (error) {
    if (input.connectivitySessionId) {
      await markPaymentConnectivitySessionFailed(
        paymentId,
        error instanceof Error ? error.message : "Gateway order failed",
      );
    }
    await db.update(payments)
      .set({
        status: "failed",
        metadata: {
          ...paymentMetadata,
          gatewayOrderError: error instanceof Error ? error.message : "Gateway order failed",
          failedAt: new Date().toISOString(),
        },
      })
      .where(eq(payments.id, paymentId));
    throw error;
  }

  await appendLedgerEntry({
    entityType: "payment",
    entityId: paymentId,
    action: "PENDING",
    merchantId: input.merchantId,
    data: {
      amount: input.amount,
      method: input.paymentMethod,
      provider,
      gatewayOrderId,
      ticketCode: input.ticketCode,
      connectivitySessionId: input.connectivitySessionId,
    },
  });

  publishRealtimeEvent({
    topic: "payment",
    action: "created",
    merchantId: input.merchantId,
    entityId: paymentId,
    data: { amount: input.amount, status: "pending", provider },
  });

  return {
    success: true,
    payment: {
      id: paymentId,
      merchantId: input.merchantId,
      transactionId,
      invoiceNumber,
      amount: input.amount,
      gstAmount,
      status: "pending",
      gatewayProvider: provider,
      gatewayOrderId,
      currency: input.currency,
    },
    checkout,
  };
}

type TicketPaymentInput = {
  ticket: typeof wifiTickets.$inferSelect;
  code: string;
  provider?: PaymentGatewayProvider;
  returnUrl?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deviceFingerprint?: string;
  scannerIpAddress?: string | null;
  scannerUserAgent?: string | null;
};

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function scannerFromMetadata(metadata: Record<string, unknown>) {
  const scanner = metadata.scanner;
  if (scanner && typeof scanner === "object" && !Array.isArray(scanner)) {
    return scanner as Record<string, unknown>;
  }
  return {};
}

function ticketPaymentDescription(code: string) {
  return `Sriyan WiFi token ${code}`;
}

async function createTicketScanPayment(input: TicketPaymentInput) {
  const existing = await findPendingScannedPayment({
    ticketId: input.ticket.id,
    deviceFingerprint: input.deviceFingerprint,
  });
  if (existing) {
    return {
      success: true,
      paymentRequired: true,
      alreadyStarted: true,
      payment: paymentPayload(existing),
    };
  }

  const db = getDb();
  const amount = Number(input.ticket.price ?? 0);
  const currency = input.ticket.currency ?? "INR";
  const provider = getPaymentGatewayRuntimeStatus().activeProvider ?? undefined;
  const transactionId = generateTransactionId();
  const invoiceNumber = generateInvoiceNumber();
  const { gstAmount, gstPercentage } = gstBreakdown(amount);
  const metadata = {
    ticketCode: input.code,
    durationMinutes: input.ticket.durationMinutes,
    ticketType: input.ticket.type,
    checkoutProvider: provider ?? null,
    requestedAt: new Date().toISOString(),
    ...scannerMetadata({
      merchantId: input.ticket.merchantId,
      ticketId: input.ticket.id,
      ticketCode: input.code,
      amount,
      paymentMethod: "upi",
      currency,
      description: ticketPaymentDescription(input.code),
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      deviceFingerprint: input.deviceFingerprint,
      scannerIpAddress: input.scannerIpAddress,
      scannerUserAgent: input.scannerUserAgent,
      durationMinutes: input.ticket.durationMinutes,
      ticketType: input.ticket.type,
      source: "ticket_scan",
    }),
  };

  const result = await db.insert(payments).values({
    merchantId: input.ticket.merchantId,
    ticketId: input.ticket.id,
    amount: amount.toFixed(2),
    currency,
    paymentMethod: "upi",
    transactionId,
    gatewayProvider: provider,
    status: "pending",
    gstAmount: gstAmount.toFixed(2),
    gstPercentage: gstPercentage.toFixed(2),
    invoiceNumber,
    metadata,
  });
  const paymentId = Number(result[0].insertId);

  await appendLedgerEntry({
    entityType: "payment",
    entityId: paymentId,
    action: "SCAN_STARTED",
    merchantId: input.ticket.merchantId,
    data: {
      amount,
      provider,
      ticketCode: input.code,
      deviceFingerprint: input.deviceFingerprint,
    },
  });

  publishRealtimeEvent({
    topic: "payment",
    action: "scan_started",
    merchantId: input.ticket.merchantId,
    entityId: paymentId,
    data: { amount, status: "pending", ticketCode: input.code, provider },
  });

  return {
    success: true,
    paymentRequired: true,
    alreadyStarted: false,
    payment: {
      id: paymentId,
      merchantId: input.ticket.merchantId,
      transactionId,
      invoiceNumber,
      amount,
      gstAmount,
      status: "pending",
      gatewayProvider: provider,
      currency,
    },
  };
}

async function attachGatewayToPendingPayment(input: TicketPaymentInput & {
  payment: typeof payments.$inferSelect;
}) {
  const metadata = asMetadata(input.payment.metadata);
  const checkout = storedCheckout(metadata);
  if (input.payment.gatewayOrderId && checkout) {
    return {
      success: true,
      payment: paymentPayload(input.payment),
      checkout,
    };
  }

  const db = getDb();
  const scanner = scannerFromMetadata(metadata);
  const provider = resolvePaymentGatewayProvider(
    input.provider ?? input.payment.gatewayProvider ?? undefined,
  );
  const transactionId = input.payment.transactionId ?? generateTransactionId();
  const returnUrl = input.returnUrl
    ?? appendReturnParams(`${env.publicAppUrl.replace(/\/$/, "")}/hotspot`, { code: input.code });

  try {
    const order = await createGatewayOrder({
      provider,
      paymentId: input.payment.id,
      merchantId: input.ticket.merchantId,
      transactionId,
      amount: Number(input.payment.amount ?? input.ticket.price ?? 0),
      currency: input.payment.currency ?? input.ticket.currency ?? "INR",
      description: ticketPaymentDescription(input.code),
      returnUrl,
      customer: {
        id: input.ticket.id ? `ticket_${input.ticket.id}` : `payment_${input.payment.id}`,
        name: input.customerName ?? metadataString(scanner.customerName),
        email: input.customerEmail ?? metadataString(scanner.customerEmail),
        phone: input.customerPhone ?? metadataString(scanner.customerPhone),
      },
      ticketCode: input.code,
    });

    await db.update(payments)
      .set({
        transactionId,
        gatewayProvider: provider,
        gatewayOrderId: order.gatewayOrderId,
        metadata: {
          ...metadata,
          checkoutProvider: provider,
          gatewayOrder: order.raw,
          gatewayCheckout: order.checkout,
          gatewayOrderCreatedAt: new Date().toISOString(),
        },
      })
      .where(eq(payments.id, input.payment.id));

    await appendLedgerEntry({
      entityType: "payment",
      entityId: input.payment.id,
      action: "GATEWAY_ORDER_CREATED",
      merchantId: input.ticket.merchantId,
      data: {
        amount: Number(input.payment.amount ?? 0),
        provider,
        gatewayOrderId: order.gatewayOrderId,
        ticketCode: input.code,
      },
    });

    publishRealtimeEvent({
      topic: "payment",
      action: "gateway_order_created",
      merchantId: input.ticket.merchantId,
      entityId: input.payment.id,
      data: {
        amount: Number(input.payment.amount ?? 0),
        status: "pending",
        provider,
        gatewayOrderId: order.gatewayOrderId,
      },
    });

    return {
      success: true,
      payment: {
        ...paymentPayload(input.payment),
        transactionId,
        gatewayProvider: provider,
        gatewayOrderId: order.gatewayOrderId,
      },
      checkout: order.checkout,
    };
  } catch (error) {
    await db.update(payments)
      .set({
        status: "failed",
        metadata: {
          ...metadata,
          gatewayOrderError: error instanceof Error ? error.message : "Gateway order failed",
          failedAt: new Date().toISOString(),
        },
      })
      .where(eq(payments.id, input.payment.id));
    throw error;
  }
}

export const paymentRouter = createRouter({
  gatewayStatus: publicQuery.query(() => getPaymentGatewayRuntimeStatus()),

  create: publicQuery
    .input(
      z.object({
        merchantId: z.number().optional(),
        userId: z.number().optional(),
        ticketId: z.number().optional(),
        amount: z.number().positive().max(100_000),
        paymentMethod: z.enum(["upi", "card", "wallet", "cash", "subscription"]).default("upi"),
        provider: gatewayProviderSchema.optional(),
        currency: z.string().length(3).default("INR"),
        returnUrl: z.string().url().optional(),
        customerName: z.string().max(255).optional(),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().min(8).max(20).optional(),
        durationMinutes: z.number().min(5).max(1440).default(60),
        ticketType: ticketTypeSchema.default("otp"),
        connectivitySessionId: z.string().min(1).optional(),
        connectivityToken: z.string().min(16).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const fallbackMerchant = input.merchantId ? null : await getFirstMerchantOrNull();
      const merchantId = input.merchantId ?? fallbackMerchant?.id;
      if (!merchantId) {
        throw new Error("No merchant is available for this payment");
      }

      return createPaymentOrder({
        merchantId,
        userId: input.userId,
        ticketId: input.ticketId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        provider: input.provider,
        currency: input.currency,
        returnUrl: input.returnUrl,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        durationMinutes: input.durationMinutes,
        ticketType: input.ticketType,
        connectivitySessionId: input.connectivitySessionId,
        connectivityToken: input.connectivityToken,
        description: "Sriyan WiFi access",
      });
    }),

  createForTicket: publicQuery
    .input(
      z.object({
        code: z.string().min(1),
        provider: gatewayProviderSchema.optional(),
        returnUrl: z.string().url().optional(),
        customerName: z.string().max(255).optional(),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().min(8).max(20).optional(),
        deviceFingerprint: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const code = normalizeTicketCode(input.code);
      const ticketRows = await db.select()
        .from(wifiTickets)
        .where(eq(wifiTickets.ticketCode, code))
        .limit(1);
      const ticket = ticketRows.at(0);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      const amount = Number(ticket.price ?? 0);
      if (amount <= 0) {
        throw new Error("This ticket does not require payment.");
      }

      const successfulRows = await db.select()
        .from(payments)
        .where(and(eq(payments.ticketId, ticket.id), eq(payments.status, "success")))
        .limit(1);
      if (successfulRows.at(0)) {
        return {
          success: true,
          alreadyPaid: true,
          paymentId: successfulRows[0].id,
          checkout: null,
        };
      }

      const pendingPayment = await findPendingScannedPayment({
        ticketId: ticket.id,
        deviceFingerprint: input.deviceFingerprint,
      });
      if (pendingPayment) {
        return attachGatewayToPendingPayment({
          payment: pendingPayment,
          ticket,
          code,
          provider: input.provider,
          returnUrl: input.returnUrl,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          deviceFingerprint: input.deviceFingerprint,
          scannerIpAddress: getRequestIp(ctx.req.headers),
          scannerUserAgent: ctx.req.headers.get("user-agent"),
        });
      }

      const merchantRows = await db.select()
        .from(merchants)
        .where(eq(merchants.id, ticket.merchantId))
        .limit(1);
      const merchant = merchantRows.at(0);
      const returnUrl = input.returnUrl
        ?? appendReturnParams(`${env.publicAppUrl.replace(/\/$/, "")}/hotspot`, { code });

      return createPaymentOrder({
        merchantId: ticket.merchantId,
        ticketId: ticket.id,
        ticketCode: code,
        amount,
        paymentMethod: "upi",
        provider: input.provider,
        currency: ticket.currency ?? "INR",
        returnUrl,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? merchant?.settlementPhone ?? undefined,
        durationMinutes: ticket.durationMinutes,
        ticketType: ticket.type,
        deviceFingerprint: input.deviceFingerprint,
        scannerIpAddress: getRequestIp(ctx.req.headers),
        scannerUserAgent: ctx.req.headers.get("user-agent"),
        source: "ticket_scan",
        description: ticketPaymentDescription(code),
      });
    }),

  registerTicketScan: publicQuery
    .input(
      z.object({
        code: z.string().min(1),
        customerName: z.string().max(255).optional(),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().min(8).max(20).optional(),
        deviceFingerprint: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const code = normalizeTicketCode(input.code);
      const ticketRows = await db.select()
        .from(wifiTickets)
        .where(eq(wifiTickets.ticketCode, code))
        .limit(1);
      const ticket = ticketRows.at(0);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      const amount = Number(ticket.price ?? 0);
      if (amount <= 0) {
        return {
          success: true,
          paymentRequired: false,
          alreadyPaid: true,
          payment: null,
        };
      }

      const successfulRows = await db.select()
        .from(payments)
        .where(and(eq(payments.ticketId, ticket.id), eq(payments.status, "success")))
        .limit(1);
      const successfulPayment = successfulRows.at(0);
      if (successfulPayment) {
        return {
          success: true,
          paymentRequired: false,
          alreadyPaid: true,
          payment: paymentPayload(successfulPayment),
        };
      }

      return createTicketScanPayment({
        ticket,
        code,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        deviceFingerprint: input.deviceFingerprint,
        scannerIpAddress: getRequestIp(ctx.req.headers),
        scannerUserAgent: ctx.req.headers.get("user-agent"),
      });
    }),

  verifyGatewayPayment: publicQuery
    .input(
      z.object({
        provider: gatewayProviderSchema,
        paymentId: z.number().optional(),
        transactionId: z.string().optional(),
        gatewayOrderId: z.string().min(1),
        gatewayPaymentId: z.string().min(1),
        gatewaySignature: z.string().optional(),
        durationMinutes: z.number().min(5).max(1440).default(60),
        ticketType: ticketTypeSchema.default("otp"),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.provider !== "razorpay") {
        throw new Error("Checkout verification is available for Razorpay. Cashfree and PhonePe settle through signed webhooks.");
      }
      if (!input.gatewaySignature) {
        throw new Error("Razorpay checkout signature is required.");
      }
      const valid = verifyRazorpayCheckoutSignature({
        gatewayOrderId: input.gatewayOrderId,
        gatewayPaymentId: input.gatewayPaymentId,
        gatewaySignature: input.gatewaySignature,
      });
      if (!valid) {
        throw new Error("Razorpay payment signature verification failed.");
      }

      return completeSuccessfulPayment({
        paymentId: input.paymentId,
        transactionId: input.transactionId,
        gatewayOrderId: input.gatewayOrderId,
        gatewayPaymentId: input.gatewayPaymentId,
        provider: input.provider,
        durationMinutes: input.durationMinutes,
        ticketType: input.ticketType,
        source: "checkout",
      });
    }),

  confirmManualUpi: authedQuery
    .input(
      z
        .object({
          merchantId: z.number(),
          paymentId: z.number().optional(),
          ticketCode: z.string().min(1).optional(),
          upiReference: z.string().min(4).max(120),
          payerName: z.string().max(255).optional(),
          payerVpa: z.string().max(120).optional(),
          approveAccess: z.boolean().default(true),
        })
        .refine(input => input.paymentId || input.ticketCode, {
          message: "Provide paymentId or ticketCode.",
        })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, input.merchantId))
        .limit(1);
      const merchant = merchantRows.at(0);
      if (!canManageMerchant(ctx.user, merchant)) {
        throw new Error("You cannot manage this merchant.");
      }

      let payment = null as typeof payments.$inferSelect | null;
      let ticket = null as typeof wifiTickets.$inferSelect | null;

      if (input.paymentId) {
        const paymentRows = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.id, input.paymentId),
              eq(payments.merchantId, input.merchantId)
            )
          )
          .limit(1);
        payment = paymentRows.at(0) ?? null;
        if (!payment) throw new Error("Payment was not found.");
      }

      const normalizedCode = input.ticketCode
        ? normalizeTicketCode(input.ticketCode)
        : undefined;
      if (payment?.ticketId) {
        const ticketRows = await db
          .select()
          .from(wifiTickets)
          .where(eq(wifiTickets.id, payment.ticketId))
          .limit(1);
        ticket = ticketRows.at(0) ?? null;
      } else if (normalizedCode) {
        const ticketRows = await db
          .select()
          .from(wifiTickets)
          .where(
            and(
              eq(wifiTickets.ticketCode, normalizedCode),
              eq(wifiTickets.merchantId, input.merchantId)
            )
          )
          .limit(1);
        ticket = ticketRows.at(0) ?? null;
      }

      if (!ticket) throw new Error("Ticket was not found.");
      if (ticket.status === "expired" || ticket.status === "revoked") {
        throw new Error("Expired or revoked tickets cannot be manually paid.");
      }

      const amount = Number(ticket.price ?? payment?.amount ?? 0);
      if (amount <= 0) {
        throw new Error("This ticket does not require payment.");
      }

      if (!payment) {
        const pendingRows = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.ticketId, ticket.id),
              eq(payments.merchantId, input.merchantId),
              eq(payments.status, "pending")
            )
          )
          .orderBy(desc(payments.createdAt))
          .limit(1);
        payment = pendingRows.at(0) ?? null;
      }

      const successfulRows = await db
        .select()
        .from(payments)
        .where(
          and(eq(payments.ticketId, ticket.id), eq(payments.status, "success"))
        )
        .limit(1);
      const existingSuccess = successfulRows.at(0);
      if (existingSuccess) {
        if (
          input.approveAccess &&
          ticket.accessApprovalStatus !== "approved"
        ) {
          await db
            .update(wifiTickets)
            .set({
              accessApprovalStatus: "approved",
              accessApprovedAt: new Date(),
              accessRejectedAt: null,
              accessDecisionReason: null,
            })
            .where(eq(wifiTickets.id, ticket.id));
        }

        return {
          success: true,
          payment: paymentPayload(existingSuccess),
          alreadyPaid: true,
        };
      }

      if (!payment) {
        const { gstAmount, gstPercentage } = gstBreakdown(amount);
        const result = await db.insert(payments).values({
          merchantId: input.merchantId,
          ticketId: ticket.id,
          amount: amount.toFixed(2),
          currency: ticket.currency ?? "INR",
          paymentMethod: "upi",
          transactionId: generateTransactionId(),
          status: "pending",
          gstAmount: gstAmount.toFixed(2),
          gstPercentage: gstPercentage.toFixed(2),
          invoiceNumber: generateInvoiceNumber(),
          metadata: {
            ticketCode: ticket.ticketCode,
            source: "manual_upi_confirmation",
            requestedAt: new Date().toISOString(),
          },
        });
        const rows = await db
          .select()
          .from(payments)
          .where(eq(payments.id, Number(result[0].insertId)))
          .limit(1);
        payment = rows.at(0) ?? null;
      }

      if (!payment) throw new Error("Payment could not be created.");

      const now = new Date();
      const originalMetadata = asMetadata(payment.metadata);
      await db
        .update(payments)
        .set({
          ticketId: ticket.id,
          status: "success",
          metadata: {
            ...originalMetadata,
            ticketCode: ticket.ticketCode,
            manualUpi: {
              reference: input.upiReference.trim(),
              payerName: input.payerName,
              payerVpa: input.payerVpa,
              confirmedBy: ctx.user.id,
              confirmedAt: now.toISOString(),
            },
            gatewayCompletionSource: "manual_upi",
            gatewayCompletedAt: now.toISOString(),
          },
        })
        .where(eq(payments.id, payment.id));

      await db
        .update(merchants)
        .set({
          walletBalance: sql`CAST(walletBalance AS DECIMAL(10,2)) + CAST(${amount} AS DECIMAL(10,2))`,
        })
        .where(eq(merchants.id, input.merchantId));

      if (input.approveAccess) {
        await db
          .update(wifiTickets)
          .set({
            accessApprovalStatus: "approved",
            accessApprovedAt: now,
            accessRejectedAt: null,
            accessDecisionReason: null,
          })
          .where(eq(wifiTickets.id, ticket.id));
      }

      await appendLedgerEntry({
        entityType: "ticket",
        entityId: ticket.id,
        action: "PAID",
        merchantId: input.merchantId,
        data: {
          ticketCode: ticket.ticketCode,
          amount,
          paymentId: payment.id,
          source: "manual_upi",
          upiReference: input.upiReference.trim(),
        },
      });

      await appendLedgerEntry({
        entityType: "payment",
        entityId: payment.id,
        action: "COMPLETED",
        merchantId: input.merchantId,
        data: {
          provider: "manual_upi",
          upiReference: input.upiReference.trim(),
          source: "merchant_confirmation",
        },
      });

      publishRealtimeEvent({
        topic: "payment",
        action: "completed",
        merchantId: input.merchantId,
        entityId: payment.id,
        data: {
          status: "success",
          ticketId: ticket.id,
          provider: "manual_upi",
        },
      });
      publishRealtimeEvent({
        topic: "ticket",
        action: input.approveAccess ? "access_approved" : "paid",
        merchantId: input.merchantId,
        entityId: ticket.id,
        data: {
          code: ticket.ticketCode,
          amount,
          source: "manual_upi",
        },
      });

      return {
        success: true,
        payment: {
          ...paymentPayload(payment),
          status: "success",
        },
        alreadyPaid: false,
      };
    }),

  list: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        status: paymentStatusSchema.optional(),
        limit: z.number().int().min(1).max(500).default(200),
        offset: z.number().int().min(0).max(100_000).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? and(
            eq(payments.merchantId, input.merchantId),
            eq(payments.status, input.status),
          )
        : eq(payments.merchantId, input.merchantId);

      return db.select()
        .from(payments)
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  recent: authedQuery
    .input(z.object({ merchantId: z.number(), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select()
        .from(payments)
        .where(eq(payments.merchantId, input.merchantId))
        .orderBy(desc(payments.createdAt))
        .limit(input.limit);
    }),

  stats: authedQuery
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'success' THEN CAST(${payments.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${payments.status} = 'success' THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN ${payments.status} = 'pending' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${payments.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
        .from(payments)
        .where(eq(payments.merchantId, input.merchantId));
      const stats = rows.at(0);

      return {
        totalRevenue: Number(stats?.totalRevenue ?? 0),
        total: Number(stats?.total ?? 0),
        success: Number(stats?.success ?? 0),
        pending: Number(stats?.pending ?? 0),
        failed: Number(stats?.failed ?? 0),
      };
    }),

  dailyRevenue: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        days: z.number().int().min(1).max(31).default(7),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const dayExpr = sql<string>`DATE(${payments.createdAt})`;
      const rows = await db.select({
        day: dayExpr,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'success' THEN CAST(${payments.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
      })
        .from(payments)
        .where(
          and(
            eq(payments.merchantId, input.merchantId),
            sql`${payments.createdAt} >= ${since}`,
          ),
        )
        .groupBy(dayExpr)
        .orderBy(dayExpr);

      return rows.map((row) => ({
        day: row.day,
        revenue: Number(row.revenue ?? 0),
      }));
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select()
        .from(payments)
        .where(eq(payments.id, input.id))
        .limit(1);
      return rows.at(0) || null;
    }),
});
