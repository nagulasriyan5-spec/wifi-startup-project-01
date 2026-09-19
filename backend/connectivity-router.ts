import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { paymentConnectivitySessions } from "@db/schema";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  assessPaymentConnectivity,
  createPaymentConnectivitySession,
  getPaymentOnlyAllowedHosts,
  getValidPaymentConnectivitySession,
} from "./lib/payment-connectivity";
import { createPaymentOrder } from "./payment-router";

const gatewayProviderSchema = z.enum(["razorpay", "phonepe", "cashfree"]);
const networkInputSchema = z.object({
  gatewayReachable: z.boolean().optional(),
  paymentAppReachable: z.boolean().optional(),
  rttMs: z.number().nonnegative().max(60_000).optional(),
  downlinkMbps: z.number().nonnegative().max(10_000).optional(),
  effectiveType: z.string().max(30).optional(),
  forcePaymentConnectivity: z.boolean().optional(),
});

function safeSession(session: typeof paymentConnectivitySessions.$inferSelect) {
  return {
    id: session.id,
    publicId: session.publicId,
    merchantId: session.merchantId,
    branchId: session.branchId,
    paymentId: session.paymentId,
    routerId: session.routerId,
    status: session.status,
    networkDecision: session.networkDecision,
    amount: Number(session.amount),
    currency: session.currency,
    gatewayProvider: session.gatewayProvider,
    allowedHosts: Array.isArray(session.allowedHosts)
      ? session.allowedHosts.filter((value): value is string => typeof value === "string")
      : getPaymentOnlyAllowedHosts(session.gatewayProvider),
    expiresAt: session.expiresAt,
    authorizedAt: session.authorizedAt,
    destroyedAt: session.destroyedAt,
    createdAt: session.createdAt,
  };
}

export const connectivityRouter = createRouter({
  assess: publicQuery
    .input(networkInputSchema.default({}))
    .query(({ input }) => assessPaymentConnectivity(input)),

  allowedHosts: publicQuery
    .input(z.object({ provider: gatewayProviderSchema.optional() }).default({}))
    .query(({ input }) => getPaymentOnlyAllowedHosts(input.provider)),

  createSession: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        branchId: z.number().optional(),
        amount: z.number().positive().max(100_000),
        currency: z.string().length(3).default("INR"),
        provider: gatewayProviderSchema.optional(),
        routerId: z.string().max(100).optional(),
        deviceFingerprint: z.string().max(255).optional(),
        macAddress: z.string().max(17).optional(),
        network: networkInputSchema.default({}),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const assessment = assessPaymentConnectivity(input.network);
      const session = await createPaymentConnectivitySession({
        merchantId: input.merchantId,
        branchId: input.branchId,
        amount: input.amount,
        currency: input.currency,
        provider: input.provider,
        routerId: input.routerId,
        deviceFingerprint: input.deviceFingerprint,
        macAddress: input.macAddress,
        assessment,
        metadata: input.metadata,
      });

      return {
        success: true,
        assessment,
        session,
      };
    }),

  getSession: publicQuery
    .input(
      z.object({
        publicId: z.string().min(1),
        token: z.string().min(16),
      }),
    )
    .query(async ({ input }) => {
      const session = await getValidPaymentConnectivitySession(input);
      return safeSession(session);
    }),

  createPayment: publicQuery
    .input(
      z.object({
        publicId: z.string().min(1),
        token: z.string().min(16),
        provider: gatewayProviderSchema.optional(),
        returnUrl: z.string().url().optional(),
        customerName: z.string().max(255).optional(),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().min(8).max(20).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const session = await getValidPaymentConnectivitySession(input);
      const payment = await createPaymentOrder({
        merchantId: session.merchantId,
        amount: Number(session.amount),
        paymentMethod: "upi",
        provider: input.provider ?? session.gatewayProvider ?? undefined,
        currency: session.currency,
        returnUrl: input.returnUrl,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        connectivitySessionId: input.publicId,
        connectivityToken: input.token,
        description: `Sriyan payment connectivity session ${session.publicId}`,
      });

      return {
        ...payment,
        connectivitySession: safeSession(session),
      };
    }),

  list: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).max(100_000).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select()
        .from(paymentConnectivitySessions)
        .where(eq(paymentConnectivitySessions.merchantId, input.merchantId))
        .orderBy(desc(paymentConnectivitySessions.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows.map(safeSession);
    }),
});
