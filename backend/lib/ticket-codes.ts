import crypto from "crypto";

export function generateTicketCode(length = 12): string {
  return crypto.randomBytes(length).toString("hex").toUpperCase().slice(0, length);
}

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}
