import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
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
import QRCode from "qrcode";
import {
  Activity,
  Wifi,
  QrCode,
  KeyRound,
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cloud,
  CreditCard,
  Database,
  Gauge,
  HelpCircle,
  History,
  Home as HomeIcon,
  Shield,
  ShieldCheck,
  Signal,
  Zap,
  ChevronLeft,
  IndianRupee,
  Languages,
  LockKeyhole,
  Moon,
  Pause,
  Power,
  Radio,
  RefreshCw,
  Router,
  ScanLine,
  Smartphone,
  Sun,
  Timer,
  User,
  Users,
  WalletCards,
  WifiOff,
  XCircle,
} from "lucide-react";

type SessionInfo = {
  id: number;
  merchantId: number;
  branchId: number | null;
  durationMinutes: number;
  dataLimitMb: number | null;
  speedLimitMbps: number | null;
  startedAt: Date | string;
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

type PendingPaymentTicket = {
  code: string;
  price: number;
  currency: string;
  durationMinutes: number;
  merchantName?: string | null;
};

const UPI_APP_OPTIONS = [
  { id: "phonepe", name: "PhonePe", color: "#5f259f" },
  { id: "gpay", name: "Google Pay", color: "#1a73e8" },
  { id: "paytm", name: "Paytm", color: "#00baf2" },
  { id: "bhim", name: "BHIM", color: "#0f766e" },
  { id: "other", name: "Other UPI", color: "#6366f1" },
] as const;

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

function getOrCreateDeviceFingerprint() {
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

// Step 1: Choose method
function MethodSelection({
  onSelect,
}: {
  onSelect: (method: "qr" | "otp") => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <Wifi className="w-10 h-10 text-[var(--accent-primary)]" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Connect to WiFi
        </h2>
        <p className="text-[var(--text-secondary)]">
          Choose how you want to access the network
        </p>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => onSelect("qr")}
          className="neu-card w-full p-6 flex items-center gap-4 text-left group"
        >
          <div className="neu-sm w-14 h-14 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <QrCode className="w-7 h-7 text-[var(--accent-primary)]" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Scan QR Code
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Scan a QR code provided by the merchant
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-[var(--text-secondary)]" />
        </button>

        <button
          onClick={() => onSelect("otp")}
          className="neu-card w-full p-6 flex items-center gap-4 text-left group"
        >
          <div className="neu-sm w-14 h-14 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <KeyRound className="w-7 h-7 text-[var(--accent-success)]" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Enter OTP Code
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Type in the one-time password from merchant
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3 mt-8">
        {[
          { icon: Shield, label: "Secure" },
          { icon: Zap, label: "Instant" },
          { icon: Database, label: "Verified" },
        ].map(item => (
          <div key={item.label} className="neu-sm p-3 text-center">
            <item.icon className="w-5 h-5 text-[var(--accent-primary)] mx-auto mb-1" />
            <span className="text-xs text-[var(--text-secondary)]">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

void LegacyCustomerPortal;

type ScCustomerLocale = "en" | "te" | "hi";
type ScCustomerView =
  | "home"
  | "entry"
  | "details"
  | "payment"
  | "securing"
  | "session"
  | "queue"
  | "history"
  | "notifications"
  | "profile"
  | "help";
type ScPaymentUiState =
  | "Initializing"
  | "Waiting"
  | "Processing"
  | "Verified"
  | "Failed"
  | "Cancelled";

const SC_CUSTOMER_COPY: Record<
  ScCustomerLocale,
  {
    scan: string;
    otp: string;
    subtitle: string;
    connected: string;
  }
> = {
  en: {
    scan: "Scan WiFi QR",
    otp: "Enter OTP",
    subtitle: "Verified payments, trusted access and clear session control.",
    connected: "Connected securely",
  },
  te: {
    scan: "WiFi QR స్కాన్",
    otp: "OTP నమోదు",
    subtitle: "నిర్ధారిత చెల్లింపులు, నమ్మకమైన యాక్సెస్, స్పష్టమైన సెషన్ నియంత్రణ.",
    connected: "సురక్షితంగా కనెక్ట్ అయింది",
  },
  hi: {
    scan: "WiFi QR स्कैन",
    otp: "OTP डालें",
    subtitle: "सत्यापित भुगतान, भरोसेमंद एक्सेस और साफ सेशन नियंत्रण.",
    connected: "सुरक्षित रूप से कनेक्टेड",
  },
};

function useScTheme() {
  const [darkMode, setDarkMode] = useState(() =>
    typeof document === "undefined"
      ? false
      : document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return [darkMode, setDarkMode] as const;
}

function ScStatusPill({
  tone = "info",
  children,
}: {
  tone?: "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return (
    <span className={`sc-status sc-status-${tone}`}>
      <span className="sc-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function ScSecurityVisual({
  label,
  connected,
}: {
  label: string;
  connected?: boolean;
}) {
  return (
    <div className="sc-network-visual" aria-label={label}>
      <span className="sc-signal-ring" aria-hidden="true" />
      <span className="sc-signal-ring" aria-hidden="true" />
      <span className="sc-signal-ring" aria-hidden="true" />
      <span className="sc-data-line sc-data-line-one" aria-hidden="true" />
      <span className="sc-data-line sc-data-line-two" aria-hidden="true" />
      <div className="absolute left-6 top-6 sc-pill">
        <Cloud className="h-4 w-4" />
        Cloud verified
      </div>
      <div className="absolute bottom-6 right-6 sc-pill">
        <Smartphone className="h-4 w-4" />
        Device bound
      </div>
      <div className="sc-router-core">
        {connected ? (
          <Wifi className="h-12 w-12" />
        ) : (
          <Router className="h-12 w-12" />
        )}
      </div>
    </div>
  );
}

function ScCustomerHeader({
  locale,
  setLocale,
  darkMode,
  setDarkMode,
}: {
  locale: ScCustomerLocale;
  setLocale: (locale: ScCustomerLocale) => void;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
}) {
  const languageLabels: Array<{ id: ScCustomerLocale; label: string }> = [
    { id: "en", label: "EN" },
    { id: "te", label: "TE" },
    { id: "hi", label: "HI" },
  ];

  return (
    <header className="sc-header">
      <div className="sc-shell sc-header-row">
        <Link to="/" className="sc-brand" aria-label="Sriyan WiFi home">
          <span className="sc-brand-mark">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="block leading-tight">Sriyan WiFi</span>
            <span className="sc-kicker block">UPI verified network access</span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <div className="sc-pill" aria-label="Language">
            <Languages className="h-4 w-4" />
            {languageLabels.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLocale(item.id)}
                aria-pressed={locale === item.id}
                className={`rounded-md px-2 py-1 text-xs font-black ${
                  locale === item.id ? "bg-[var(--sc-primary)] text-white" : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sc-icon-button"
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
          <Link to="/" className="sc-button">
            <ChevronLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}

function ScFlowRail({
  active,
}: {
  active: "scan" | "verify" | "pay" | "connect";
}) {
  const steps = [
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "verify", label: "Verify", icon: BadgeCheck },
    { id: "pay", label: "Pay", icon: IndianRupee },
    { id: "connect", label: "Connect", icon: Wifi },
  ] as const;
  const activeIndex = steps.findIndex(step => step.id === active);

  return (
    <div className="sc-flow" aria-label="Connection flow">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`sc-flow-step ${
            index < activeIndex
              ? "is-done"
              : index === activeIndex
                ? "is-active"
                : ""
          }`}
        >
          <step.icon className="h-5 w-5" />
          <span className="text-sm font-black">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function ScCustomerHome({
  locale,
  onSelect,
  onNavigate,
}: {
  locale: ScCustomerLocale;
  onSelect: (method: "qr" | "otp") => void;
  onNavigate: (view: ScCustomerView) => void;
}) {
  const copy = SC_CUSTOMER_COPY[locale];

  return (
    <motion.main
      key="home"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center"
    >
      <section className="space-y-6">
        <div className="space-y-4">
          <ScStatusPill tone="success">
            <LockKeyhole className="h-4 w-4" />
            Trusted public WiFi access
          </ScStatusPill>
          <div>
            <h1 className="sc-title">Sriyan WiFi</h1>
            <p className="sc-subtitle mt-4 max-w-xl">{copy.subtitle}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => onSelect("qr")}
            className="sc-button-primary min-h-[64px] justify-between px-5 text-left text-lg"
          >
            <span className="flex items-center gap-3">
              <ScanLine className="h-6 w-6" />
              {copy.scan}
            </span>
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onSelect("otp")}
            className="sc-button min-h-[64px] px-5"
          >
            <KeyRound className="h-5 w-5" />
            {copy.otp}
          </button>
        </div>

        <ScFlowRail active="scan" />

        <div className="sc-grid-3">
          {[
            { icon: Shield, label: "Secure", value: "Device verified" },
            {
              icon: IndianRupee,
              label: "Payment",
              value: "UPI status visible",
            },
            { icon: Signal, label: "Network", value: "Capacity checked" },
          ].map(item => (
            <div key={item.label} className="sc-metric">
              <item.icon className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
              <div className="text-sm font-black">{item.label}</div>
              <div className="mt-1 text-xs font-bold text-[var(--sc-muted)]">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="sc-panel">
          <div className="sc-row mb-4">
            <div>
              <div className="font-black">Network states are always explicit</div>
              <div className="text-sm font-semibold text-[var(--sc-muted)]">
                No hidden waiting, unclear payment, or silent expiry.
              </div>
            </div>
            <WifiOff className="h-5 w-5 text-[var(--sc-warning)]" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "QR expired",
              "OTP invalid",
              "Payment pending",
              "Router offline",
              "Network busy",
              "Session expired",
            ].map(state => (
              <span key={state} className="sc-pill">
                {state}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <ScSecurityVisual label="Router to cloud to customer secure connection visualization" />
        <div className="sc-grid-2">
          <button
            type="button"
            onClick={() => onNavigate("queue")}
            className="sc-card sc-card-interactive text-left"
          >
            <Users className="mb-3 h-5 w-5 text-[var(--sc-warning)]" />
            <div className="font-black">Network busy?</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
              See queue position and activate when a slot opens.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("help")}
            className="sc-card sc-card-interactive text-left"
          >
            <HelpCircle className="mb-3 h-5 w-5 text-[var(--sc-accent)]" />
            <div className="font-black">Need help?</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
              Payment, permission and connection recovery in one place.
            </div>
          </button>
        </div>
      </section>
    </motion.main>
  );
}

function ScCodeEntry({
  method,
  onBack,
  onSubmit,
  isSubmitting,
}: {
  method: "qr" | "otp";
  onBack: () => void;
  onSubmit: (code: string) => void;
  isSubmitting: boolean;
}) {
  const [code, setCode] = useState("");
  const isOtp = method === "otp";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || isSubmitting) return;
    onSubmit(code.trim().toUpperCase());
  };

  return (
    <motion.main
      key="entry"
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -22 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start"
    >
      <section className="space-y-5">
        <button type="button" onClick={onBack} className="sc-button">
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div>
          <ScStatusPill tone={isOtp ? "warning" : "info"}>
            {isOtp ? (
              <KeyRound className="h-4 w-4" />
            ) : (
              <ScanLine className="h-4 w-4" />
            )}
            {isOtp ? "OTP verification" : "QR ticket verification"}
          </ScStatusPill>
          <h1 className="sc-title mt-4">
            {isOtp ? "Enter merchant OTP" : "Scan WiFi QR"}
          </h1>
          <p className="sc-subtitle mt-3">
            The code is checked against the merchant, plan, payment and router
            capacity before access is granted.
          </p>
        </div>
        <ScFlowRail active="verify" />
      </section>

      <form onSubmit={handleSubmit} className="sc-panel space-y-5">
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div className="sc-network-visual min-h-[190px]">
            <span className="sc-signal-ring" aria-hidden="true" />
            <div className="sc-router-core h-28 w-28">
              {isOtp ? (
                <KeyRound className="h-12 w-12" />
              ) : (
                <QrCode className="h-12 w-12" />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="sc-label">
                {isOtp ? "6 digit OTP" : "Ticket code from QR"}
              </span>
              <input
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase())}
                maxLength={isOtp ? 6 : 24}
                autoFocus
                inputMode={isOtp ? "numeric" : "text"}
                placeholder={isOtp ? "000000" : "SCW-XXXX-XXXX"}
                className="sc-input min-h-[64px] text-center text-2xl font-black"
                aria-invalid={code.length > 0 && code.length < (isOtp ? 6 : 4)}
              />
            </label>
            <div className="sc-grid-2">
              <div className="sc-card">
                <ShieldCheck className="mb-2 h-5 w-5 text-[var(--sc-success)]" />
                <div className="text-sm font-black">Permission ready</div>
                <div className="text-xs font-semibold text-[var(--sc-muted)]">
                  Camera and OTP entry states are separated.
                </div>
              </div>
              <div className="sc-card">
                <Clock className="mb-2 h-5 w-5 text-[var(--sc-warning)]" />
                <div className="text-sm font-black">Expiry checked</div>
                <div className="text-xs font-semibold text-[var(--sc-muted)]">
                  Expired QR and invalid OTP show clear recovery.
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || code.length < (isOtp ? 6 : 4)}
          className="sc-button-primary w-full"
        >
          {isSubmitting ? (
            <>
              <Radio className="h-4 w-4 animate-pulse" />
              Verifying secure ticket
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Continue
            </>
          )}
        </button>
      </form>
    </motion.main>
  );
}

function ScPlanDetailsView({
  ticket,
  onBack,
  onContinue,
}: {
  ticket: PendingPaymentTicket;
  onBack: () => void;
  onContinue: () => void;
}) {
  const merchantName = ticket.merchantName ?? "Sriyan WiFi Merchant";
  const dataLabel = ticket.price > 0 ? "1.5 GB fair use" : "Merchant limit";

  return (
    <motion.main
      key="details"
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -22 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
    >
      <section className="space-y-5">
        <button type="button" onClick={onBack} className="sc-button">
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div>
          <ScStatusPill tone="success">
            <BadgeCheck className="h-4 w-4" />
            QR verified
          </ScStatusPill>
          <h1 className="sc-title mt-4">Merchant and WiFi plan details</h1>
          <p className="sc-subtitle mt-3">
            Review the network, plan, price, duration and data before payment.
          </p>
        </div>
        <ScFlowRail active="pay" />
      </section>

      <section className="sc-panel space-y-5">
        <div className="sc-row">
          <div>
            <div className="sc-kicker">Merchant</div>
            <div className="text-2xl font-black">{merchantName}</div>
          </div>
          <ScStatusPill tone="info">Payment waiting</ScStatusPill>
        </div>
        <div className="sc-divider" />
        <div className="sc-grid-2">
          {[
            {
              icon: Wifi,
              label: "Network",
              value: "Guest WiFi / Captive portal",
            },
            {
              icon: IndianRupee,
              label: "Price",
              value: `Rs. ${formatUpiAmount(ticket.price)}`,
            },
            {
              icon: Timer,
              label: "Duration",
              value: `${ticket.durationMinutes} minutes`,
            },
            { icon: Database, label: "Data", value: dataLabel },
            { icon: Gauge, label: "Speed", value: "Merchant bandwidth policy" },
            { icon: Shield, label: "Payment status", value: "Not paid" },
          ].map(item => (
            <div key={item.label} className="sc-card">
              <item.icon className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
              <div className="text-xs font-black text-[var(--sc-muted)]">
                {item.label}
              </div>
              <div className="mt-1 font-black">{item.value}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="sc-button-primary w-full"
        >
          <CreditCard className="h-4 w-4" />
          Continue to payment
        </button>
      </section>
    </motion.main>
  );
}

function ScPaymentStateBadge({ state }: { state: ScPaymentUiState }) {
  const tone =
    state === "Verified"
      ? "success"
      : state === "Failed" || state === "Cancelled"
        ? "danger"
        : state === "Processing"
          ? "warning"
          : "info";

  return <ScStatusPill tone={tone}>{state}</ScStatusPill>;
}

function ScPaymentPendingView({
  ticket,
  onBack,
  onPaymentReady,
}: {
  ticket: PendingPaymentTicket;
  onBack: () => void;
  onPaymentReady: (code: string) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const [networkConfirmed, setNetworkConfirmed] = useState(false);
  const [selectedUpiApp, setSelectedUpiApp] =
    useState<(typeof UPI_APP_OPTIONS)[number]["id"]>("phonepe");
  const [deviceFingerprint] = useState(() => getOrCreateDeviceFingerprint());
  const registeredScanRef = useRef(false);
  const activationRequestedRef = useRef(false);
  const upiId = savedUpiId();
  const statusQuery = trpc.ticket.paymentStatus.useQuery(
    { code: ticket.code },
    { refetchInterval: 3000 }
  );
  const registerTicketScan = trpc.payment.registerTicketScan.useMutation();
  const verifyPayment = trpc.payment.verifyGatewayPayment.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      void statusQuery.refetch();
    },
    onError: err => {
      setSubmitted(false);
      setGatewayError(friendlyPaymentError(err.message));
    },
  });
  const createGatewayPayment = trpc.payment.createForTicket.useMutation({
    onSuccess: async data => {
      if ("alreadyPaid" in data && data.alreadyPaid) {
        setSubmitted(true);
        void statusQuery.refetch();
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
            durationMinutes: ticket.durationMinutes,
            ticketType: "qr",
          });
        },
      });
    },
    onError: err => {
      setSubmitted(false);
      setGatewayError(friendlyPaymentError(err.message));
    },
  });

  const merchantName =
    statusQuery.data?.merchantName ?? ticket.merchantName ?? "Sriyan WiFi";
  const amount = statusQuery.data?.price ?? ticket.price;
  const paymentUpiId = normalizeUpiId(
    statusQuery.data?.payment?.upiId ?? upiId
  );
  const hotspot = statusQuery.data?.hotspot;
  const approvalStatus =
    statusQuery.data?.accessApprovalStatus ?? "auto_approved";
  const paid = Boolean(statusQuery.data?.paid);
  const waitingForMerchant = paid && approvalStatus === "waiting_merchant";
  const rejectedByMerchant = paid && approvalStatus === "rejected";
  const canActivate =
    paid &&
    (approvalStatus === "approved" || approvalStatus === "auto_approved");
  const selectedUpiAppName =
    UPI_APP_OPTIONS.find(app => app.id === selectedUpiApp)?.name ?? "UPI";
  const upiIntentUrl = ticketUpiPayload({
    code: ticket.code,
    amount,
    upiId: paymentUpiId,
    merchantName,
  });
  const paymentState: ScPaymentUiState = rejectedByMerchant
    ? "Failed"
    : canActivate
      ? "Verified"
      : createGatewayPayment.isPending || verifyPayment.isPending || submitted
        ? "Processing"
        : statusQuery.isLoading
          ? "Initializing"
          : "Waiting";

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(
      ticketQrPayload({
        code: ticket.code,
        amount,
        upiId: paymentUpiId,
        merchantName,
      }),
      {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 224,
      }
    ).then(url => {
      if (!cancelled) setQrDataUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [amount, merchantName, paymentUpiId, ticket.code]);

  useEffect(() => {
    if (registeredScanRef.current) return;

    registeredScanRef.current = true;
    registerTicketScan.mutate({ code: ticket.code, deviceFingerprint });
  }, [deviceFingerprint, registerTicketScan, ticket.code]);

  useEffect(() => {
    if (!canActivate || activationRequestedRef.current) return;
    activationRequestedRef.current = true;
    const timeoutId = window.setTimeout(() => onPaymentReady(ticket.code), 900);
    return () => window.clearTimeout(timeoutId);
  }, [canActivate, onPaymentReady, ticket.code]);

  return (
    <motion.main
      key="payment"
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -22 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.9fr_1.1fr]"
    >
      <section className="space-y-5">
        <button type="button" onClick={onBack} className="sc-button">
          <ChevronLeft className="h-4 w-4" />
          Plan details
        </button>
        <div>
          <ScPaymentStateBadge state={paymentState} />
          <h1 className="sc-title mt-4">Payment verification</h1>
          <p className="sc-subtitle mt-3">
            Merchant, plan, amount, duration, data and payment state remain
            visible while the secure transaction completes.
          </p>
        </div>
        <ScFlowRail active={canActivate ? "connect" : "pay"} />

        <div className="sc-grid-2">
          {(
            [
              "Initializing",
              "Waiting",
              "Processing",
              "Verified",
              "Failed",
              "Cancelled",
            ] as const
          ).map(state => (
            <div
              key={state}
              className={`sc-card ${
                paymentState === state ? "border-[var(--sc-primary)]" : ""
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-black">
                {state === "Verified" ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--sc-success)]" />
                ) : state === "Failed" || state === "Cancelled" ? (
                  <XCircle className="h-4 w-4 text-[var(--sc-danger)]" />
                ) : (
                  <Clock className="h-4 w-4 text-[var(--sc-warning)]" />
                )}
                {state}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sc-panel space-y-5">
        <div className="sc-row">
          <div>
            <div className="sc-kicker">Paying</div>
            <div className="text-2xl font-black">{merchantName}</div>
          </div>
          <div className="text-right">
            <div className="sc-kicker">Amount</div>
            <div className="text-3xl font-black">
              Rs. {formatUpiAmount(amount)}
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[230px_1fr]">
          <div className="rounded-lg border border-[var(--sc-line)] bg-white p-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`UPI payment QR for ${ticket.code}`}
                className="h-full w-full rounded-md"
              />
            ) : (
              <div className="sc-skeleton h-[198px] rounded-md" />
            )}
          </div>
          <div className="space-y-3">
            {[
              {
                icon: Wifi,
                label: "Network",
                value: hotspot?.ssid ?? "Sriyan_Guest",
              },
              {
                icon: Timer,
                label: "Duration",
                value: `${ticket.durationMinutes} minutes`,
              },
              {
                icon: Database,
                label: "Data",
                value: ticket.price > 0 ? "1.5 GB fair use" : "Merchant limit",
              },
              {
                icon: CreditCard,
                label: "Token",
                value: ticketUpiTransactionRef(ticket.code),
              },
            ].map(item => (
              <div key={item.label} className="sc-card">
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 text-[var(--sc-primary)]" />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[var(--sc-muted)]">
                      {item.label}
                    </div>
                    <div className="break-words font-black">{item.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="sc-card flex items-start gap-3">
          <input
            type="checkbox"
            checked={networkConfirmed}
            onChange={event => setNetworkConfirmed(event.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--sc-primary)]"
          />
          <span>
            <span className="block font-black">I am on the merchant WiFi</span>
            <span className="text-sm font-semibold text-[var(--sc-muted)]">
              Router or phone hotspot access is checked before internet is
              authorized.
            </span>
          </span>
        </label>

        <div>
          <div className="sc-label">Choose UPI app</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {UPI_APP_OPTIONS.map(app => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedUpiApp(app.id)}
                className={`sc-button h-auto min-h-[58px] flex-col px-2 ${
                  selectedUpiApp === app.id ? "border-[var(--sc-primary)]" : ""
                }`}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-md text-xs font-black text-white"
                  style={{ background: app.color }}
                >
                  {app.name.charAt(0)}
                </span>
                <span className="text-xs">{app.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <a href={upiIntentUrl} className="sc-button">
            <WalletCards className="h-4 w-4" />
            Open UPI app
          </a>
          <button
            type="button"
            onClick={() => {
              setSubmitted(true);
              setGatewayError("");
              createGatewayPayment.mutate({
                code: ticket.code,
                deviceFingerprint,
                returnUrl: `${window.location.origin}/connect?code=${encodeURIComponent(ticket.code)}`,
              });
            }}
            disabled={
              !networkConfirmed ||
              createGatewayPayment.isPending ||
              verifyPayment.isPending ||
              submitted ||
              paid
            }
            className="sc-button-primary"
          >
            {paid
              ? waitingForMerchant
                ? "Waiting for merchant"
                : rejectedByMerchant
                  ? "Access stopped"
                  : "Activating WiFi"
              : submitted
                ? "Watching payment"
                : `Pay with ${selectedUpiAppName}`}
          </button>
        </div>

        {waitingForMerchant && (
          <div className="sc-alert p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-[var(--sc-warning)]" />
              <div>
                <div className="font-black">Payment received</div>
                <p className="text-sm font-semibold text-[var(--sc-muted)]">
                  Waiting for the merchant to approve network sharing.
                </p>
              </div>
            </div>
          </div>
        )}

        {(gatewayError || rejectedByMerchant) && (
          <div className="sc-alert p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--sc-danger)]" />
              <p className="text-sm font-semibold">
                {gatewayError ||
                  "The merchant stopped sharing network access for this ticket."}
              </p>
            </div>
          </div>
        )}
      </section>
    </motion.main>
  );
}

function ScSecuringConnectionView({
  session,
  onComplete,
}: {
  session: SessionInfo;
  onComplete: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const steps = useMemo(
    () => [
      { label: "QR verification", icon: QrCode },
      { label: "Payment verification", icon: IndianRupee },
      { label: "Network check", icon: Router },
      { label: "Capacity check", icon: Users },
      { label: "Authorization", icon: ShieldCheck },
      { label: "Connected", icon: Wifi },
    ],
    []
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex(current => {
        if (current >= steps.length - 1) {
          window.clearInterval(intervalId);
          window.setTimeout(onComplete, 600);
          return current;
        }
        return current + 1;
      });
    }, 680);

    return () => window.clearInterval(intervalId);
  }, [onComplete, steps.length]);

  return (
    <motion.main
      key="securing"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center"
    >
      <section className="space-y-5">
        <ScStatusPill tone="info">
          <Zap className="h-4 w-4" />
          Securing your connection
        </ScStatusPill>
        <h1 className="sc-title">Securing Your Connection</h1>
        <p className="sc-subtitle">
          Sriyan is matching your ticket, payment and device with{" "}
          {session.ssid} before opening internet access.
        </p>
        <div className="sc-grid-2">
          {steps.map((step, index) => (
            <div
              key={step.label}
              className={`sc-card ${
                index <= activeIndex ? "border-[var(--sc-primary)]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="sc-icon-box">
                  {index < activeIndex ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <div className="font-black">{step.label}</div>
                  <div className="text-xs font-semibold text-[var(--sc-muted)]">
                    {index < activeIndex
                      ? "Verified"
                      : index === activeIndex
                        ? "Checking now"
                        : "Queued"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <ScSecurityVisual label="Securing router cloud customer connection" connected />
    </motion.main>
  );
}

function ScActiveSessionView({
  session,
  locale,
  onDone,
}: {
  session: SessionInfo;
  locale: ScCustomerLocale;
  onDone: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(session.durationMinutes || 60);
  const [paused, setPaused] = useState(false);
  const percentRemaining = Math.max(
    8,
    Math.min(100, (timeLeft / Math.max(session.durationMinutes, 1)) * 100)
  );
  const hours = Math.floor(timeLeft / 60);
  const mins = timeLeft % 60;
  const expiry = new Date(
    new Date(session.startedAt).getTime() + session.durationMinutes * 60_000
  );
  const dataValue = session.dataLimitMb
    ? `${Math.max(session.dataLimitMb - 128, 0)} MB`
    : "Unlimited";
  const sourceLabel =
    session.internetSource === "phone_hotspot" ? "Phone hotspot" : "Router WiFi";

  useEffect(() => {
    if (paused) return;
    const intervalId = window.setInterval(() => {
      setTimeLeft(current => (current > 0 ? current - 1 : 0));
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [paused]);

  return (
    <motion.main
      key="session"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="sc-shell space-y-6"
    >
      <section className="sc-row">
        <div>
          <ScStatusPill tone="success">
            <CheckCircle2 className="h-4 w-4" />
            {SC_CUSTOMER_COPY[locale].connected}
          </ScStatusPill>
          <h1 className="sc-title mt-4">Active session</h1>
          <p className="sc-subtitle mt-2">
            Live remaining time, data, speed, expiry and network quality.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="sc-button"
          >
            {paused ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            {paused ? "Resume view" : "Pause view"}
          </button>
          <button type="button" onClick={onDone} className="sc-button">
            <Power className="h-4 w-4" />
            New access
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="sc-panel space-y-5">
          <ScSecurityVisual label="Active secure WiFi connection visualization" connected />
          <div className="sc-grid-3">
            {[
              { icon: Wifi, label: "Network", value: session.ssid },
              { icon: Radio, label: "Source", value: sourceLabel },
              {
                icon: Activity,
                label: "Quality",
                value: "Excellent - 92%",
              },
            ].map(item => (
              <div key={item.label} className="sc-card">
                <item.icon className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
                <div className="text-xs font-black text-[var(--sc-muted)]">
                  {item.label}
                </div>
                <div className="mt-1 font-black">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sc-panel space-y-5">
          <div className="grid place-items-center">
            <div
              className="sc-progress-ring"
              style={{ "--sc-progress": `${percentRemaining}%` } as CSSProperties}
              aria-label={`${Math.round(percentRemaining)} percent session time remaining`}
            >
              <span>
                {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-3 text-sm font-black text-[var(--sc-muted)]">
              Remaining time
            </div>
          </div>

          <div className="sc-grid-2">
            {[
              {
                icon: Database,
                label: "Remaining data",
                value: dataValue,
              },
              {
                icon: Timer,
                label: "Plan",
                value: `${session.durationMinutes} min`,
              },
              {
                icon: Gauge,
                label: "Speed",
                value: session.speedLimitMbps
                  ? `${session.speedLimitMbps} Mbps`
                  : "Standard",
              },
              {
                icon: Clock,
                label: "Expiry",
                value: expiry.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ].map(item => (
              <div key={item.label} className="sc-card">
                <item.icon className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                <div className="text-xs font-black text-[var(--sc-muted)]">
                  {item.label}
                </div>
                <div className="mt-1 font-black">{item.value}</div>
              </div>
            ))}
          </div>

          {(session.routerBrand || session.routerIp || session.hotspotDeviceName) && (
            <div className="sc-card">
              <div className="text-xs font-black text-[var(--sc-muted)]">
                Controller
              </div>
              <div className="mt-1 font-black">
                {session.internetSource === "phone_hotspot"
                  ? (session.hotspotDeviceName ?? "Merchant phone hotspot")
                  : [session.routerBrand, session.routerModel]
                      .filter(Boolean)
                      .join(" ") || "Configured router"}
              </div>
              {session.routerIp && session.internetSource !== "phone_hotspot" && (
                <div className="text-sm font-semibold text-[var(--sc-muted)]">
                  Gateway {session.routerIp}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </motion.main>
  );
}

function ScQueueView({ onActivate }: { onActivate: () => void }) {
  const [slotOpen, setSlotOpen] = useState(false);

  return (
    <motion.main
      key="queue"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="sc-shell grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
    >
      <section className="space-y-5">
        <ScStatusPill tone={slotOpen ? "success" : "warning"}>
          <Users className="h-4 w-4" />
          {slotOpen ? "Slot available" : "Network busy"}
        </ScStatusPill>
        <h1 className="sc-title">Queue</h1>
        <p className="sc-subtitle">
          Position, people ahead, estimated wait and expected access are shown
          before activation.
        </p>
        <div className="sc-panel space-y-4">
          <div className="sc-row">
            <div>
              <div className="sc-kicker">Your position</div>
              <div className="text-5xl font-black">{slotOpen ? "1" : "4"}</div>
            </div>
            <div className="text-right">
              <div className="sc-kicker">People ahead</div>
              <div className="text-5xl font-black">{slotOpen ? "0" : "3"}</div>
            </div>
          </div>
          <div className="sc-queue-meter">
            <span style={{ width: slotOpen ? "100%" : "62%" }} />
          </div>
          <div className="sc-grid-2">
            <div className="sc-card">
              <Clock className="mb-2 h-5 w-5 text-[var(--sc-warning)]" />
              <div className="text-xs font-black text-[var(--sc-muted)]">
                Estimated wait
              </div>
              <div className="font-black">{slotOpen ? "Ready now" : "6 min"}</div>
            </div>
            <div className="sc-card">
              <Wifi className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
              <div className="text-xs font-black text-[var(--sc-muted)]">
                Expected access
              </div>
              <div className="font-black">
                {slotOpen ? "Activate WiFi" : "10:42 PM"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={slotOpen ? onActivate : () => setSlotOpen(true)}
            className={slotOpen ? "sc-button-primary w-full" : "sc-button w-full"}
          >
            {slotOpen ? (
              <>
                <Zap className="h-4 w-4" />
                Activate WiFi
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Simulate slot available
              </>
            )}
          </button>
        </div>
      </section>
      <ScSecurityVisual label="Live queue router capacity indicator" />
    </motion.main>
  );
}

function ScSimpleCustomerPanel({
  view,
}: {
  view: "history" | "notifications" | "profile" | "help";
}) {
  const content = {
    history: {
      icon: History,
      title: "History",
      subtitle: "Recent tickets, payments and completed sessions.",
      empty: "No completed sessions yet.",
    },
    notifications: {
      icon: Bell,
      title: "Notifications",
      subtitle: "Payment, ticket, queue and session expiry updates.",
      empty: "No new alerts.",
    },
    profile: {
      icon: User,
      title: "Profile",
      subtitle: "Device identity, language, permissions and trusted access.",
      empty: "Device is ready for Sriyan verification.",
    },
    help: {
      icon: HelpCircle,
      title: "Help",
      subtitle: "Recover from invalid OTP, expired QR, failed payment or offline router.",
      empty: "Choose Scan WiFi QR again after the merchant refreshes the token.",
    },
  }[view];
  const Icon = content.icon;

  return (
    <motion.main
      key={view}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="sc-shell"
    >
      <section className="sc-panel mx-auto max-w-3xl text-center">
        <span className="sc-brand-mark mx-auto mb-5">
          <Icon className="h-5 w-5" />
        </span>
        <h1 className="sc-title">{content.title}</h1>
        <p className="sc-subtitle mx-auto mt-3 max-w-xl">{content.subtitle}</p>
        <div className="sc-card mt-6 text-left">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--sc-info)]" />
            <div>
              <div className="font-black">{content.empty}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
                Loading, empty, offline and permission states use the same
                status language across the customer journey.
              </div>
            </div>
          </div>
        </div>
      </section>
    </motion.main>
  );
}

function ScBottomNav({
  activeView,
  onNavigate,
}: {
  activeView: ScCustomerView;
  onNavigate: (view: ScCustomerView) => void;
}) {
  const navItems = [
    { id: "home", label: "Home", icon: HomeIcon },
    { id: "queue", label: "Queue", icon: Users },
    { id: "history", label: "History", icon: History },
    { id: "notifications", label: "Alerts", icon: Bell },
    { id: "profile", label: "Profile", icon: User },
    { id: "help", label: "Help", icon: HelpCircle },
  ] as const;

  return (
    <nav className="sc-bottom-nav" aria-label="Customer navigation">
      {navItems.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onNavigate(item.id)}
          aria-current={activeView === item.id ? "page" : undefined}
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function CustomerPortal() {
  const [view, setView] = useState<ScCustomerView>("home");
  const [method, setMethod] = useState<"qr" | "otp">("qr");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pendingTicket, setPendingTicket] =
    useState<PendingPaymentTicket | null>(null);
  const [error, setError] = useState("");
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [locale, setLocale] = useState<ScCustomerLocale>("en");
  const [darkMode, setDarkMode] = useScTheme();

  const validateMutation = trpc.ticket.validate.useMutation({
    onSuccess: data => {
      if (data.success && data.session) {
        setSession(data.session);
        setPendingTicket(null);
        setError("");
        setView("securing");
        return;
      }

      const paymentData = data as {
        paymentRequired?: boolean;
        ticket?: PendingPaymentTicket;
        error?: string;
      };

      if (paymentData.paymentRequired && paymentData.ticket) {
        setPendingTicket(paymentData.ticket);
        setError("");
        setView("details");
        return;
      }

      setError(paymentData.error || "Invalid ticket or OTP.");
    },
    onError: err => {
      setError(err.message);
    },
  });

  const handleMethodSelect = (selectedMethod: "qr" | "otp") => {
    setMethod(selectedMethod);
    setView("entry");
    setError("");
  };

  const handleCodeSubmit = (code: string) => {
    setError("");
    setPendingTicket(null);
    validateMutation.mutate({
      code,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
  };

  const handlePaymentReady = (code: string) => {
    setError("");
    validateMutation.mutate({
      code,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
  };

  const handleReset = () => {
    setView("home");
    setSession(null);
    setPendingTicket(null);
    setError("");
  };

  useEffect(() => {
    if (autoSubmitted) return;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;

    const normalizedCode = code.trim().toUpperCase();
    setAutoSubmitted(true);
    setMethod(normalizedCode.length === 6 ? "otp" : "qr");
    setView("entry");
    setError("");
    validateMutation.mutate({
      code: normalizedCode,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
    window.history.replaceState(null, "", "/connect");
  }, [autoSubmitted, validateMutation]);

  return (
    <div className={`sc-app ${darkMode ? "sc-dark" : ""}`}>
      <div className="sc-page">
        <ScCustomerHeader
          locale={locale}
          setLocale={setLocale}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        <AnimatePresence mode="wait">
          {view === "home" && (
            <ScCustomerHome
              locale={locale}
              onSelect={handleMethodSelect}
              onNavigate={setView}
            />
          )}
          {view === "entry" && (
            <ScCodeEntry
              method={method}
              onBack={() => setView("home")}
              onSubmit={handleCodeSubmit}
              isSubmitting={validateMutation.isPending}
            />
          )}
          {view === "details" && pendingTicket && (
            <ScPlanDetailsView
              ticket={pendingTicket}
              onBack={() => setView("entry")}
              onContinue={() => setView("payment")}
            />
          )}
          {view === "payment" && pendingTicket && (
            <ScPaymentPendingView
              ticket={pendingTicket}
              onBack={() => setView("details")}
              onPaymentReady={handlePaymentReady}
            />
          )}
          {view === "securing" && session && (
            <ScSecuringConnectionView
              session={session}
              onComplete={() => setView("session")}
            />
          )}
          {view === "session" && session && (
            <ScActiveSessionView
              session={session}
              locale={locale}
              onDone={handleReset}
            />
          )}
          {view === "queue" && (
            <ScQueueView onActivate={() => handleMethodSelect("qr")} />
          )}
          {["history", "notifications", "profile", "help"].includes(view) && (
            <ScSimpleCustomerPanel
              view={view as "history" | "notifications" | "profile" | "help"}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="sc-shell mt-5"
            >
              <div className="sc-alert p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--sc-danger)]" />
                  <div>
                    <div className="font-black">Connection could not continue</div>
                    <p className="text-sm font-semibold text-[var(--sc-muted)]">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {validateMutation.isPending && view !== "entry" && (
          <div className="sc-shell mt-5">
            <div className="sc-panel flex items-center gap-3">
              <Radio className="h-5 w-5 animate-pulse text-[var(--sc-primary)]" />
              <div>
                <div className="font-black">Verifying access in real time</div>
                <div className="text-sm font-semibold text-[var(--sc-muted)]">
                  Ticket, payment, capacity and authorization are being checked.
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="sc-shell mt-8 pb-16 text-center text-xs font-bold text-[var(--sc-muted)]">
          Powered by Sriyan WiFi. {COPYRIGHT_TEXT}
        </footer>
      </div>
      <ScBottomNav activeView={view} onNavigate={setView} />
    </div>
  );
}

// Step 2: Enter code
function CodeEntry({
  method,
  onBack,
  onSubmit,
  isSubmitting,
}: {
  method: "qr" | "otp";
  onBack: () => void;
  onSubmit: (code: string) => void;
  isSubmitting: boolean;
}) {
  const [code, setCode] = useState("");
  const isOtp = method === "otp";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (code.trim()) onSubmit(code.trim().toUpperCase());
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-md mx-auto"
    >
      <button
        onClick={onBack}
        className="neu-btn p-2 mb-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="text-center mb-8">
        <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          {isOtp ? (
            <KeyRound className="w-10 h-10 text-[var(--accent-success)]" />
          ) : (
            <QrCode className="w-10 h-10 text-[var(--accent-primary)]" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          {isOtp ? "Enter OTP Code" : "Enter Ticket Code"}
        </h2>
        <p className="text-[var(--text-secondary)]">
          {isOtp
            ? "Type the 6-digit OTP shown on the merchant's screen"
            : "Type the ticket code or scan the QR code"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="neu-pressed p-2 rounded-xl">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder={isOtp ? "000000" : "XXXX-XXXX-XXXX"}
            maxLength={isOtp ? 6 : 20}
            className="w-full bg-transparent text-center text-3xl font-bold tracking-[0.3em] text-[var(--text-primary)] outline-none py-4 placeholder:text-[var(--shadow-dark)]"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || code.length < (isOtp ? 6 : 4)}
          className="neu-btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50"
        >
          {isSubmitting ? "Verifying..." : "Connect to WiFi"}
        </button>
      </form>

      <div className="mt-6 p-4 neu-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--accent-warning)] shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)] mb-1">
              Having trouble?
            </p>
            <p>
              Ask the merchant for a new code. Each code can only be used once
              and expires automatically.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Step 3: Access ready
function ConnectedView({
  session,
  onDone,
}: {
  session: SessionInfo;
  onDone: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(session?.durationMinutes || 60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev: number) => (prev > 0 ? prev - 1 : 0));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(timeLeft / 60);
  const mins = timeLeft % 60;
  const sourceLabel =
    session.internetSource === "phone_hotspot"
      ? "Phone Hotspot"
      : "Router WiFi";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        className="neu-lg w-24 h-24 mx-auto mb-6 flex items-center justify-center animate-pulse-glow rounded-full"
      >
        <Check className="w-12 h-12 text-[var(--accent-success)]" />
      </motion.div>

      <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        WiFi Access Ready
      </h2>
      <p className="text-[var(--text-secondary)] mb-8">
        Join the network below from this device to use your active session.
      </p>

      <div className="neu-flat p-6 mb-6">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Wifi className="w-5 h-5 text-[var(--accent-success)]" />
          <span className="font-semibold text-[var(--text-primary)]">
            {session.ssid}
          </span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] mb-4">
          {sourceLabel}
        </div>

        <div className="neu-pressed p-4 rounded-xl mb-4">
          <div className="text-sm text-[var(--text-secondary)] mb-1">
            Time Remaining
          </div>
          <div className="text-4xl font-bold text-gradient">
            {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Speed</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {session.speedLimitMbps
                ? `${session.speedLimitMbps} Mbps`
                : "Standard"}
            </div>
          </div>
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Data</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {session.dataLimitMb ? `${session.dataLimitMb} MB` : "Unlimited"}
            </div>
          </div>
        </div>

        {(session.routerBrand ||
          session.routerIp ||
          session.hotspotDeviceName) && (
          <div className="neu-sm p-3 mt-3 text-left">
            <div className="text-xs text-[var(--text-secondary)]">
              Controller
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {session.internetSource === "phone_hotspot"
                ? (session.hotspotDeviceName ?? "Merchant phone hotspot")
                : [session.routerBrand, session.routerModel]
                    .filter(Boolean)
                    .join(" ") || "Configured router"}
            </div>
            {session.routerIp && session.internetSource !== "phone_hotspot" && (
              <div className="text-xs text-[var(--text-secondary)]">
                Gateway {session.routerIp}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security badge */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Shield className="w-3.5 h-3.5 text-[var(--accent-success)]" />
          Encrypted
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Database className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          Ledger Verified
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Zap className="w-3.5 h-3.5 text-[var(--accent-warning)]" />
          Device Bound
        </div>
      </div>

      <button
        onClick={onDone}
        className="neu-btn px-8 py-3 text-[var(--text-primary)]"
      >
        Use Another Code
      </button>
    </motion.div>
  );
}

function savedUpiId() {
  if (typeof window === "undefined") return DEFAULT_UPI_ID;
  return (
    window.localStorage.getItem("sriyan-merchant-upi-id") ||
    DEFAULT_UPI_ID
  );
}

function PaymentPendingView({
  ticket,
  onBack,
  onPaymentReady,
}: {
  ticket: PendingPaymentTicket;
  onBack: () => void;
  onPaymentReady: (code: string) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const [networkConfirmed, setNetworkConfirmed] = useState(false);
  const [selectedUpiApp, setSelectedUpiApp] =
    useState<(typeof UPI_APP_OPTIONS)[number]["id"]>("phonepe");
  const [deviceFingerprint] = useState(() => getOrCreateDeviceFingerprint());
  const registeredScanRef = useRef(false);
  const activationRequestedRef = useRef(false);
  const upiId = savedUpiId();
  const statusQuery = trpc.ticket.paymentStatus.useQuery(
    { code: ticket.code },
    { refetchInterval: 3000 }
  );
  const registerTicketScan = trpc.payment.registerTicketScan.useMutation();
  const verifyPayment = trpc.payment.verifyGatewayPayment.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      void statusQuery.refetch();
    },
    onError: err => {
      setSubmitted(false);
      setGatewayError(friendlyPaymentError(err.message));
    },
  });
  const createGatewayPayment = trpc.payment.createForTicket.useMutation({
    onSuccess: async data => {
      if ("alreadyPaid" in data && data.alreadyPaid) {
        setSubmitted(true);
        void statusQuery.refetch();
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
            durationMinutes: ticket.durationMinutes,
            ticketType: "qr",
          });
        },
      });
    },
    onError: err => {
      setSubmitted(false);
      setGatewayError(friendlyPaymentError(err.message));
    },
  });
  const merchantName =
    statusQuery.data?.merchantName ?? ticket.merchantName ?? "Sriyan WiFi";
  const amount = statusQuery.data?.price ?? ticket.price;
  const paymentUpiId = normalizeUpiId(
    statusQuery.data?.payment?.upiId ?? upiId
  );
  const hotspot = statusQuery.data?.hotspot;
  const approvalStatus =
    statusQuery.data?.accessApprovalStatus ?? "auto_approved";
  const paid = Boolean(statusQuery.data?.paid);
  const waitingForMerchant = paid && approvalStatus === "waiting_merchant";
  const rejectedByMerchant = paid && approvalStatus === "rejected";
  const canActivate =
    paid &&
    (approvalStatus === "approved" || approvalStatus === "auto_approved");
  const selectedUpiAppName =
    UPI_APP_OPTIONS.find(app => app.id === selectedUpiApp)?.name ?? "UPI";
  const upiIntentUrl = ticketUpiPayload({
    code: ticket.code,
    amount,
    upiId: paymentUpiId,
    merchantName,
  });

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(
      ticketQrPayload({
        code: ticket.code,
        amount,
        upiId: paymentUpiId,
        merchantName,
      }),
      {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 192,
      }
    ).then(url => {
      if (!cancelled) setQrDataUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [amount, merchantName, paymentUpiId, ticket.code]);

  useEffect(() => {
    if (registeredScanRef.current) return;

    registeredScanRef.current = true;
    registerTicketScan.mutate({ code: ticket.code, deviceFingerprint });
  }, [deviceFingerprint, registerTicketScan, ticket.code]);

  useEffect(() => {
    if (!canActivate || activationRequestedRef.current) return;
    activationRequestedRef.current = true;
    onPaymentReady(ticket.code);
  }, [canActivate, onPaymentReady, ticket.code]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-md mx-auto text-center"
    >
      <button
        onClick={onBack}
        className="neu-btn p-2 mb-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
        <IndianRupee className="w-10 h-10 text-[var(--accent-success)]" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        Payment Required
      </h2>
      <p className="text-[var(--text-secondary)] mb-6">
        First join the merchant network, then pay the locked ticket amount.
      </p>

      <div className="neu-flat p-6 mb-5">
        <div className="neu-sm p-4 mb-4 text-left">
          <div className="flex items-start gap-3">
            <Wifi className="w-5 h-5 text-[var(--accent-success)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-[var(--text-secondary)]">
                Step 1: Connect network
              </div>
              <div className="font-bold text-[var(--text-primary)]">
                {hotspot?.ssid ?? "Sriyan_Guest"}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                {hotspot?.internetSource === "phone_hotspot"
                  ? (hotspot.hotspotDeviceName ?? "Merchant phone hotspot")
                  : hotspot?.routerIp
                    ? `Gateway ${hotspot.routerIp}`
                    : "Merchant WiFi / captive portal"}
              </div>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={networkConfirmed}
              onChange={event => setNetworkConfirmed(event.target.checked)}
              className="accent-[var(--accent-primary)]"
            />
            I am connected to this network
          </label>
        </div>

        <div className="neu-pressed p-5 rounded-xl inline-block mb-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`UPI payment ${ticket.code}`}
              className="w-36 h-36 rounded-lg"
            />
          ) : (
            <QrCode className="w-36 h-36 text-[var(--accent-primary)]" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Amount</div>
            <div className="font-bold text-[var(--text-primary)]">
              Rs. {formatUpiAmount(amount)}
            </div>
          </div>
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Status</div>
            <div className="font-bold text-[var(--text-primary)]">
              {statusQuery.data?.paid ? "Paid" : "Pending"}
            </div>
          </div>
        </div>

        <div className="neu-sm p-3 mt-3 text-left">
          <div className="text-xs text-[var(--text-secondary)]">
            Payment token
          </div>
          <code className="text-sm text-[var(--text-primary)] break-all">
            {ticketUpiTransactionRef(ticket.code)}
          </code>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Scan the QR with any UPI app for the locked amount. Sriyan unlocks
            internet after signed gateway confirmation or merchant UPI
            reference confirmation.
          </div>
        </div>

        <a
          href={upiIntentUrl}
          className="neu-btn mt-3 w-full py-3 font-semibold flex items-center justify-center gap-2"
        >
          <IndianRupee className="w-4 h-4" />
          Open UPI App
        </a>

        <div className="mt-4 text-left">
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                Step 2: Choose UPI app
              </div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Direct UPI scans are real payments. If the merchant has not enabled
            a gateway, show the UPI reference/UTR to the merchant for instant
            confirmation.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {UPI_APP_OPTIONS.map(app => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedUpiApp(app.id)}
                className={`neu-btn p-3 flex items-center gap-3 text-left ${
                  selectedUpiApp === app.id
                    ? "ring-2 ring-[var(--accent-primary)]"
                    : ""
                }`}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black"
                  style={{ background: app.color }}
                >
                  {app.name.charAt(0)}
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {waitingForMerchant && (
        <div className="neu-flat p-4 mb-4 border-l-4 border-[var(--accent-warning)] text-left">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-[var(--accent-warning)] shrink-0 mt-0.5 animate-spin" />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                Payment received
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Waiting for the merchant to continue sharing network access.
              </p>
            </div>
          </div>
        </div>
      )}

      {rejectedByMerchant && (
        <div className="neu-flat p-4 mb-4 border-l-4 border-[var(--accent-danger)] text-left">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                Network sharing stopped
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                The merchant stopped sharing access for this ticket.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setSubmitted(true);
          setGatewayError("");
          createGatewayPayment.mutate({
            code: ticket.code,
            deviceFingerprint,
            returnUrl: `${window.location.origin}/connect?code=${encodeURIComponent(ticket.code)}`,
          });
        }}
        disabled={
          !networkConfirmed ||
          createGatewayPayment.isPending ||
          verifyPayment.isPending ||
          submitted ||
          paid
        }
        className="neu-btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50"
      >
        {paid
          ? waitingForMerchant
            ? "Waiting for merchant..."
            : rejectedByMerchant
              ? "Access stopped"
              : "Activating network..."
          : submitted
            ? "Waiting for gateway..."
            : createGatewayPayment.isPending || verifyPayment.isPending
              ? "Opening payment..."
              : `Pay with ${selectedUpiAppName}`}
      </button>

      {gatewayError && (
        <p className="text-sm text-[var(--accent-danger)] mt-3">
          {gatewayError}
        </p>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
        <Clock className="w-3.5 h-3.5" />
        Watching token in real time
      </div>
    </motion.div>
  );
}

// Legacy customer portal kept referenced for rollback while the Sriyan
// experience below is the active export.
function LegacyCustomerPortal() {
  const [step, setStep] = useState<
    "method" | "code" | "paymentPending" | "connected"
  >("method");
  const [method, setMethod] = useState<"qr" | "otp">("qr");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pendingTicket, setPendingTicket] =
    useState<PendingPaymentTicket | null>(null);
  const [error, setError] = useState("");
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const validateMutation = trpc.ticket.validate.useMutation({
    onSuccess: data => {
      if (data.success && data.session) {
        setSession(data.session);
        setStep("connected");
        setError("");
      } else {
        const paymentData = data as {
          paymentRequired?: boolean;
          ticket?: PendingPaymentTicket;
          error?: string;
        };

        if (paymentData.paymentRequired && paymentData.ticket) {
          setPendingTicket(paymentData.ticket);
          setStep("paymentPending");
          setError("");
          return;
        }

        setError(paymentData.error || "Invalid ticket");
      }
    },
    onError: err => {
      setError(err.message);
    },
  });

  const handleMethodSelect = (m: "qr" | "otp") => {
    setMethod(m);
    setStep("code");
    setError("");
  };

  const handleCodeSubmit = (code: string) => {
    setError("");
    setPendingTicket(null);
    validateMutation.mutate({
      code,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
  };

  useEffect(() => {
    if (autoSubmitted) return;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;

    const normalizedCode = code.trim().toUpperCase();
    setAutoSubmitted(true);
    setMethod(normalizedCode.length === 6 ? "otp" : "qr");
    setStep("code");
    setError("");
    validateMutation.mutate({
      code: normalizedCode,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
    window.history.replaceState(null, "", "/connect");
  }, [autoSubmitted, validateMutation]);

  const handleDone = () => {
    setStep("method");
    setSession(null);
    setPendingTicket(null);
    setError("");
  };

  const handlePaymentReady = (code: string) => {
    setError("");
    validateMutation.mutate({
      code,
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 p-4 z-10">
        <div className="mx-auto max-w-lg flex items-center justify-between">
          <Link to="/" className="neu-btn p-2.5 flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-success)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Secure Connection
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="w-full max-w-lg mt-16">
        <AnimatePresence mode="wait">
          {step === "method" && (
            <MethodSelection key="method" onSelect={handleMethodSelect} />
          )}
          {step === "code" && (
            <CodeEntry
              key="code"
              method={method}
              onBack={() => setStep("method")}
              onSubmit={handleCodeSubmit}
              isSubmitting={validateMutation.isPending}
            />
          )}
          {step === "paymentPending" && pendingTicket && (
            <PaymentPendingView
              key="paymentPending"
              ticket={pendingTicket}
              onBack={() => setStep("code")}
              onPaymentReady={handlePaymentReady}
            />
          )}
          {step === "connected" && session && (
            <ConnectedView
              key="connected"
              session={session}
              onDone={handleDone}
            />
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-4 neu-flat border-l-4 border-[var(--accent-danger)]"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0" />
                <div>
                  <p className="font-medium text-[var(--text-primary)]">
                    Connection Failed
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {error}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {validateMutation.isPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center"
          >
            <div className="neu-sm w-12 h-12 mx-auto flex items-center justify-center">
              <Clock className="w-6 h-6 text-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Verifying payment token...
            </p>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-[var(--text-secondary)]">
          Powered by{" "}
          <span className="text-gradient font-semibold">Sriyan</span> WiFi.{" "}
          {COPYRIGHT_TEXT}
        </p>
      </footer>
    </div>
  );
}
