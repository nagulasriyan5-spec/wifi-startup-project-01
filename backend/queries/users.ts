import { and, eq, gt } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);
  return rows.at(0);
}

export async function findUserByPasswordResetTokenHash(tokenHash: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.passwordResetTokenHash, tokenHash),
        gt(schema.users.passwordResetExpiresAt, new Date())
      )
    )
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function createUser(data: InsertUser) {
  await getDb().insert(schema.users).values(data);
  return findUserByUnionId(data.unionId);
}

export async function updateUserLastSignIn(userId: number) {
  await getDb()
    .update(schema.users)
    .set({ lastSignInAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserPassword(userId: number, passwordHash: string) {
  await getDb()
    .update(schema.users)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      emailVerifiedAt: new Date(),
      lastSignInAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

export async function setUserPasswordResetToken(input: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}) {
  await getDb()
    .update(schema.users)
    .set({
      passwordResetTokenHash: input.tokenHash,
      passwordResetExpiresAt: input.expiresAt,
    })
    .where(eq(schema.users.id, input.userId));
}
