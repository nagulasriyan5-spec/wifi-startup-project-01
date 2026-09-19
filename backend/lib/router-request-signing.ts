import crypto from "crypto";
import { env } from "./env";

function timingSafeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function routerSignaturePayload(input: {
  timestamp: string;
  method: string;
  path: string;
  rawBody: string;
}) {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    input.rawBody,
  ].join(".");
}

export function signRouterRequest(input: {
  timestamp: string;
  method: string;
  path: string;
  rawBody: string;
}) {
  return crypto
    .createHmac("sha256", env.routerIntegrationSecret)
    .update(routerSignaturePayload(input))
    .digest("hex");
}

export function verifyRouterRequestSignature(input: {
  headers: Headers;
  method: string;
  url: string;
  rawBody: string;
}) {
  if (!env.routerRequireRequestSignature) {
    return { ok: true, required: false };
  }

  const timestamp = input.headers.get("x-sriyan-timestamp") ?? "";
  const signatureHeader = input.headers.get("x-sriyan-signature") ?? "";
  const signature = signatureHeader.startsWith("v1=")
    ? signatureHeader.slice(3)
    : signatureHeader;
  if (!timestamp || !signature) {
    return { ok: false, required: true, error: "Missing router request signature." };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, required: true, error: "Router signature timestamp is invalid." };
  }

  const skewMs = Math.abs(Date.now() - timestampMs);
  if (skewMs > env.routerSignatureToleranceSeconds * 1000) {
    return { ok: false, required: true, error: "Router signature timestamp is outside tolerance." };
  }

  const path = new URL(input.url).pathname;
  const expected = signRouterRequest({
    timestamp,
    method: input.method,
    path,
    rawBody: input.rawBody,
  });

  return timingSafeEqual(expected, signature)
    ? { ok: true, required: true }
    : { ok: false, required: true, error: "Router request signature is invalid." };
}
