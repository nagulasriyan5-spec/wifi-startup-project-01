import { asc, eq } from "drizzle-orm";
import { branches, merchants, users } from "@db/schema";
import type { Merchant, User } from "@db/schema";
import { env } from "../lib/env";
import { getDb } from "./connection";

export const LOCAL_USER_UNION_ID = "local-seed-user";

export async function ensureLocalUser(): Promise<User> {
  if (env.isProduction) {
    throw new Error("Local seed user is not available in production");
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.unionId, LOCAL_USER_UNION_ID))
    .limit(1);

  if (existing[0]) return existing[0];

  await db
    .insert(users)
    .values({
      unionId: LOCAL_USER_UNION_ID,
      name: "Sriyan Merchant",
      email: "merchant@sriyan.local",
      role: "merchant",
      lastSignInAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Sriyan Merchant",
        role: "merchant",
        lastSignInAt: new Date(),
      },
    });

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.unionId, LOCAL_USER_UNION_ID))
    .limit(1);

  if (!rows[0]) throw new Error("Unable to create local seed user");
  return rows[0];
}

export async function ensureLocalMerchant(): Promise<Merchant> {
  const user = await ensureLocalUser();
  const db = getDb();

  const existing = await db
    .select()
    .from(merchants)
    .where(eq(merchants.userId, user.id))
    .limit(1);

  if (existing[0]) return existing[0];

  const result = await db.insert(merchants).values({
    userId: user.id,
    businessName: "Sriyan WiFi",
    businessType: "public_wifi",
    address: "Local setup",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
    primaryColor: "#2563eb",
    upiId: "merchant@upi",
    settlementAccountName: "Sriyan WiFi",
    settlementPhone: "9999999999",
    settlementVerified: false,
    isVerified: false,
    isActive: true,
  });

  const merchantId = Number(result[0].insertId);

  await db.insert(branches).values({
    merchantId,
    name: "Main Branch",
    address: "Local setup",
    city: "Hyderabad",
    state: "Telangana",
    routerBrand: "MikroTik",
    routerModel: "hAP / OpenWrt / FreeRADIUS",
    routerIp: "192.168.1.1",
    controllerType: "mikrotik",
    ssid: "Sriyan_Guest",
    internetSource: "router_wifi",
    gatewayMode: "captive_portal",
    hotspotSsid: "Sriyan_Hotspot",
    hotspotDeviceName: "Merchant phone",
    hotspotOwnerPhone: "9999999999",
    bandwidthMbps: 100,
  });

  const rows = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  if (!rows[0]) throw new Error("Unable to create local seed merchant");
  return rows[0];
}

export async function getFirstMerchantOrNull(): Promise<Merchant | null> {
  const db = getDb();
  const rows = await db.select().from(merchants).orderBy(asc(merchants.id)).limit(1);
  return rows[0] ?? null;
}
