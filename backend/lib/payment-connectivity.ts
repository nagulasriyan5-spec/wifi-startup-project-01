import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { paymentConnectivitySessions } from "@db/schema";
import { getDb } from "../queries/connection";
import { appendLedgerEntry } from "../queries/ledger";
import { publishRealtimeEvent } from "../realtime";
import { env } from "./env";
import type { PaymentGatewayProvider } from "./payment-gateways";

export type ConnectivityNetworkInput = {
  gatewayReachable?: boolean;
  paymentAppReachable?: boolean;
  rttMs?: number;
  downlinkMbps?: number;
  effectiveType?: string;
  forcePaymentConnectivity?: boolean;
};

export type ConnectivityAssessment = {
  decision: "use_mobile" | "offer_payment_connectivity" | "force_payment_connectivity";
  mobileSufficient: boolean;
  reasons: string[];
};

export type CreatePaymentConnectivitySessionInput = {
  merchantId: number;
  branchId?: number;
  amount: number;
  currency: string;
  provider?: PaymentGatewayProvider;
  routerId?: string;
  deviceFingerprint?: string;
  macAddress?: string;
  assessment: ConnectivityAssessment;
  metadata?: Record<string, unknown>;
};

const providerAllowedHosts: Record<PaymentGatewayProvider, string[]> = {
  razorpay: [
    "checkout.razorpay.com",
    "api.razorpay.com",
    "rzp.io",
  ],
  cashfree: [
    "sdk.cashfree.com",
    "api.cashfree.com",
    "sandbox.cashfree.com",
    "payments.cashfree.com",
  ],
  phonepe: [
    "api.phonepe.com",
    "api-preprod.phonepe.com",
    "mercury.phonepe.com",
  ],
};

function publicAppHost() {
  try {
    return new URL(env.publicAppUrl).hostname;
  } catch {
    return "";
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function hashToken(token: string) {
  return crypto
    .createHmac("sha256", env.appSecret)
    .update(token)
    .digest("hex");
}

function timingSafeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function getPaymentOnlyAllowedHosts(provider?: PaymentGatewayProvider | null) {
  const configured = env.paymentConnectivityAllowedHosts;
  const activeProvider = provider ?? null;
  return unique([
    publicAppHost(),
    ...(activeProvider ? providerAllowedHosts[activeProvider] : Object.values(providerAllowedHosts).flat()),
    ...configured,
  ]);
}

export function assessPaymentConnectivity(input: ConnectivityNetworkInput = {}): ConnectivityAssessment {
  const reasons: string[] = [];
  const effectiveType = input.effectiveType?.toLowerCase();

  if (input.forcePaymentConnectivity) {
    return {
      decision: "force_payment_connectivity",
      mobileSufficient: false,
      reasons: ["Merchant or controller forced payment-only connectivity."],
    };
  }

  if (input.gatewayReachable === false) {
    reasons.push("Payment gateway was not reachable on mobile data.");
  }
  if (input.paymentAppReachable === false) {
    reasons.push("Payment app or UPI intent was not reachable on mobile data.");
  }
  if (typeof input.rttMs === "number" && input.rttMs > 1200) {
    reasons.push("Mobile network latency is too high for reliable payment confirmation.");
  }
  if (typeof input.downlinkMbps === "number" && input.downlinkMbps < 0.35) {
    reasons.push("Mobile network throughput is below the payment reliability threshold.");
  }
  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    reasons.push("Mobile network effective type is too weak for reliable checkout.");
  }

  const mobileSufficient = reasons.length === 0;
  return {
    decision: mobileSufficient ? "use_mobile" : "offer_payment_connectivity",
    mobileSufficient,
    reasons: mobileSufficient
      ? ["Mobile network is sufficient; payment connectivity should not be used."]
      : reasons,
  };
}

export function verifyConnectivityToken(
  session: typeof paymentConnectivitySessions.$inferSelect,
  token: string,
) {
  return timingSafeEqual(session.sessionTokenHash, hashToken(token));
}

export async function getValidPaymentConnectivitySession(input: {
  publicId: string;
  token: string;
  merchantId?: number;
}) {
  const db = getDb();
  const rows = await db.select()
    .from(paymentConnectivitySessions)
    .where(eq(paymentConnectivitySessions.publicId, input.publicId))
    .limit(1);
  const session = rows.at(0);
  if (!session) {
    throw new Error("Payment connectivity session was not found.");
  }
  if (input.merchantId && session.merchantId !== input.merchantId) {
    throw new Error("Payment connectivity session does not belong to this merchant.");
  }
  if (!verifyConnectivityToken(session, input.token)) {
    throw new Error("Payment connectivity session token is invalid.");
  }
  if (session.expiresAt < new Date()) {
    await db.update(paymentConnectivitySessions)
      .set({ status: "expired", lastSeenAt: new Date() })
      .where(eq(paymentConnectivitySessions.id, session.id));
    throw new Error("Payment connectivity session has expired.");
  }
  if (["destroyed", "failed", "rejected", "expired"].includes(session.status)) {
    throw new Error(`Payment connectivity session is ${session.status}.`);
  }
  return session;
}

export async function createPaymentConnectivitySession(input: CreatePaymentConnectivitySessionInput) {
  const db = getDb();
  const publicId = `pcs_${crypto.randomBytes(18).toString("hex")}`;
  const token = crypto.randomBytes(32).toString("base64url");
  const provider = input.provider ?? null;
  const allowedHosts = getPaymentOnlyAllowedHosts(provider);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.paymentConnectivityMaxSeconds * 1000);

  const result = await db.insert(paymentConnectivitySessions).values({
    publicId,
    merchantId: input.merchantId,
    branchId: input.branchId,
    routerId: input.routerId,
    sessionTokenHash: hashToken(token),
    deviceFingerprint: input.deviceFingerprint,
    macAddress: input.macAddress,
    status: input.assessment.decision === "use_mobile" ? "mobile_sufficient" : "offered",
    networkDecision: input.assessment.decision,
    amount: input.amount.toFixed(2),
    currency: input.currency,
    gatewayProvider: provider,
    allowedHosts,
    expiresAt,
    metadata: {
      ...input.metadata,
      assessment: input.assessment,
      maxSeconds: env.paymentConnectivityMaxSeconds,
      paymentOnly: true,
      publicInternetAllowed: false,
    },
  });
  const id = Number(result[0].insertId);

  await appendLedgerEntry({
    entityType: "session",
    entityId: id,
    action: "CREATED",
    merchantId: input.merchantId,
    data: {
      publicId,
      branchId: input.branchId ?? null,
      decision: input.assessment.decision,
      allowedHosts,
      expiresAt,
      sessionKind: "payment_connectivity",
    },
  });

  publishRealtimeEvent({
    topic: "connectivity",
    action: "created",
    merchantId: input.merchantId,
    entityId: id,
    data: { publicId, decision: input.assessment.decision },
  });

  return {
    id,
    publicId,
    token,
    expiresAt,
    allowedHosts,
    ttlSeconds: env.paymentConnectivityMaxSeconds,
  };
}

export async function bindPaymentConnectivitySessionToPayment(input: {
  publicId: string;
  token: string;
  merchantId: number;
  paymentId: number;
  provider: PaymentGatewayProvider;
}) {
  const db = getDb();
  const session = await getValidPaymentConnectivitySession(input);

  await db.update(paymentConnectivitySessions)
    .set({
      paymentId: input.paymentId,
      gatewayProvider: input.provider,
      status: "payment_pending",
      lastSeenAt: new Date(),
    })
    .where(eq(paymentConnectivitySessions.id, session.id));

  await appendLedgerEntry({
    entityType: "session",
    entityId: session.id,
    action: "PAYMENT_BOUND",
    merchantId: session.merchantId,
    data: { paymentId: input.paymentId, provider: input.provider, sessionKind: "payment_connectivity" },
  });
}

export async function markPaymentConnectivitySessionFailed(paymentId: number, reason: string) {
  const db = getDb();
  const rows = await db.select()
    .from(paymentConnectivitySessions)
    .where(eq(paymentConnectivitySessions.paymentId, paymentId))
    .limit(1);
  const session = rows.at(0);
  if (!session) return;

  await db.update(paymentConnectivitySessions)
    .set({
      status: "failed",
      lastSeenAt: new Date(),
      metadata: {
        ...(session.metadata && typeof session.metadata === "object" ? session.metadata : {}),
        failureReason: reason,
      },
    })
    .where(eq(paymentConnectivitySessions.id, session.id));
}

export async function destroyPaymentConnectivitySessionForPayment(paymentId: number, reason: string) {
  const db = getDb();
  const rows = await db.select()
    .from(paymentConnectivitySessions)
    .where(eq(paymentConnectivitySessions.paymentId, paymentId))
    .limit(1);
  const session = rows.at(0);
  if (!session || session.status === "destroyed") return null;

  const now = new Date();
  await db.update(paymentConnectivitySessions)
    .set({
      status: "destroyed",
      destroyedAt: now,
      lastSeenAt: now,
      metadata: {
        ...(session.metadata && typeof session.metadata === "object" ? session.metadata : {}),
        destroyReason: reason,
      },
    })
    .where(eq(paymentConnectivitySessions.id, session.id));

  await appendLedgerEntry({
    entityType: "session",
    entityId: session.id,
    action: "DESTROYED",
    merchantId: session.merchantId,
    data: { paymentId, reason, sessionKind: "payment_connectivity" },
  });

  publishRealtimeEvent({
    topic: "connectivity",
    action: "destroyed",
    merchantId: session.merchantId,
    entityId: session.id,
    data: { publicId: session.publicId, paymentId, reason },
  });

  return session;
}

export async function authorizePaymentConnectivitySession(input: {
  publicId: string;
  token: string;
  routerId?: string;
  deviceFingerprint?: string;
  macAddress?: string;
}) {
  const db = getDb();
  const session = await getValidPaymentConnectivitySession({
    publicId: input.publicId,
    token: input.token,
  });
  if (session.networkDecision === "use_mobile") {
    throw new Error("Mobile network is sufficient; payment connectivity is not allowed for this session.");
  }
  const now = new Date();
  const deviceMismatch = (
    (session.deviceFingerprint && input.deviceFingerprint && session.deviceFingerprint !== input.deviceFingerprint)
    || (session.macAddress && input.macAddress && session.macAddress !== input.macAddress)
  );

  if (deviceMismatch) {
    await db.update(paymentConnectivitySessions)
      .set({ status: "rejected", lastSeenAt: now })
      .where(eq(paymentConnectivitySessions.id, session.id));
    throw new Error("Payment connectivity session is not valid for this device.");
  }

  await db.update(paymentConnectivitySessions)
    .set({
      status: "authorized",
      routerId: input.routerId ?? session.routerId,
      authorizedAt: session.authorizedAt ?? now,
      lastSeenAt: now,
    })
    .where(eq(paymentConnectivitySessions.id, session.id));

  return {
    id: session.id,
    publicId: session.publicId,
    merchantId: session.merchantId,
    branchId: session.branchId,
    paymentId: session.paymentId,
    amount: Number(session.amount),
    currency: session.currency,
    provider: session.gatewayProvider,
    expiresAt: session.expiresAt,
    allowedHosts: Array.isArray(session.allowedHosts)
      ? session.allowedHosts.filter((value): value is string => typeof value === "string")
      : getPaymentOnlyAllowedHosts(session.gatewayProvider),
  };
}

export async function updatePaymentConnectivityAccounting(input: {
  sessionId: number;
  status: "active" | "disconnected" | "expired";
}) {
  const db = getDb();
  const rows = await db.select()
    .from(paymentConnectivitySessions)
    .where(eq(paymentConnectivitySessions.id, input.sessionId))
    .limit(1);
  const session = rows.at(0);
  if (!session) {
    throw new Error("Payment connectivity session not found.");
  }

  const nextStatus = input.status === "active"
    ? session.status
    : input.status === "expired"
      ? "expired"
      : "destroyed";
  const now = new Date();
  await db.update(paymentConnectivitySessions)
    .set({
      status: nextStatus,
      destroyedAt: nextStatus === "destroyed" ? now : session.destroyedAt,
      lastSeenAt: now,
    })
    .where(and(eq(paymentConnectivitySessions.id, input.sessionId), eq(paymentConnectivitySessions.merchantId, session.merchantId)));

  return { ok: true, sessionId: input.sessionId, status: nextStatus };
}
