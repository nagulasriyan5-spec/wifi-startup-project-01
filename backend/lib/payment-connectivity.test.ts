import { describe, expect, it } from "vitest";
import { assessPaymentConnectivity } from "./payment-connectivity";

describe("assessPaymentConnectivity", () => {
  it("keeps customers on mobile when the payment network is healthy", () => {
    const result = assessPaymentConnectivity({
      gatewayReachable: true,
      paymentAppReachable: true,
      rttMs: 180,
      downlinkMbps: 8,
      effectiveType: "4g",
    });

    expect(result.mobileSufficient).toBe(true);
    expect(result.decision).toBe("use_mobile");
  });

  it("offers payment-only connectivity when mobile cannot reliably reach checkout", () => {
    const result = assessPaymentConnectivity({
      gatewayReachable: false,
      paymentAppReachable: false,
      rttMs: 1800,
      downlinkMbps: 0.1,
      effectiveType: "2g",
    });

    expect(result.mobileSufficient).toBe(false);
    expect(result.decision).toBe("offer_payment_connectivity");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("supports an explicit controller override for difficult payment zones", () => {
    const result = assessPaymentConnectivity({
      gatewayReachable: true,
      paymentAppReachable: true,
      forcePaymentConnectivity: true,
    });

    expect(result.mobileSufficient).toBe(false);
    expect(result.decision).toBe("force_payment_connectivity");
  });
});
