import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { merchants, branches, users } from "@db/schema";
import { getFirstMerchantOrNull } from "./queries/local-data";
import { publishRealtimeEvent } from "./realtime";

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

export const merchantRouter = createRouter({
  publicDefault: publicQuery.query(async () => {
    return getFirstMerchantOrNull();
  }),

  // Create merchant profile
  create: authedQuery
    .input(
      z.object({
        businessName: z.string().min(1).max(255),
        businessType: z.enum([
          "tea_shop", "restaurant", "hotel", "pg_hostel", "library",
          "school", "college", "coworking", "hospital", "railway_station",
          "bus_station", "apartment", "marriage_hall", "government_office",
          "public_wifi", "shopping_mall", "corporate_office", "airport", "other"
        ]),
        gstNumber: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        primaryColor: z.string().optional(),
        upiId: z.string().max(120).optional(),
        settlementAccountName: z.string().max(255).optional(),
        settlementPhone: z.string().max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;
      const db = getDb();

      // Update user role to merchant
      await db.update(users)
        .set({ role: "merchant" })
        .where(eq(users.id, user.id));

      const result = await db.insert(merchants).values({
        userId: user.id,
        businessName: input.businessName,
        businessType: input.businessType,
        gstNumber: input.gstNumber,
        address: input.address,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        primaryColor: input.primaryColor || "#6366f1",
        upiId: input.upiId,
        settlementAccountName: input.settlementAccountName,
        settlementPhone: input.settlementPhone,
        settlementVerified: Boolean(input.upiId),
      });

      const merchantId = Number(result[0].insertId);
      publishRealtimeEvent({
        topic: "merchant",
        action: "created",
        merchantId,
        entityId: merchantId,
      });

      return { success: true, merchantId };
    }),

  // Get merchant by user ID
  getByUser: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select()
      .from(merchants)
      .where(eq(merchants.userId, ctx.user.id))
      .limit(1);
    return rows.at(0) || null;
  }),

  // Get merchant dashboard stats
  dashboard: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const merchantRows = await db.select()
      .from(merchants)
      .where(eq(merchants.userId, ctx.user.id))
      .limit(1);

    const merchant = merchantRows.at(0);
    if (!merchant) return null;

    const branchRows = await db.select()
      .from(branches)
      .where(eq(branches.merchantId, merchant.id));

    return {
      merchant,
      branches: branchRows,
      totalBranches: branchRows.length,
    };
  }),

  // Update merchant
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        businessName: z.string().min(1).max(255).optional(),
        businessType: z.enum([
          "tea_shop", "restaurant", "hotel", "pg_hostel", "library",
          "school", "college", "coworking", "hospital", "railway_station",
          "bus_station", "apartment", "marriage_hall", "government_office",
          "public_wifi", "shopping_mall", "corporate_office", "airport", "other"
        ]).optional(),
        gstNumber: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        primaryColor: z.string().optional(),
        upiId: z.string().max(120).optional(),
        settlementAccountName: z.string().max(255).optional(),
        settlementPhone: z.string().max(20).optional(),
        settlementVerified: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, id))
        .limit(1);
      const merchant = merchantRows.at(0);
      if (!canManageMerchant(ctx.user, merchant)) {
        throw new Error("You cannot manage this merchant.");
      }

      await db.update(merchants).set(data).where(eq(merchants.id, id));
      publishRealtimeEvent({
        topic: "merchant",
        action: "updated",
        merchantId: id,
        entityId: id,
      });
      return { success: true };
    }),

  // ─── Branches ──────────────────────────────────────────────────────

  createBranch: authedQuery
    .input(
      z.object({
        merchantId: z.number(),
        name: z.string().min(1).max(255),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        routerBrand: z.string().optional(),
        routerModel: z.string().optional(),
        routerIp: z.string().optional(),
        controllerType: z.enum(["mikrotik", "openwrt", "freeradius", "cloud_agent", "manual"]).optional(),
        controllerEndpoint: z.string().max(255).optional(),
        ssid: z.string().optional(),
        internetSource: z.enum(["router_wifi", "phone_hotspot"]).optional(),
        gatewayMode: z.enum(["captive_portal", "phone_token_bridge"]).optional(),
        hotspotSsid: z.string().max(100).optional(),
        hotspotDeviceName: z.string().max(100).optional(),
        hotspotOwnerPhone: z.string().max(20).optional(),
        bandwidthMbps: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const result = await db.insert(branches).values(input);
      const branchId = Number(result[0].insertId);
      publishRealtimeEvent({
        topic: "merchant",
        action: "branch_created",
        merchantId: input.merchantId,
        entityId: branchId,
      });
      return { success: true, branchId };
    }),

  getBranches: authedQuery
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ ctx, input }) => {
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

      return db.select()
        .from(branches)
        .where(eq(branches.merchantId, input.merchantId));
    }),

  updateBranch: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        routerBrand: z.string().optional(),
        routerModel: z.string().optional(),
        routerIp: z.string().optional(),
        controllerType: z.enum(["mikrotik", "openwrt", "freeradius", "cloud_agent", "manual"]).optional(),
        controllerEndpoint: z.string().max(255).optional(),
        ssid: z.string().optional(),
        internetSource: z.enum(["router_wifi", "phone_hotspot"]).optional(),
        gatewayMode: z.enum(["captive_portal", "phone_token_bridge"]).optional(),
        hotspotSsid: z.string().max(100).optional(),
        hotspotDeviceName: z.string().max(100).optional(),
        hotspotOwnerPhone: z.string().max(20).optional(),
        bandwidthMbps: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const branchRows = await db
        .select()
        .from(branches)
        .where(eq(branches.id, id))
        .limit(1);
      const branch = branchRows.at(0);
      if (!branch) throw new Error("Branch was not found.");

      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, branch.merchantId))
        .limit(1);
      const merchant = merchantRows.at(0);
      if (!canManageMerchant(ctx.user, merchant)) {
        throw new Error("You cannot manage this merchant.");
      }

      await db.update(branches).set(data).where(eq(branches.id, id));
      publishRealtimeEvent({
        topic: "merchant",
        action: "branch_updated",
        merchantId: branch.merchantId,
        entityId: id,
      });
      return { success: true };
    }),

  deleteBranch: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const branchRows = await db
        .select()
        .from(branches)
        .where(eq(branches.id, input.id))
        .limit(1);
      const branch = branchRows.at(0);
      if (!branch) throw new Error("Branch was not found.");

      const merchantRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, branch.merchantId))
        .limit(1);
      const merchant = merchantRows.at(0);
      if (!canManageMerchant(ctx.user, merchant)) {
        throw new Error("You cannot manage this merchant.");
      }

      await db.delete(branches).where(eq(branches.id, input.id));
      publishRealtimeEvent({
        topic: "merchant",
        action: "branch_deleted",
        merchantId: branch.merchantId,
        entityId: input.id,
      });
      return { success: true };
    }),
});
