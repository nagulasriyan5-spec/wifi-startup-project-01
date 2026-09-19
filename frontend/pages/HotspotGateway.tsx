import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { trpc } from "@/providers/trpc";
import { COPYRIGHT_TEXT } from "@/const";
import { launchGatewayCheckout } from "@/lib/payments";
import {
  DEFAULT_UPI_ID,
  formatUpiAmount,
  normalizeUpiId,
  ticketQrPayload,
  ticketUpiPayload,
  ticketUpiTransactionRef,
} from "@/lib/upi";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  IndianRupee,
  LockKeyhole,
  Router,
  Shield,
  Wifi,
} from "lucide-react";

type SessionInfo = {
  id: number;
  durationMinutes: number;
  speedLimitMbps: number | null;
  dataLimitMb: number | null;
  ssid: string;
  internetSource: "router_wifi" | "phone_hotspot";
  gatewayMode: "captive_portal" | "phone_token_bridge";
  routerIp: string | null;
  routerBrand: string | null;
  routerModel: string | null;
  hotspotSsid: string | null;
  hotspotDeviceName: string | null;
  hotspotOwnerPhone: string | null;
};

function savedUpiId() {
  if (typeof window === "undefined") return DEFAULT_UPI_ID;
  return (
    window.localStorage.getItem("sriyan-merchant-upi-id") ||
    DEFAULT_UPI_ID
  );
}

function getDeviceFingerprint() {
  const storageKey = "sriyan-device-fingerprint";

  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;

    const generated =
      globalThis.crypto?.randomUUID?.() ??
      `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function friendlyPaymentError(message: string) {
  if (
    message.includes("PAYMENT_GATEWAY_PROVIDER") ||
    message.includes("payment gateway is not configured") ||
    message.includes("Paid tokens need a live payment gateway")
  ) {
    return "This merchant has not finished live payment setup yet. Ask the merchant to add Razorpay, PhonePe, or Cashfree credentials before paid tokens can unlock automatically.";
  }
  return message;
}

export default function HotspotGateway() {
  const [code, setCode] = useState(
    () =>
      new URLSearchParams(window.location.search).get("code")?.toUpperCase() ??
      ""
  );
  const [submittedCode, setSubmittedCode] = useState(code);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [paymentStarted, setPaymentStarted] = useState(false);
  const fallbackUpiId = savedUpiId();
  const deviceFingerprint = useMemo(() => getDeviceFingerprint(), []);
  const registeredScansRef = useRef(new Set<string>());

  const statusQuery = trpc.ticket.paymentStatus.useQuery(
    { code: submittedCode },
    {
      enabled: submittedCode.length > 0 && !session,
      refetchInterval: 3000,
    }
  );

  const validateTicket = trpc.ticket.validate.useMutation({
    onSuccess: data => {
      if (data.success && data.session) {
        setSession(data.session);
        setError("");
        return;
      }

      const response = data as { error?: string; paymentRequired?: boolean };
      if (!response.paymentRequired) {
        setError(response.error || "Unable to unlock this hotspot token");
      }
    },
    onError: err => setError(err.message),
  });

  const verifyPayment = trpc.payment.verifyGatewayPayment.useMutation({
    onSuccess: () => {
      void statusQuery.refetch();
    },
    onError: err => {
      setPaymentStarted(false);
      setError(friendlyPaymentError(err.message));
    },
  });
  const createGatewayPayment = trpc.payment.createForTicket.useMutation({
    onSuccess: async data => {
      if ("alreadyPaid" in data && data.alreadyPaid) {
        validateTicket.mutate({
          code: submittedCode,
          deviceFingerprint,
        });
        return;
      }

      const order = data as {
        payment: {
          id: number;
          transactionId: string;
          amount: number;
          status: string;
          gatewayOrderId: string;
        };
        checkout: Parameters<typeof launchGatewayCheckout>[0]["checkout"];
      };

      await launchGatewayCheckout({
        checkout: order.checkout,
        payment: order.payment,
        onRazorpaySuccess: async response => {
          await verifyPayment.mutateAsync({
            provider: "razorpay",
            paymentId: order.payment.id,
            transactionId: order.payment.transactionId,
            gatewayOrderId: response.razorpay_order_id,
            gatewayPaymentId: response.razorpay_payment_id,
            gatewaySignature: response.razorpay_signature,
            durationMinutes: status?.durationMinutes ?? 60,
            ticketType: "qr",
          });
        },
      });
    },
    onError: err => {
      setPaymentStarted(false);
      setError(friendlyPaymentError(err.message));
    },
  });
  const registerTicketScan = trpc.payment.registerTicketScan.useMutation();

  const status = statusQuery.data;
  const amount = status?.price ?? 0;
  const paid = Boolean(status?.paid);
  const hasPayment = amount > 0;
  const approvalStatus = status?.accessApprovalStatus ?? "auto_approved";
  const waitingForMerchant = paid && approvalStatus === "waiting_merchant";
  const rejectedByMerchant = paid && approvalStatus === "rejected";
  const canActivate =
    paid &&
    (approvalStatus === "approved" || approvalStatus === "auto_approved");
  const merchantName = status?.merchantName ?? "Sriyan WiFi";
  const hotspot = status?.hotspot;
  const paymentUpiId = normalizeUpiId(status?.payment?.upiId ?? fallbackUpiId);
  const sourceLabel =
    (status?.hotspot?.internetSource ?? session?.internetSource) ===
    "phone_hotspot"
      ? "Phone hotspot"
      : "Router WiFi";
  const upiIntentUrl =
    submittedCode && hasPayment
      ? ticketUpiPayload({
          code: submittedCode,
          amount,
          upiId: paymentUpiId,
          merchantName,
        })
      : "";

  const routerLabel = useMemo(() => {
    const hardware = [hotspot?.routerBrand, hotspot?.routerModel]
      .filter(Boolean)
      .join(" ");
    return hardware || "Configured hotspot";
  }, [hotspot?.routerBrand, hotspot?.routerModel]);

  useEffect(() => {
    if (!submittedCode || !status) return;

    QRCode.toDataURL(
      ticketQrPayload({
        code: submittedCode,
        amount,
        upiId: paymentUpiId,
        merchantName,
      }),
      {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 192,
      }
    ).then(setQrDataUrl);
  }, [amount, merchantName, paymentUpiId, status, submittedCode]);

  useEffect(() => {
    if (!submittedCode || !status || !hasPayment || paid || session) return;

    const key = `${submittedCode}:${deviceFingerprint}`;
    if (registeredScansRef.current.has(key)) return;

    registeredScansRef.current.add(key);
    registerTicketScan.mutate(
      { code: submittedCode, deviceFingerprint },
      {
        onError: () => {
          registeredScansRef.current.delete(key);
        },
      }
    );
  }, [
    deviceFingerprint,
    hasPayment,
    paid,
    registerTicketScan,
    session,
    status,
    submittedCode,
  ]);

  useEffect(() => {
    if (!submittedCode || !status || session || validateTicket.isPending)
      return;
    if (!canActivate) return;

    setPaymentStarted(false);
    validateTicket.mutate({
      code: submittedCode,
      deviceFingerprint,
    });
  }, [
    canActivate,
    deviceFingerprint,
    session,
    status,
    submittedCode,
    validateTicket,
  ]);

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    setSubmittedCode(normalized);
    setSession(null);
    setError("");
    window.history.replaceState(
      null,
      "",
      `/hotspot?code=${encodeURIComponent(normalized)}`
    );
  };

  const unlockFreeOrPaid = () => {
    if (!submittedCode) return;
    validateTicket.mutate({
      code: submittedCode,
      deviceFingerprint,
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "var(--bg-primary)" }}
    >
      <header className="fixed top-0 left-0 right-0 p-4 z-10">
        <div className="mx-auto max-w-lg flex items-center justify-between">
          <Link to="/" className="neu-btn p-2.5 flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-success)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Hotspot Gateway
            </span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-lg mt-16">
        <AnimatePresence mode="wait">
          {session ? (
            <motion.div
              key="unlocked"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="neu-lg w-24 h-24 mx-auto mb-6 flex items-center justify-center rounded-full animate-pulse-glow">
                <Check className="w-12 h-12 text-[var(--accent-success)]" />
              </div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
                Internet Unlocked
              </h1>
              <p className="text-[var(--text-secondary)] mb-6">
                Token {submittedCode} is active on {session.ssid} through{" "}
                {sourceLabel}.
              </p>

              <div className="neu-flat p-6 text-left mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Wifi className="w-5 h-5 text-[var(--accent-success)]" />
                  <div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Hotspot SSID
                    </div>
                    <div className="font-bold text-[var(--text-primary)]">
                      {session.ssid}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="neu-sm p-3">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Duration
                    </div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {session.durationMinutes} min
                    </div>
                  </div>
                  <div className="neu-sm p-3">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Speed
                    </div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {session.speedLimitMbps
                        ? `${session.speedLimitMbps} Mbps`
                        : "Standard"}
                    </div>
                  </div>
                </div>
                <div className="neu-sm p-3 mt-3">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Gateway
                  </div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    {session.internetSource === "phone_hotspot"
                      ? (session.hotspotDeviceName ?? "Merchant phone hotspot")
                      : (session.routerIp ?? "Captive portal approved")}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setSession(null);
                  setSubmittedCode("");
                  setCode("");
                  setQrDataUrl("");
                  window.history.replaceState(null, "", "/hotspot");
                }}
                className="neu-btn px-8 py-3 text-[var(--text-primary)]"
              >
                Use Another Token
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="gateway"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center mb-8">
                <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <Router className="w-10 h-10 text-[var(--accent-primary)]" />
                </div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                  Hotspot Access
                </h1>
                <p className="text-[var(--text-secondary)]">
                  Unlock internet using your ticket token.
                </p>
              </div>

              <form onSubmit={submitCode} className="neu-flat p-4 mb-5">
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  Ticket Token
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={code}
                    onChange={event =>
                      setCode(event.target.value.toUpperCase())
                    }
                    className="neu-input"
                    placeholder="SCAN OR ENTER TOKEN"
                  />
                  <button
                    type="submit"
                    className="neu-btn-primary px-4 flex items-center"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </form>

              {statusQuery.isLoading && submittedCode && (
                <div className="neu-sm p-4 text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin" />
                  Checking token...
                </div>
              )}

              {status && (
                <div className="neu-flat p-6 text-center">
                  <div className="flex items-center justify-between gap-3 text-left mb-4">
                    <div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {sourceLabel}
                      </div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {hotspot?.ssid ?? "Sriyan_Guest"}
                      </div>
                    </div>
                    <div className="neu-sm p-2">
                      <Wifi className="w-5 h-5 text-[var(--accent-success)]" />
                    </div>
                  </div>

                  <div className="neu-pressed p-5 rounded-xl inline-block mb-4">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`UPI token ${submittedCode}`}
                        className="w-36 h-36 rounded-lg"
                      />
                    ) : (
                      <LockKeyhole className="w-36 h-36 text-[var(--accent-primary)]" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-left mb-4">
                    <div className="neu-sm p-3">
                      <div className="text-xs text-[var(--text-secondary)]">
                        Locked Amount
                      </div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {hasPayment ? `Rs. ${formatUpiAmount(amount)}` : "Free"}
                      </div>
                    </div>
                    <div className="neu-sm p-3">
                      <div className="text-xs text-[var(--text-secondary)]">
                        Payment
                      </div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {paid ? "Paid" : "Pending"}
                      </div>
                    </div>
                  </div>

                  <div className="neu-sm p-3 text-left mb-4">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Payment Token
                    </div>
                    <code className="text-sm text-[var(--text-primary)] break-all">
                      {ticketUpiTransactionRef(submittedCode)}
                    </code>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      Scan the QR with any UPI app for the locked amount.
                      Sriyan unlocks internet after signed gateway confirmation
                      or merchant UPI reference confirmation.
                    </div>
                  </div>

                  {!paid && hasPayment && (
                    <a
                      href={upiIntentUrl}
                      className="neu-btn w-full py-3 mb-4 font-semibold flex items-center justify-center gap-2"
                    >
                      <IndianRupee className="w-4 h-4" />
                      Open UPI App
                    </a>
                  )}

                  <div className="neu-sm p-3 text-left mb-5">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Hotspot Controller
                    </div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {hotspot?.internetSource === "phone_hotspot"
                        ? (hotspot.hotspotDeviceName ??
                          "Merchant phone hotspot")
                        : routerLabel}
                    </div>
                    {hotspot?.routerIp &&
                      hotspot.internetSource !== "phone_hotspot" && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          Gateway {hotspot.routerIp}
                        </div>
                      )}
                  </div>

                  {waitingForMerchant && (
                    <div className="neu-sm p-4 mb-4 text-left border-l-4 border-[var(--accent-warning)]">
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-[var(--accent-warning)] shrink-0 mt-0.5 animate-spin" />
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            Payment received
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            Waiting for merchant to continue sharing network
                            access.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {rejectedByMerchant && (
                    <div className="neu-sm p-4 mb-4 text-left border-l-4 border-[var(--accent-danger)]">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            Network sharing stopped
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            Ask the merchant for support or a refund.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {canActivate ? (
                    <button
                      onClick={unlockFreeOrPaid}
                      disabled={validateTicket.isPending}
                      className="neu-btn-primary w-full py-4 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {validateTicket.isPending ? (
                        <Clock className="w-5 h-5 animate-spin" />
                      ) : (
                        <Wifi className="w-5 h-5" />
                      )}
                      {validateTicket.isPending
                        ? "Unlocking..."
                        : "Connect Hotspot"}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setPaymentStarted(true);
                        setError("");
                        createGatewayPayment.mutate({
                          code: submittedCode,
                          deviceFingerprint,
                          returnUrl: `${window.location.origin}/hotspot?code=${encodeURIComponent(submittedCode)}`,
                        });
                      }}
                      disabled={
                        createGatewayPayment.isPending ||
                        verifyPayment.isPending ||
                        paymentStarted ||
                        waitingForMerchant ||
                        rejectedByMerchant
                      }
                      className="neu-btn-primary w-full py-4 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {createGatewayPayment.isPending ||
                      verifyPayment.isPending ||
                      paymentStarted ? (
                        <Clock className="w-5 h-5 animate-spin" />
                      ) : (
                        <IndianRupee className="w-5 h-5" />
                      )}
                      {waitingForMerchant
                        ? "Waiting for merchant..."
                        : rejectedByMerchant
                          ? "Access stopped"
                          : createGatewayPayment.isPending ||
                              verifyPayment.isPending ||
                              paymentStarted
                            ? "Waiting for gateway..."
                            : "Pay And Unlock"}
                    </button>
                  )}
                </div>
              )}

              {statusQuery.data === null && submittedCode && (
                <div className="mt-4 p-4 neu-flat border-l-4 border-[var(--accent-danger)]">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      Ticket token was not found.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4 p-4 neu-flat border-l-4 border-[var(--accent-danger)]">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">{error}</p>
            </div>
          </div>
        )}
      </main>
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-[var(--text-secondary)]">{COPYRIGHT_TEXT}</p>
      </footer>
    </div>
  );
}
