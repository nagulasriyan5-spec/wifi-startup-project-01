import crypto from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  canonicalJson,
  createLedgerPayloadHash,
  createLedgerSignature,
  createLedgerTransactionHash,
  sha256,
} from "../lib/blockchain";
import { publishRealtimeEvent } from "../realtime";
import { env } from "../lib/env";
import { getMysqlPool } from "./connection";

type LedgerEntityType = "ticket" | "session" | "payment" | "merchant" | "user";

type AppendLedgerEntryInput = {
  entityType: LedgerEntityType;
  entityId: number;
  action: string;
  merchantId?: number;
  data?: unknown;
};

type PreviousLedgerRow = RowDataPacket & {
  id: number;
  blockNumber: number | null;
  transactionHash: string;
};

type AdvisoryLockRow = RowDataPacket & {
  acquired: number | string | null;
};

export async function appendLedgerEntry(input: AppendLedgerEntryInput) {
  const connection = await getMysqlPool().promise().getConnection();
  let lockAcquired = false;

  try {
    const [lockRows] = await connection.query<AdvisoryLockRow[]>(
      "SELECT GET_LOCK(?, ?) AS acquired",
      ["sriyan-ledger-append", env.ledgerLockTimeoutSeconds],
    );
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;

    if (!lockAcquired) {
      throw new Error("Timed out waiting for blockchain ledger write lock");
    }

    const [previousRows] = await connection.query<PreviousLedgerRow[]>(
      "SELECT `id`, COALESCE(`blockNumber`, `id`) AS `blockNumber`, `transactionHash` FROM `blockchain_ledger` ORDER BY `id` DESC LIMIT 1",
    );
    const previous = previousRows[0];
    const previousHash = previous?.transactionHash ?? "GENESIS";
    const blockNumber = Number(previous?.blockNumber ?? 0) + 1;
    const nonce = crypto.randomUUID();
    const dataForHash = input.data ?? null;
    const dataJson = input.data === undefined ? null : canonicalJson(dataForHash);
    const payloadHash = createLedgerPayloadHash({
      previousHash,
      blockNumber,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      data: dataForHash,
      nonce,
    });
    const transactionHash = createLedgerTransactionHash(
      previousHash,
      payloadHash,
      blockNumber,
    );
    const chainSignature = createLedgerSignature(
      env.chainSigningSecret,
      transactionHash,
      payloadHash,
      previousHash,
      blockNumber,
    );
    const merkleRoot = sha256(`${previousHash}:${payloadHash}:${transactionHash}`);

    await connection.query<ResultSetHeader>(
      [
        "INSERT INTO `blockchain_ledger`",
        "(`transactionHash`, `nonce`, `payloadHash`, `chainSignature`, `blockNumber`, `entityType`, `entityId`, `action`, `data`, `previousHash`, `merkleRoot`, `validatedBy`)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
      [
        transactionHash,
        nonce,
        payloadHash,
        chainSignature,
        blockNumber,
        input.entityType,
        input.entityId,
        input.action,
        dataJson,
        previousHash,
        merkleRoot,
        "sriyan-ledger-v1",
      ],
    );

    publishRealtimeEvent({
      topic: "blockchain",
      action: input.action.toLowerCase(),
      merchantId: input.merchantId,
      entityId: input.entityId,
      data: { entityType: input.entityType, transactionHash, blockNumber },
    });

    return transactionHash;
  } finally {
    if (lockAcquired) {
      await connection
        .query("SELECT RELEASE_LOCK(?)", ["sriyan-ledger-append"])
        .catch((error) => {
          console.error("[ledger] Failed to release ledger write lock", error);
        });
    }
    connection.release();
  }
}
