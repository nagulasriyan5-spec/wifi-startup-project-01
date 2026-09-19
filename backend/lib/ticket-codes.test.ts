import { describe, expect, it } from "vitest";
import { generateOTP, generateTicketCode } from "./ticket-codes";

describe("ticket code generation", () => {
  it("generates a six digit OTP", () => {
    expect(generateOTP()).toMatch(/^\d{6}$/);
  });

  it("generates uppercase QR ticket codes at the requested length", () => {
    expect(generateTicketCode(12)).toMatch(/^[A-F0-9]{12}$/);
  });
});
