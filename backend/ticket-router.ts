import { z } from "zod";
import { asc, eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  wifiTickets,
  wifiSessions,
  merchants,
  branches,
  payments,
} from "@db/schema";
import { appendLedgerEntry } from "./queries/ledger";
import { publishRealtimeEvent } from "./realtime";
import { generateOTP, generateTicketCode } from "./lib/ticket-codes";
import { getPaymentGatewayRuntimeStatus } from "./lib/payment-gateways";
import {
  evaluateTicketSessionAccess,
  normalizeDeviceIdentity,
} from "./lib/ticket-session-policy";

function normalizeTicketCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

const ticketStatusSchema = z.enum(["active", "used", "expired", "revoked"]);
const accessDecisionSchema = z.enum(["approved", "rejected"]);
const sessionStatusSchema = z.enum([
  "active",
  "paused",
  "expired",
  "disconnected",
]);

function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || undefined;
}

function getBranchAccessSsid(branch?: typeof branches.$inferSelect | null) {
  if (!branch) return "Sriyan_Guest";
  return branch.internetSource === "phone_hotspot"
    ? branch.hotspotSsid || branch.ssid || "Sriyan_Phone_Hotspot"
    : branch.ssid || "Sriyan_Guest";
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
    .orderBy(asc(branches.id))
    .limit(1);

  return branchRows.at(0) ?? null;
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

function accessApprovalPayload(ticket: typeof wifiTickets.$inferSelect) {
  return {
    accessApprovalStatus: ticket.accessApprovalStatus,
    accessApprovedAt: ticket.accessApprovedAt,
    accessRejectedAt: ticket.accessRejectedAt,
    accessDecisionReason: ticket.accessDecisionReason,
  };
}

export const ticketRouter = createRouter({
  // Generate a new WiFi ticket (QR or OTP)
  generate: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        branchId: z.number().optional(),
        type: z.enum(["qr", "otp"]),
        durationMinutes: z.number().min(5).max(1440).default(60),
        dataLimitMb: z.number().optional(),
        speedLimitMbps: z.number().optional(),
        maxDevices: z.number().min(1).max(10).default(1),
        price: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.price > 0) {
        const merchantRows = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, input.merchantId))
          .limit(1);
        const merchant = merchantRows.at(0);
        const gatewayStatus = getPaymentGatewayRuntimeStatus();
        const activeProvider = gatewayStatus.activeProvider;
        const isGatewayReady = activeProvider
          ? gatewayStatus.configured[activeProvider]
          : false;

        if (!isGatewayReady && !merchant?.upiId) {
          throw new Error(
            "Paid tokens need either a live payment gateway or a saved merchant UPI ID for manual confirmation."
          );
        }
      }

      const code =
        input.type === "otp" ? generateOTP() : generateTicketCode(12);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + input.durationMinutes * 60000);

      const result = await db.insert(wifiTickets).values({
        merchantId: input.merchantId,
        branchId: input.branchId,
        ticketCode: code,
        type: input.type,
        durationMinutes: input.durationMinutes,
        dataLimitMb: input.dataLimitMb,
        speedLimitMbps: input.speedLimitMbps,
        maxDevices: input.maxDevices,
        price: input.price.toFixed(2),
        accessApprovalStatus:
          input.price > 0 ? "waiting_merchant" : "auto_approved",
        expiresAt,
      });

      const ticketId = Number(result[0].insertId);

      await appendLedgerEntry({
        entityType: "ticket",
        entityId: ticketId,
        action: "CREATED",
        merchantId: input.merchantId,
        data: { ticketCode: code, type: input.type, price: input.price },
      });

      publishRealtimeEvent({
        topic: "ticket",
        action: "created",
        merchantId: input.merchantId,
        entityId: ticketId,
        data: { code, type: input.type },
      });

      return {
        success: true,
        ticket: {
          id: ticketId,
          code,
          type: input.type,
          expiresAt,
          durationMinutes: input.durationMinutes,
          price: input.price,
        },
      };
    }),

  // Get all tickets for a merchant
  list: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        status: ticketStatusSchema.optional(),
        limit: z.number().int().min(1).max(500).default(200),
        offset: z.number().int().min(0).max(100_000).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? and(
            eq(wifiTickets.merchantId, input.merchantId),
            eq(wifiTickets.status, input.status)
          )
        : eq(wifiTickets.merchantId, input.merchantId);

      return db
        .select()
        .from(wifiTickets)
        .where(where)
        .orderBy(desc(wifiTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Get recent tickets
  recent: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(wifiTickets)
        .where(eq(wifiTickets.merchantId, input.merchantId))
        .orderBy(desc(wifiTickets.createdAt))
        .limit(input.limit);
    }),

  // Get live sessions for a merchant
  sessions: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        status: sessionStatusSchema.optional(),
        limit: z.number().int().min(1).max(500).default(200),
        offset: z.number().int().min(0).max(100_000).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? and(
            eq(wifiSessions.merchantId, input.merchantId),
            eq(wifiSessions.status, input.status)
          )
        : eq(wifiSessions.merchantId, input.merchantId);
      const rows = await db
        .select({
          session: wifiSessions,
          ticket: wifiTickets,
          branch: branches,
        })
        .from(wifiSessions)
        .leftJoin(wifiTickets, eq(wifiSessions.ticketId, wifiTickets.id))
        .leftJoin(branches, eq(wifiSessions.branchId, branches.id))
        .where(where)
        .orderBy(desc(wifiSessions.startedAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map(({ session, ticket, branch }) => ({
        ...session,
        ticketCode: ticket?.ticketCode ?? null,
        durationMinutes: ticket?.durationMinutes ?? null,
        speedLimitMbps: ticket?.speedLimitMbps ?? branch?.bandwidthMbps ?? null,
        dataLimitMb: ticket?.dataLimitMb ?? null,
        ssid: branch ? getBranchAccessSsid(branch) : null,
        internetSource: branch?.internetSource ?? null,
        gatewayMode: branch?.gatewayMode ?? null,
      }));
    }),

  // Get ticket stats
  stats: authedQuery
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          total: sql<number>`COUNT(*)`,
          active: sql<number>`SUM(CASE WHEN ${wifiTickets.status} = 'active' THEN 1 ELSE 0 END)`,
          used: sql<number>`SUM(CASE WHEN ${wifiTickets.status} = 'used' THEN 1 ELSE 0 END)`,
          expired: sql<number>`SUM(CASE WHEN ${wifiTickets.status} = 'expired' THEN 1 ELSE 0 END)`,
          revoked: sql<number>`SUM(CASE WHEN ${wifiTickets.status} = 'revoked' THEN 1 ELSE 0 END)`,
        })
        .from(wifiTickets)
        .where(eq(wifiTickets.merchantId, input.merchantId));
      const stats = rows.at(0);

      return {
        total: Number(stats?.total ?? 0),
        active: Number(stats?.active ?? 0),
        used: Number(stats?.used ?? 0),
        expired: Number(stats?.expired ?? 0),
        revoked: Number(stats?.revoked ?? 0),
      };
    }),

  // ─── Public: Validate and activate a ticket ────────────────────────

  // Validate ticket code (for customer to connect)
  validate: publicQuery
    .input(
      z.object({
        code: z.string().min(1),
        deviceFingerprint: z.string().max(255).optional(),
        macAddress: z.string().max(17).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const now = new Date();
      const code = normalizeTicketCode(input.code);

      const rows = await db
        .select()
        .from(wifiTickets)
        .where(eq(wifiTickets.ticketCode, code))
        .limit(1);

      const ticket = rows.at(0);
      if (!ticket) {
        return { success: false, error: "Invalid ticket code" };
      }

      const branch = await getTicketBranch(ticket);

      const toSessionPayload = (sessionId: number, startedAt: Date) => ({
        id: sessionId,
        merchantId: ticket.merchantId,
        branchId: ticket.branchId ?? branch?.id ?? null,
        durationMinutes: ticket.durationMinutes,
        dataLimitMb: ticket.dataLimitMb,
        speedLimitMbps: ticket.speedLimitMbps ?? branch?.bandwidthMbps ?? null,
        startedAt,
        ssid: getBranchAccessSsid(branch),
        internetSource: branch?.internetSource ?? "router_wifi",
        gatewayMode: branch?.gatewayMode ?? "captive_portal",
        routerIp: branch?.routerIp ?? null,
        routerBrand: branch?.routerBrand ?? null,
        routerModel: branch?.routerModel ?? null,
        hotspotSsid: branch?.hotspotSsid ?? null,
        hotspotDeviceName: branch?.hotspotDeviceName ?? null,
        hotspotOwnerPhone: branch?.hotspotOwnerPhone ?? null,
      });

      if (
        ticket.status === "expired" ||
        (ticket.expiresAt && ticket.expiresAt < now)
      ) {
        await db
          .update(wifiTickets)
          .set({ status: "expired" })
          .where(eq(wifiTickets.id, ticket.id));
        publishRealtimeEvent({
          topic: "ticket",
          action: "expired",
          merchantId: ticket.merchantId,
          entityId: ticket.id,
          data: { code },
        });
        return { success: false, error: "Ticket has expired" };
      }

      if (ticket.status === "revoked") {
        return { success: false, error: "Ticket has been revoked" };
      }

      if (Number(ticket.price ?? 0) > 0) {
        const isPaid = await hasSuccessfulTicketPayment(ticket.id);
        if (!isPaid) {
          return {
            success: false,
            error:
              "Payment pending. Complete the gateway payment before connecting.",
            paymentRequired: true,
            ticket: {
              code,
              price: Number(ticket.price),
              currency: ticket.currency ?? "INR",
              durationMinutes: ticket.durationMinutes,
            },
            ...accessApprovalPayload(ticket),
          };
        }
      }

      if (ticket.accessApprovalStatus === "waiting_merchant") {
        return {
          success: false,
          error:
            "Payment received. Waiting for the merchant to continue sharing network access.",
          accessPending: true,
          ticket: {
            code,
            price: Number(ticket.price ?? 0),
            currency: ticket.currency ?? "INR",
            durationMinutes: ticket.durationMinutes,
          },
          ...accessApprovalPayload(ticket),
        };
      }

      if (ticket.accessApprovalStatus === "rejected") {
        return {
          success: false,
          error:
            ticket.accessDecisionReason ||
            "The merchant stopped network sharing for this ticket.",
          accessRejected: true,
          ...accessApprovalPayload(ticket),
        };
      }

      const deviceIdentity = normalizeDeviceIdentity({
        deviceFingerprint: input.deviceFingerprint,
        macAddress: input.macAddress,
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

      if (access.existingActiveSession) {
        return {
          success: true,
          session: toSessionPayload(
            access.existingActiveSession.id,
            access.existingActiveSession.startedAt
          ),
        };
      }

      if (!access.allow) {
        await db
          .update(wifiTickets)
          .set({ status: "used", usedAt: ticket.usedAt ?? now })
          .where(eq(wifiTickets.id, ticket.id));

        return { success: false, error: access.reason };
      }

      // Create session
      const sessionResult = await db.insert(wifiSessions).values({
        ticketId: ticket.id,
        merchantId: ticket.merchantId,
        branchId: ticket.branchId ?? branch?.id,
        deviceFingerprint: input.deviceFingerprint,
        macAddress: input.macAddress,
        ipAddress: getRequestIp(ctx.req.headers),
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
        action: "ACTIVATED",
        merchantId: ticket.merchantId,
        data: {
          ticketCode: code,
          ticketId: ticket.id,
          branchId: ticket.branchId ?? branch?.id ?? null,
          deviceFingerprint: input.deviceFingerprint,
        },
      });

      publishRealtimeEvent({
        topic: "ticket",
        action: access.shouldMarkUsed ? "used" : "activated",
        merchantId: ticket.merchantId,
        entityId: ticket.id,
        data: { code },
      });
      publishRealtimeEvent({
        topic: "session",
        action: "activated",
        merchantId: ticket.merchantId,
        entityId: sessionId,
        data: {
          ticketId: ticket.id,
          branchId: ticket.branchId ?? branch?.id ?? null,
        },
      });

      return {
        success: true,
        session: toSessionPayload(sessionId, now),
      };
    }),

  // ─── Public: Get ticket info (for QR display) ──────────────────────

  getByCode: publicQuery
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(wifiTickets)
        .where(eq(wifiTickets.ticketCode, input.code))
        .limit(1);

      const ticket = rows.at(0);
      if (!ticket) return null;

      // Get merchant info
      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, ticket.merchantId))
        .limit(1);

      return {
        ...ticket,
        merchant: merchantRows.at(0) || null,
      };
    }),

  paymentStatus: publicQuery
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = getDb();
      const code = normalizeTicketCode(input.code);
      const rows = await db
        .select()
        .from(wifiTickets)
        .where(eq(wifiTickets.ticketCode, code))
        .limit(1);

      const ticket = rows.at(0);
      if (!ticket) return null;

      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, ticket.merchantId))
        .limit(1);
      const branch = await getTicketBranch(ticket);
      const merchant = merchantRows.at(0);

      const paid =
        Number(ticket.price ?? 0) <= 0 ||
        (await hasSuccessfulTicketPayment(ticket.id));

      return {
        code,
        ticketId: ticket.id,
        paid,
        price: Number(ticket.price ?? 0),
        currency: ticket.currency ?? "INR",
        status: ticket.status,
        ...accessApprovalPayload(ticket),
        durationMinutes: ticket.durationMinutes,
        merchantName: merchant?.businessName ?? "Sriyan WiFi",
        payment: {
          upiId: merchant?.upiId ?? null,
          settlementAccountName:
            merchant?.settlementAccountName ?? merchant?.businessName ?? null,
          settlementPhone: merchant?.settlementPhone ?? null,
          settlementVerified: merchant?.settlementVerified ?? false,
        },
        hotspot: {
          ssid: getBranchAccessSsid(branch),
          routerSsid: branch?.ssid ?? null,
          internetSource: branch?.internetSource ?? "router_wifi",
          gatewayMode: branch?.gatewayMode ?? "captive_portal",
          routerIp: branch?.routerIp ?? null,
          routerBrand: branch?.routerBrand ?? null,
          routerModel: branch?.routerModel ?? null,
          hotspotSsid: branch?.hotspotSsid ?? null,
          hotspotDeviceName: branch?.hotspotDeviceName ?? null,
          hotspotOwnerPhone: branch?.hotspotOwnerPhone ?? null,
          bandwidthMbps: ticket.speedLimitMbps ?? branch?.bandwidthMbps ?? null,
        },
      };
    }),

  pendingAccessApprovals: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        limit: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ input, ctx }) => {
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

      const rows = await db
        .select({ ticket: wifiTickets, payment: payments, branch: branches })
        .from(wifiTickets)
        .leftJoin(
          payments,
          and(
            eq(payments.ticketId, wifiTickets.id),
            eq(payments.status, "success")
          )
        )
        .leftJoin(branches, eq(branches.id, wifiTickets.branchId))
        .where(
          and(
            eq(wifiTickets.merchantId, input.merchantId),
            eq(wifiTickets.accessApprovalStatus, "waiting_merchant"),
            eq(wifiTickets.status, "active"),
            eq(payments.status, "success")
          )
        )
        .orderBy(desc(wifiTickets.createdAt))
        .limit(input.limit);

      return rows.map(({ ticket, payment, branch }) => ({
        ticketId: ticket.id,
        code: ticket.ticketCode,
        type: ticket.type,
        price: Number(ticket.price ?? 0),
        currency: ticket.currency ?? "INR",
        durationMinutes: ticket.durationMinutes,
        createdAt: ticket.createdAt,
        expiresAt: ticket.expiresAt,
        paidAt: payment?.createdAt ?? null,
        paymentId: payment?.id ?? null,
        transactionId: payment?.transactionId ?? null,
        gatewayProvider: payment?.gatewayProvider ?? null,
        gatewayPaymentId: payment?.gatewayPaymentId ?? null,
        scanner: payment?.metadata,
        hotspot: {
          ssid: getBranchAccessSsid(branch),
          internetSource: branch?.internetSource ?? "router_wifi",
          gatewayMode: branch?.gatewayMode ?? "captive_portal",
          routerIp: branch?.routerIp ?? null,
          routerBrand: branch?.routerBrand ?? null,
          routerModel: branch?.routerModel ?? null,
          hotspotDeviceName: branch?.hotspotDeviceName ?? null,
        },
      }));
    }),

  decideAccess: authedQuery
    .input(
      z.object({
        ticketId: z.number(),
        decision: accessDecisionSchema,
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select({ ticket: wifiTickets, merchant: merchants })
        .from(wifiTickets)
        .leftJoin(merchants, eq(merchants.id, wifiTickets.merchantId))
        .where(eq(wifiTickets.id, input.ticketId))
        .limit(1);
      const row = rows.at(0);
      if (!row?.ticket) {
        throw new Error("Ticket not found.");
      }
      if (!canManageMerchant(ctx.user, row.merchant)) {
        throw new Error("You cannot manage this ticket.");
      }

      const now = new Date();
      await db
        .update(wifiTickets)
        .set({
          accessApprovalStatus: input.decision,
          accessApprovedAt: input.decision === "approved" ? now : null,
          accessRejectedAt: input.decision === "rejected" ? now : null,
          accessDecisionReason:
            input.decision === "rejected"
              ? (input.reason ?? "Merchant stopped sharing network access.")
              : null,
          ...(input.decision === "rejected"
            ? { status: "revoked" as const }
            : {}),
        })
        .where(eq(wifiTickets.id, input.ticketId));

      await appendLedgerEntry({
        entityType: "ticket",
        entityId: row.ticket.id,
        action:
          input.decision === "approved" ? "ACCESS_APPROVED" : "ACCESS_REJECTED",
        merchantId: row.ticket.merchantId,
        data: {
          ticketCode: row.ticket.ticketCode,
          reason: input.reason,
          decidedBy: ctx.user.id,
        },
      });

      publishRealtimeEvent({
        topic: "ticket",
        action:
          input.decision === "approved" ? "access_approved" : "access_rejected",
        merchantId: row.ticket.merchantId,
        entityId: row.ticket.id,
        data: {
          code: row.ticket.ticketCode,
          reason: input.reason,
        },
      });

      return {
        success: true,
        ticketId: row.ticket.id,
        code: row.ticket.ticketCode,
        accessApprovalStatus: input.decision,
      };
    }),

  // Revoke a ticket
  revoke: authedQuery
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(wifiTickets)
        .set({ status: "revoked" })
        .where(eq(wifiTickets.id, input.ticketId));

      const rows = await db
        .select()
        .from(wifiTickets)
        .where(eq(wifiTickets.id, input.ticketId))
        .limit(1);
      const ticket = rows.at(0);

      await appendLedgerEntry({
        entityType: "ticket",
        entityId: input.ticketId,
        action: "REVOKED",
        merchantId: ticket?.merchantId,
      });

      publishRealtimeEvent({
        topic: "ticket",
        action: "revoked",
        merchantId: ticket?.merchantId,
        entityId: input.ticketId,
      });

      return { success: true };
    }),
});
