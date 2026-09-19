import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { blockchainLedger } from "@db/schema";
import {
  createLedgerPayloadHash,
  createLedgerSignature,
  createLedgerTransactionHash,
} from "./lib/blockchain";
import { env } from "./lib/env";

const entityTypeSchema = z.enum(["ticket", "session", "payment", "merchant", "user"]);

export const blockchainRouter = createRouter({
  // Get all ledger entries
  list: publicQuery
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(50),
        entityType: entityTypeSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();

      if (input.entityType) {
        return db.select()
          .from(blockchainLedger)
          .where(eq(blockchainLedger.entityType, input.entityType))
          .orderBy(desc(blockchainLedger.createdAt))
          .limit(input.limit);
      }

      return db.select()
        .from(blockchainLedger)
        .orderBy(desc(blockchainLedger.createdAt))
        .limit(input.limit);
    }),

  // Get ledger for a specific entity
  getByEntity: publicQuery
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.number(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db.select()
        .from(blockchainLedger)
        .where(
          and(
            eq(blockchainLedger.entityType, input.entityType),
            eq(blockchainLedger.entityId, input.entityId),
          )
        )
        .orderBy(desc(blockchainLedger.createdAt))
        .limit(input.limit);
    }),

  // Get ledger stats
  stats: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select({
      totalEntries: sql<number>`COUNT(*)`,
      ticket: sql<number>`SUM(CASE WHEN ${blockchainLedger.entityType} = 'ticket' THEN 1 ELSE 0 END)`,
      session: sql<number>`SUM(CASE WHEN ${blockchainLedger.entityType} = 'session' THEN 1 ELSE 0 END)`,
      payment: sql<number>`SUM(CASE WHEN ${blockchainLedger.entityType} = 'payment' THEN 1 ELSE 0 END)`,
      merchant: sql<number>`SUM(CASE WHEN ${blockchainLedger.entityType} = 'merchant' THEN 1 ELSE 0 END)`,
      user: sql<number>`SUM(CASE WHEN ${blockchainLedger.entityType} = 'user' THEN 1 ELSE 0 END)`,
    }).from(blockchainLedger);
    const stats = rows.at(0);

    return {
      totalEntries: Number(stats?.totalEntries ?? 0),
      byType: {
        ticket: Number(stats?.ticket ?? 0),
        session: Number(stats?.session ?? 0),
        payment: Number(stats?.payment ?? 0),
        merchant: Number(stats?.merchant ?? 0),
        user: Number(stats?.user ?? 0),
      },
    };
  }),

  // Verify chain integrity
  verify: publicQuery
    .input(
      z.object({
        limit: z.number().int().min(2).max(50_000).default(10_000),
      }).optional()
    )
    .query(async ({ input }) => {
    const db = getDb();
    const limit = input?.limit ?? 10_000;
    const totalRows = await db.select({ total: sql<number>`COUNT(*)` })
      .from(blockchainLedger);
    const rows = await db.select()
        .from(blockchainLedger)
        .orderBy(desc(blockchainLedger.id))
        .limit(limit);
    rows.reverse();

    let isValid = true;
    const issues: string[] = [];
    let legacyEntries = 0;

    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];

      if (i > 0 && entry.previousHash !== rows[i - 1].transactionHash) {
        isValid = false;
        issues.push(`Chain link broken at entry ${entry.id}`);
      }

      if (!entry.nonce || !entry.payloadHash || !entry.chainSignature || !entry.blockNumber) {
        legacyEntries += 1;
        continue;
      }

      const blockNumber = Number(entry.blockNumber);
      const previousHash = entry.previousHash ?? "GENESIS";
      const expectedPayloadHash = createLedgerPayloadHash({
        blockNumber,
        previousHash,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        data: entry.data ?? null,
        nonce: entry.nonce,
      });
      const expectedTransactionHash = createLedgerTransactionHash(
        previousHash,
        expectedPayloadHash,
        blockNumber,
      );
      const expectedSignature = createLedgerSignature(
        env.chainSigningSecret,
        expectedTransactionHash,
        expectedPayloadHash,
        previousHash,
        blockNumber,
      );

      if (entry.payloadHash !== expectedPayloadHash) {
        isValid = false;
        issues.push(`Payload hash mismatch at entry ${entry.id}`);
      }
      if (entry.transactionHash !== expectedTransactionHash) {
        isValid = false;
        issues.push(`Transaction hash mismatch at entry ${entry.id}`);
      }
      if (entry.chainSignature !== expectedSignature) {
        isValid = false;
        issues.push(`Chain signature mismatch at entry ${entry.id}`);
      }
    }

    return {
      isValid,
      totalEntries: Number(totalRows.at(0)?.total ?? 0),
      checkedEntries: rows.length,
      windowLimited: rows.length >= limit,
      legacyEntries,
      issues,
    };
  }),
});
