import { z } from "zod";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { analytics, wifiTickets, wifiSessions, payments } from "@db/schema";

export const analyticsRouter = createRouter({
  // Record analytics event
  record: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        branchId: z.number().optional(),
        totalSessions: z.number().optional(),
        totalRevenue: z.number().optional(),
        totalDataUsedMb: z.number().optional(),
        avgSessionDuration: z.number().optional(),
        peakHour: z.number().optional(),
        uniqueDevices: z.number().optional(),
        ticketsGenerated: z.number().optional(),
        ticketsUsed: z.number().optional(),
        failedConnections: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(analytics).values({
        merchantId: input.merchantId,
        branchId: input.branchId,
        totalSessions: input.totalSessions,
        totalRevenue: input.totalRevenue?.toFixed(2),
        totalDataUsedMb: input.totalDataUsedMb?.toFixed(2),
        avgSessionDuration: input.avgSessionDuration,
        peakHour: input.peakHour,
        uniqueDevices: input.uniqueDevices,
        ticketsGenerated: input.ticketsGenerated,
        ticketsUsed: input.ticketsUsed,
        failedConnections: input.failedConnections,
      });
      return { success: true };
    }),

  // Get merchant analytics
  getByMerchant: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        days: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await db.select()
        .from(analytics)
        .where(
          and(
            eq(analytics.merchantId, input.merchantId),
            gte(analytics.createdAt, since)
          )
        )
        .orderBy(desc(analytics.createdAt));

      // Aggregate stats
      const totalSessions = rows.reduce((s, r) => s + (r.totalSessions || 0), 0);
      const totalRevenue = rows.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
      const totalDataUsed = rows.reduce((s, r) => s + Number(r.totalDataUsedMb || 0), 0);
      const avgDuration = rows.length > 0
        ? rows.reduce((s, r) => s + (r.avgSessionDuration || 0), 0) / rows.length
        : 0;

      return {
        daily: rows,
        summary: {
          totalSessions,
          totalRevenue,
          totalDataUsed,
          avgDuration: Math.round(avgDuration),
          totalDays: input.days,
        },
      };
    }),

  // Get dashboard KPIs
  kpis: authedQuery
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();

      const [ticketRows, sessionRows, paymentRows] = await Promise.all([
        db.select({
          totalTickets: sql<number>`COUNT(*)`,
          usedTickets: sql<number>`SUM(CASE WHEN ${wifiTickets.status} = 'used' THEN 1 ELSE 0 END)`,
        })
          .from(wifiTickets)
          .where(eq(wifiTickets.merchantId, input.merchantId)),
        db.select({
          activeNow: sql<number>`SUM(CASE WHEN ${wifiSessions.status} = 'active' THEN 1 ELSE 0 END)`,
          totalSessions: sql<number>`COUNT(*)`,
        })
          .from(wifiSessions)
          .where(eq(wifiSessions.merchantId, input.merchantId)),
        db.select({
          totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'success' THEN CAST(${payments.amount} AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        })
          .from(payments)
          .where(eq(payments.merchantId, input.merchantId)),
      ]);

      const ticketStats = ticketRows.at(0);
      const sessionStats = sessionRows.at(0);
      const paymentStats = paymentRows.at(0);
      const totalRevenue = Number(paymentStats?.totalRevenue ?? 0);
      const activeNow = Number(sessionStats?.activeNow ?? 0);
      const totalSessions = Number(sessionStats?.totalSessions ?? 0);
      const totalTickets = Number(ticketStats?.totalTickets ?? 0);
      const usedTickets = Number(ticketStats?.usedTickets ?? 0);

      return {
        totalRevenue,
        activeNow,
        totalSessions,
        totalTickets,
        usedTickets,
        conversionRate: totalTickets > 0 ? Math.round((usedTickets / totalTickets) * 100) : 0,
      };
    }),

  // Get peak hours data
  peakHours: authedQuery
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const hourExpr = sql<number>`HOUR(${wifiSessions.startedAt})`;
      const rows = await db.select({
        hour: hourExpr,
        count: sql<number>`COUNT(*)`,
      })
        .from(wifiSessions)
        .where(eq(wifiSessions.merchantId, input.merchantId))
        .groupBy(hourExpr);

      const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${i}:00`,
        count: 0,
      }));

      rows.forEach((row) => {
        const hour = Number(row.hour);
        if (hour >= 0 && hour < hours.length) {
          hours[hour].count = Number(row.count ?? 0);
        }
      });

      return hours;
    }),
});
