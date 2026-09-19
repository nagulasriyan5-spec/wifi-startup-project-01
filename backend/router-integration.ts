import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { branches, payments, wifiSessions, wifiTickets } from "@db/schema";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { appendLedgerEntry } from "./queries/ledger";
import { publishRealtimeEvent } from "./realtime";
import {
  evaluateTicketSessionAccess,
  normalizeDeviceIdentity,
} from "./lib/ticket-session-policy";
import {
  authorizePaymentConnectivitySession,
  updatePaymentConnectivityAccounting,
} from "./lib/payment-connectivity";
import { verifyRouterRequestSignature } from "./lib/router-request-signing";

type RouterBindings = {
  Bindings: HttpBindings;
  Variables: {
    rawBody: string;
  };
};

function normalizeTicketCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || undefined;
}

function verifyRouterSecret(headers: Headers) {
  const auth = headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const secret = headers.get("x-router-secret") || token;
  return Boolean(
    env.routerIntegrationSecret && secret === env.routerIntegrationSecret
  );
}

async function parseJsonBody(c: Context<RouterBindings>) {
  const cached = c.get("rawBody");
  try {
    const rawBody = cached ?? (await c.req.text());
    if (!cached) c.set("rawBody", rawBody);
    return JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
}

function reject(reason: string) {
  return {
    accept: false,
    decision: "reject",
    reason,
    "control:Auth-Type": "Reject",
    "reply:Reply-Message": reason,
    reply: {
      "Reply-Message": reason,
    },
  };
}

function stringField(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberField(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function radiusClassForSession(sessionId: number) {
  return `sriyan:session:${sessionId}`;
}

function sessionIdFromRadiusClass(value: string) {
  const match = value.match(/sriyan:session:(\d+)/i);
  if (!match) return undefined;
  const sessionId = Number(match[1]);
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : undefined;
}

function paymentConnectivitySessionIdFromRadiusClass(value: string) {
  const match = value.match(/sriyan:payment-connectivity:(\d+)/i);
  if (!match) return undefined;
  const sessionId = Number(match[1]);
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : undefined;
}

function getBranchAccessSsid(branch?: typeof branches.$inferSelect | null) {
  if (!branch) return "Sriyan_Guest";
  return branch.internetSource === "phone_hotspot"
    ? branch.hotspotSsid || branch.ssid || "Sriyan_Phone_Hotspot"
    : branch.ssid || "Sriyan_Guest";
}

function toRouterAcceptResponse(input: {
  sessionId: number;
  ticket: typeof wifiTickets.$inferSelect;
  branch?: typeof branches.$inferSelect | null;
}) {
  const bandwidthMbps =
    input.ticket.speedLimitMbps ?? input.branch?.bandwidthMbps ?? 100;

  return {
    accept: true,
    decision: "accept",
    sessionId: input.sessionId,
    ticketId: input.ticket.id,
    merchantId: input.ticket.merchantId,
    branchId: input.ticket.branchId ?? input.branch?.id ?? null,
    ssid: getBranchAccessSsid(input.branch),
    sessionTimeoutSeconds: input.ticket.durationMinutes * 60,
    bandwidthMbps,
    dataLimitMb: input.ticket.dataLimitMb,
    "control:Auth-Type": "Accept",
    "reply:Session-Timeout": input.ticket.durationMinutes * 60,
    "reply:Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
    "reply:WISPr-Bandwidth-Max-Up": bandwidthMbps * 1_000_000,
    "reply:WISPr-Bandwidth-Max-Down": bandwidthMbps * 1_000_000,
    "reply:Reply-Message": "Sriyan access granted",
    "reply:Class": radiusClassForSession(input.sessionId),
    radiusReply: {
      "Session-Timeout": input.ticket.durationMinutes * 60,
      "Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
      "WISPr-Bandwidth-Max-Up": bandwidthMbps * 1_000_000,
      "WISPr-Bandwidth-Max-Down": bandwidthMbps * 1_000_000,
      "Reply-Message": "Sriyan access granted",
      Class: radiusClassForSession(input.sessionId),
    },
    reply: {
      "Session-Timeout": input.ticket.durationMinutes * 60,
      "Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
      "WISPr-Bandwidth-Max-Up": bandwidthMbps * 1_000_000,
      "WISPr-Bandwidth-Max-Down": bandwidthMbps * 1_000_000,
      "Reply-Message": "Sriyan access granted",
      Class: radiusClassForSession(input.sessionId),
    },
  };
}

function toPaymentConnectivityAcceptResponse(
  input: Awaited<ReturnType<typeof authorizePaymentConnectivitySession>>
) {
  const now = Date.now();
  const sessionTimeoutSeconds = Math.max(
    1,
    Math.floor((input.expiresAt.getTime() - now) / 1000)
  );
  const bandwidthMbps = env.paymentConnectivityBandwidthMbps;
  const classValue = `sriyan:payment-connectivity:${input.id}`;

  return {
    accept: true,
    decision: "accept",
    mode: "payment_connectivity",
    paymentOnly: true,
    publicInternetAllowed: false,
    sessionId: input.id,
    publicId: input.publicId,
    merchantId: input.merchantId,
    branchId: input.branchId,
    paymentId: input.paymentId,
    amount: input.amount,
    currency: input.currency,
    provider: input.provider,
    expiresAt: input.expiresAt,
    sessionTimeoutSeconds,
    bandwidthMbps,
    allowedHosts: input.allowedHosts,
    "control:Auth-Type": "Accept",
    "reply:Session-Timeout": sessionTimeoutSeconds,
    "reply:Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
    "reply:Filter-Id": "sriyan-payment-only",
    "reply:Reply-Message": "Sriyan payment-only connectivity granted",
    "reply:Class": classValue,
    radiusReply: {
      "Session-Timeout": sessionTimeoutSeconds,
      "Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
      "Filter-Id": "sriyan-payment-only",
      "Reply-Message": "Sriyan payment-only connectivity granted",
      Class: classValue,
    },
    reply: {
      "Session-Timeout": sessionTimeoutSeconds,
      "Mikrotik-Rate-Limit": `${bandwidthMbps}M/${bandwidthMbps}M`,
      "Filter-Id": "sriyan-payment-only",
      "Reply-Message": "Sriyan payment-only connectivity granted",
      Class: classValue,
    },
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

async function getTicketBranch(ticket: typeof wifiTickets.$inferSelect) {
  const db = getDb();
  if (ticket.branchId) {
    const branchRows = await db
      .select()
      .from(branches)
      .where(eq(branches.id, ticket.branchId))
      .limit(1);
    const branch = branchRows.at(0);
    if (branch) return branch;
  }

  const branchRows = await db
    .select()
    .from(branches)
    .where(eq(branches.merchantId, ticket.merchantId))
    .limit(1);
  return branchRows.at(0) ?? null;
}

export const routerIntegrationApp = new Hono<RouterBindings>();

routerIntegrationApp.use("*", async (c, next) => {
  if (!verifyRouterSecret(c.req.raw.headers)) {
    return c.json({ error: "Invalid router integration secret" }, 401);
  }
  const rawBody =
    c.req.method === "GET" || c.req.method === "HEAD" ? "" : await c.req.text();
  c.set("rawBody", rawBody);
  const signature = verifyRouterRequestSignature({
    headers: c.req.raw.headers,
    method: c.req.method,
    url: c.req.url,
    rawBody,
  });
  if (!signature.ok) {
    return c.json(
      { error: signature.error ?? "Invalid router request signature" },
      401
    );
  }
  await next();
});

routerIntegrationApp.get("/health", c =>
  c.json({
    ok: true,
    service: "sriyan-router-integration",
    supportedControllers: ["mikrotik", "openwrt", "freeradius", "cloud_agent"],
    ts: Date.now(),
  })
);

routerIntegrationApp.get("/config/:branchId", async c => {
  const branchId = Number(c.req.param("branchId"));
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return c.json({ error: "branchId must be a positive integer" }, 400);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  const branch = rows.at(0);
  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  return c.json({
    branchId: branch.id,
    merchantId: branch.merchantId,
    controllerType: branch.controllerType,
    controllerEndpoint: branch.controllerEndpoint,
    gatewayMode: branch.gatewayMode,
    ssid: getBranchAccessSsid(branch),
    bandwidthMbps: branch.bandwidthMbps ?? 100,
    captivePortalUrl: `${env.publicAppUrl.replace(/\/$/, "")}/hotspot`,
    authorizeUrl: `${env.publicAppUrl.replace(/\/$/, "")}/api/router/authorize`,
    accountingUrl: `${env.publicAppUrl.replace(/\/$/, "")}/api/router/accounting`,
    paymentConnectivityAuthorizeUrl: `${env.publicAppUrl.replace(/\/$/, "")}/api/router/payment-connectivity/authorize`,
    paymentConnectivityAccountingUrl: `${env.publicAppUrl.replace(/\/$/, "")}/api/router/payment-connectivity/accounting`,
  });
});

routerIntegrationApp.post("/payment-connectivity/authorize", async c => {
  const body = await parseJsonBody(c);
  if (!body) {
    return c.json({ error: "JSON body is required" }, 400);
  }

  const publicId = stringField(body, [
    "publicId",
    "connectivitySessionId",
    "paymentConnectivitySessionId",
    "username",
    "User-Name",
  ]);
  const token = stringField(body, [
    "token",
    "sessionToken",
    "password",
    "User-Password",
  ]);
  if (!publicId || !token) {
    return c.json(
      reject("Payment connectivity session id and token are required"),
      200
    );
  }

  try {
    const session = await authorizePaymentConnectivitySession({
      publicId,
      token,
      routerId:
        stringField(body, ["routerId", "NAS-Identifier", "nasIdentifier"]) ||
        undefined,
      deviceFingerprint: stringField(body, ["deviceFingerprint"]) || undefined,
      macAddress:
        stringField(body, [
          "macAddress",
          "callingStationId",
          "Calling-Station-Id",
        ]) || undefined,
    });
    return c.json(toPaymentConnectivityAcceptResponse(session));
  } catch (error) {
    return c.json(
      reject(
        error instanceof Error ? error.message : "Payment connectivity rejected"
      ),
      200
    );
  }
});

routerIntegrationApp.post("/authorize", async c => {
  const body = await parseJsonBody(c);
  if (!body) {
    return c.json({ error: "JSON body is required" }, 400);
  }

  const code =
    typeof body.code === "string"
      ? normalizeTicketCode(body.code)
      : typeof body.username === "string"
        ? normalizeTicketCode(body.username)
        : "";
  if (!code) {
    return c.json(reject("Ticket code is required"), 200);
  }

  const db = getDb();
  const ticketRows = await db
    .select()
    .from(wifiTickets)
    .where(eq(wifiTickets.ticketCode, code))
    .limit(1);
  const ticket = ticketRows.at(0);
  if (!ticket) {
    return c.json(reject("Ticket not found"), 200);
  }

  const now = new Date();
  if (ticket.status === "revoked") {
    return c.json(reject("Ticket revoked"), 200);
  }
  if (
    ticket.status === "expired" ||
    (ticket.expiresAt && ticket.expiresAt < now)
  ) {
    await db
      .update(wifiTickets)
      .set({ status: "expired" })
      .where(eq(wifiTickets.id, ticket.id));
    return c.json(reject("Ticket expired"), 200);
  }
  if (
    Number(ticket.price ?? 0) > 0 &&
    !(await hasSuccessfulTicketPayment(ticket.id))
  ) {
    return c.json(reject("Payment pending"), 200);
  }
  if (ticket.accessApprovalStatus === "waiting_merchant") {
    return c.json(reject("Merchant approval pending"), 200);
  }
  if (ticket.accessApprovalStatus === "rejected") {
    return c.json(reject("Merchant stopped sharing network access"), 200);
  }

  const macAddress =
    typeof body.macAddress === "string"
      ? body.macAddress
      : typeof body.callingStationId === "string"
        ? body.callingStationId
        : undefined;
  const deviceFingerprint =
    typeof body.deviceFingerprint === "string"
      ? body.deviceFingerprint
      : macAddress;
  const deviceIdentity = normalizeDeviceIdentity({
    deviceFingerprint,
    macAddress,
  });
  const sessionRows = await db
    .select()
    .from(wifiSessions)
    .where(eq(wifiSessions.ticketId, ticket.id));
  const access = evaluateTicketSessionAccess({
    sessions: sessionRows,
    maxDevices: ticket.maxDevices,
    deviceIdentity,
    ticketStatus: ticket.status,
  });
  const branch = await getTicketBranch(ticket);

  if (access.existingActiveSession) {
    return c.json(
      toRouterAcceptResponse({
        sessionId: access.existingActiveSession.id,
        ticket,
        branch,
      })
    );
  }

  if (!access.allow) {
    await db
      .update(wifiTickets)
      .set({ status: "used", usedAt: ticket.usedAt ?? now })
      .where(eq(wifiTickets.id, ticket.id));
    return c.json(reject(access.reason ?? "Ticket device limit reached"), 200);
  }

  const sessionResult = await db.insert(wifiSessions).values({
    ticketId: ticket.id,
    merchantId: ticket.merchantId,
    branchId: ticket.branchId ?? branch?.id,
    deviceFingerprint,
    macAddress,
    ipAddress:
      typeof body.ipAddress === "string"
        ? body.ipAddress
        : getRequestIp(c.req.raw.headers),
  });
  const sessionId = Number(sessionResult[0].insertId);
  if (access.shouldMarkUsed) {
    await db
      .update(wifiTickets)
      .set({ status: "used", usedAt: now })
      .where(eq(wifiTickets.id, ticket.id));
  }

  await appendLedgerEntry({
    entityType: "session",
    entityId: sessionId,
    action: "ROUTER_AUTHORIZED",
    merchantId: ticket.merchantId,
    data: {
      ticketCode: code,
      controllerType: branch?.controllerType ?? "manual",
      branchId: ticket.branchId ?? branch?.id ?? null,
      macAddress,
    },
  });

  publishRealtimeEvent({
    topic: "session",
    action: "router_authorized",
    merchantId: ticket.merchantId,
    entityId: sessionId,
    data: {
      ticketId: ticket.id,
      branchId: ticket.branchId ?? branch?.id ?? null,
    },
  });

  return c.json(toRouterAcceptResponse({ sessionId, ticket, branch }));
});

routerIntegrationApp.post("/accounting", async c => {
  const body = await parseJsonBody(c);
  if (!body) {
    return c.json({ error: "JSON body is required" }, 400);
  }

  const classValue = stringField(body, [
    "Class",
    "class",
    "replyClass",
    "reply:Class",
    "control:Class",
  ]);
  const sessionIdCandidate =
    Number(body.sessionId) || sessionIdFromRadiusClass(classValue);
  if (
    typeof sessionIdCandidate !== "number" ||
    !Number.isInteger(sessionIdCandidate) ||
    sessionIdCandidate <= 0
  ) {
    return c.json({ error: "sessionId must be a positive integer" }, 400);
  }
  const sessionId = sessionIdCandidate;

  const status =
    stringField(body, [
      "status",
      "Acct-Status-Type",
      "acctStatusType",
      "acct_status_type",
    ]).toLowerCase() || "active";
  const explicitDataUsedMb = numberField(body, ["dataUsedMb", "data_used_mb"]);
  const inputOctets = numberField(body, [
    "Acct-Input-Octets",
    "acctInputOctets",
    "inputOctets",
  ]);
  const outputOctets = numberField(body, [
    "Acct-Output-Octets",
    "acctOutputOctets",
    "outputOctets",
  ]);
  const inputGigawords =
    numberField(body, ["Acct-Input-Gigawords", "acctInputGigawords"]) ?? 0;
  const outputGigawords =
    numberField(body, ["Acct-Output-Gigawords", "acctOutputGigawords"]) ?? 0;
  const radiusBytes =
    inputOctets !== undefined || outputOctets !== undefined
      ? inputGigawords * 2 ** 32 +
        (inputOctets ?? 0) +
        (outputGigawords * 2 ** 32 + (outputOctets ?? 0))
      : undefined;
  const dataUsedMb =
    explicitDataUsedMb ??
    (radiusBytes !== undefined ? radiusBytes / (1024 * 1024) : 0);
  const endedStatuses = new Set(["stop", "stopped", "expired", "disconnected"]);
  const nextStatus = endedStatuses.has(status) ? "disconnected" : "active";

  const db = getDb();
  const rows = await db
    .select()
    .from(wifiSessions)
    .where(eq(wifiSessions.id, sessionId))
    .limit(1);
  const session = rows.at(0);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  await db
    .update(wifiSessions)
    .set({
      dataUsedMb: Number.isFinite(dataUsedMb)
        ? dataUsedMb.toFixed(2)
        : session.dataUsedMb,
      status: nextStatus,
      endedAt: nextStatus === "disconnected" ? new Date() : session.endedAt,
    })
    .where(
      and(
        eq(wifiSessions.id, sessionId),
        eq(wifiSessions.merchantId, session.merchantId)
      )
    );

  publishRealtimeEvent({
    topic: "session",
    action: "accounting",
    merchantId: session.merchantId,
    entityId: session.id,
    data: { status: nextStatus, dataUsedMb },
  });

  return c.json({
    ok: true,
    sessionId,
    status: nextStatus,
  });
});

routerIntegrationApp.post("/payment-connectivity/accounting", async c => {
  const body = await parseJsonBody(c);
  if (!body) {
    return c.json({ error: "JSON body is required" }, 400);
  }

  const classValue = stringField(body, [
    "Class",
    "class",
    "replyClass",
    "reply:Class",
    "control:Class",
  ]);
  const sessionIdCandidate =
    Number(body.sessionId) ||
    paymentConnectivitySessionIdFromRadiusClass(classValue);
  if (
    typeof sessionIdCandidate !== "number" ||
    !Number.isInteger(sessionIdCandidate) ||
    sessionIdCandidate <= 0
  ) {
    return c.json({ error: "sessionId must be a positive integer" }, 400);
  }

  const status = stringField(body, [
    "status",
    "Acct-Status-Type",
    "acctStatusType",
    "acct_status_type",
  ]).toLowerCase();
  const endedStatuses = new Set(["stop", "stopped", "disconnected"]);
  const expiredStatuses = new Set(["expired", "timeout"]);
  const normalizedStatus = expiredStatuses.has(status)
    ? "expired"
    : endedStatuses.has(status)
      ? "disconnected"
      : "active";

  try {
    const result = await updatePaymentConnectivityAccounting({
      sessionId: sessionIdCandidate,
      status: normalizedStatus,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment connectivity accounting failed",
      },
      404
    );
  }
});
