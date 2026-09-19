import crypto from "crypto";

export type LedgerHashInput = {
  blockNumber: number;
  previousHash: string;
  entityType: string;
  entityId: number;
  action: string;
  data: unknown;
  nonce: string;
};

function normalizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJson(item)]),
  );
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(normalizeJson(value));
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createLedgerPayloadHash(input: LedgerHashInput) {
  return sha256(canonicalJson(input));
}

export function createLedgerTransactionHash(
  previousHash: string,
  payloadHash: string,
  blockNumber: number,
) {
  return sha256(`${previousHash}:${payloadHash}:${blockNumber}`);
}

export function createLedgerSignature(
  secret: string,
  transactionHash: string,
  payloadHash: string,
  previousHash: string,
  blockNumber: number,
) {
  return hmacSha256(
    secret,
    `${transactionHash}:${payloadHash}:${previousHash}:${blockNumber}`,
  );
}
