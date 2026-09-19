import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import {
  DEFAULT_UPI_ID,
  formatUpiAmount,
  isPaidAmount,
  isValidUpiId,
  normalizeUpiId,
  ticketHotspotUrl,
  ticketQrPayload,
  ticketUpiPayload,
  ticketUpiTransactionRef,
} from "@/lib/upi";
import QRCode from "qrcode";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Cloud,
  Wifi,
  QrCode,
  KeyRound,
  Plus,
  Copy,
  Check,
  X,
  Users,
  TrendingUp,
  Clock,
  Timer,
  CreditCard,
  Gauge,
  BarChart3,
  Database,
  Settings,
  Bell,
  HelpCircle,
  History,
  Layers,
  LogOut,
  LockKeyhole,
  MapPin,
  Moon,
  Ticket,
  Zap,
  Globe,
  IndianRupee,
  Radio,
  Router,
  Shield,
  Smartphone,
  Sun,
  Signal,
  Link2,
  ShieldCheck,
  UserCog,
  WalletCards,
  WifiOff,
  Save,
  ServerCog,
  FileCheck2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function formatCurrency(value?: number | string | null) {
  return `Rs. ${Number(value ?? 0).toLocaleString("en-IN")}`;
}

function formatRelativeTime(value?: Date | string | null) {
  if (!value) return "-";
  const created = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${Math.floor(diffHours / 24)} day ago`;
}

type PaymentDisplayRow = {
  id: number;
  ticketId?: number | null;
  transactionId?: string | null;
  metadata?: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getPaymentScanner(payment: PaymentDisplayRow) {
  const metadata = metadataRecord(payment.metadata);
  const scanner = metadataRecord(metadata.scanner);
  return { metadata, scanner };
}

function getPaymentCustomer(payment: PaymentDisplayRow) {
  const { metadata, scanner } = getPaymentScanner(payment);
  const name = metadataString(scanner.customerName);
  const phone = metadataString(scanner.customerPhone);
  const email = metadataString(scanner.customerEmail);
  const ticketCode =
    metadataString(scanner.ticketCode) || metadataString(metadata.ticketCode);
  const fingerprint = metadataString(scanner.deviceFingerprint);

  if (name) return name;
  if (phone) return phone;
  if (email) return email;
  if (ticketCode) return `Ticket ${ticketCode}`;
  if (fingerprint)
    return `Scanned device ${fingerprint.slice(-6).toUpperCase()}`;
  return payment.transactionId ?? `Payment #${payment.id}`;
}

function getPaymentSubtext(payment: PaymentDisplayRow) {
  const { metadata, scanner } = getPaymentScanner(payment);
  const ticketCode =
    metadataString(scanner.ticketCode) || metadataString(metadata.ticketCode);
  const ipAddress = metadataString(scanner.ipAddress);

  if (ticketCode && payment.transactionId)
    return `${ticketCode} - ${payment.transactionId}`;
  if (ticketCode) return ticketCode;
  if (ipAddress) return `IP ${ipAddress}`;
  return payment.transactionId ?? "";
}

const BUSINESS_TYPES = [
  "tea_shop",
  "restaurant",
  "hotel",
  "pg_hostel",
  "library",
  "school",
  "college",
  "coworking",
  "hospital",
  "railway_station",
  "bus_station",
  "apartment",
  "marriage_hall",
  "government_office",
  "public_wifi",
  "shopping_mall",
  "corporate_office",
  "airport",
  "other",
] as const;

type BusinessType = (typeof BUSINESS_TYPES)[number];
type NetworkSource = "router_wifi" | "phone_hotspot";
type GatewayMode = "captive_portal" | "phone_token_bridge";
type ControllerType =
  "mikrotik" | "openwrt" | "freeradius" | "cloud_agent" | "manual";

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  tea_shop: "Tea Shop",
  restaurant: "Restaurant",
  hotel: "Hotel",
  pg_hostel: "PG / Hostel",
  library: "Library",
  school: "School",
  college: "College",
  coworking: "Coworking",
  hospital: "Hospital",
  railway_station: "Railway Station",
  bus_station: "Bus Station",
  apartment: "Apartment",
  marriage_hall: "Marriage Hall",
  government_office: "Government Office",
  public_wifi: "Public WiFi",
  shopping_mall: "Shopping Mall",
  corporate_office: "Corporate Office",
  airport: "Airport",
  other: "Other",
};

type DashboardData =
  | {
      merchant: {
        id: number;
        businessName: string;
        businessType: BusinessType;
        gstNumber: string | null;
        upiId: string | null;
        settlementAccountName: string | null;
        settlementPhone: string | null;
        settlementVerified: boolean;
      };
      branches: Array<{
        id: number;
        ssid: string | null;
        bandwidthMbps: number | null;
        routerBrand: string | null;
        routerModel: string | null;
        routerIp: string | null;
        controllerType: ControllerType;
        controllerEndpoint: string | null;
        internetSource: NetworkSource;
        gatewayMode: GatewayMode;
        hotspotSsid: string | null;
        hotspotDeviceName: string | null;
        hotspotOwnerPhone: string | null;
      }>;
    }
  | null
  | undefined;

type GeneratedTicketState = {
  code: string;
  type: string;
  price: number;
};

// QR Code component
function QRDisplay({
  code,
  type,
  price,
  merchantName,
  upiId,
}: {
  code: string;
  type: string;
  price: number;
  merchantName?: string | null;
  upiId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const isPaidQr = type === "qr" && isPaidAmount(price);
  const upiIntentUrl = isPaidQr
    ? ticketUpiPayload({
        code,
        amount: price,
        upiId,
        merchantName,
      })
    : "";

  useEffect(() => {
    let cancelled = false;

    if (type !== "qr") {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(
      ticketQrPayload({
        code,
        amount: price,
        upiId,
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
  }, [code, merchantName, price, type, upiId]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyHotspotLink = () => {
    navigator.clipboard.writeText(ticketHotspotUrl(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="neu-flat p-6 text-center">
      <div className="neu-pressed p-6 rounded-xl inline-block mb-4">
        {type === "qr" ? (
          qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR ticket ${code}`}
              className="w-32 h-32 rounded-lg"
            />
          ) : (
            <QrCode className="w-32 h-32 text-[var(--accent-primary)]" />
          )
        ) : (
          <div className="w-32 h-32 flex items-center justify-center">
            <span className="text-3xl font-bold text-gradient tracking-widest">
              {code}
            </span>
          </div>
        )}
      </div>
      {isPaidQr && (
        <div className="neu-sm p-3 mb-4 text-left">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">Locked amount</span>
            <span className="font-bold text-[var(--text-primary)]">
              Rs. {formatUpiAmount(price)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs mt-1">
            <span className="text-[var(--text-secondary)]">UPI token</span>
            <code className="text-[var(--text-primary)]">
              {ticketUpiTransactionRef(code)}
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs mt-1">
            <span className="text-[var(--text-secondary)]">Payee</span>
            <code className="text-[var(--text-primary)]">
              {upiId || DEFAULT_UPI_ID}
            </code>
          </div>
          <a
            href={upiIntentUrl}
            className="neu-btn mt-3 w-full py-2 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <IndianRupee className="w-4 h-4" />
            Open UPI App
          </a>
        </div>
      )}
      <div className="flex items-center justify-center gap-2 mb-2">
        <code className="neu-inset px-4 py-2 rounded-lg text-sm font-mono">
          {code}
        </code>
        <button onClick={copyCode} className="neu-btn p-2">
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {isPaidQr
          ? "Scan opens any UPI app; gateway or merchant confirmation unlocks the token"
          : type === "qr"
            ? "Scan with any QR scanner"
            : "Enter OTP on connect page"}
      </p>
      <div className="neu-sm p-3 mt-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[var(--text-secondary)]">
              Hotspot link
            </div>
            <code className="text-xs text-[var(--text-primary)] break-all">
              {ticketHotspotUrl(code)}
            </code>
          </div>
          <button
            onClick={copyHotspotLink}
            className="neu-btn p-2 shrink-0"
            title="Copy hotspot link"
          >
            {copied ? (
              <Check className="w-4 h-4 text-[var(--accent-success)]" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Generate Ticket Modal
function savedUpiId(merchantUpiId?: string | null) {
  if (merchantUpiId) return normalizeUpiId(merchantUpiId);
  if (typeof window === "undefined") return DEFAULT_UPI_ID;
  return (
    window.localStorage.getItem("sriyan-merchant-upi-id") ||
    DEFAULT_UPI_ID
  );
}

function GenerateTicketModal({
  merchantId,
  merchantName,
  merchantUpiId,
  branchId,
  onClose,
}: {
  merchantId?: number;
  merchantName?: string | null;
  merchantUpiId?: string | null;
  branchId?: number;
  onClose: () => void;
}) {
  const [type, setType] = useState<"qr" | "otp">("qr");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(0);
  const [upiId, setUpiId] = useState(() => savedUpiId(merchantUpiId));
  const [generated, setGenerated] = useState<GeneratedTicketState | null>(null);
  const { data: gatewayStatus } = trpc.payment.gatewayStatus.useQuery();

  const utils = trpc.useUtils();
  const saveUpiMutation = trpc.merchant.update.useMutation({
    onSuccess: () => {
      void utils.merchant.dashboard.invalidate();
      void utils.merchant.publicDefault.invalidate();
    },
  });
  const generateMutation = trpc.ticket.generate.useMutation({
    onSuccess: data => {
      if (data.success) {
        setGenerated({
          code: data.ticket.code,
          type: data.ticket.type,
          price: data.ticket.price,
        });
        if (merchantId) {
          void utils.ticket.list.invalidate({ merchantId });
          void utils.ticket.stats.invalidate({ merchantId });
          void utils.analytics.kpis.invalidate({ merchantId });
          void utils.blockchain.list.invalidate();
          void utils.blockchain.stats.invalidate();
        }
      }
    },
  });
  const paidTicketNeedsUpi = price > 0;
  const activeGateway = gatewayStatus?.activeProvider ?? null;
  const gatewayReady = activeGateway
    ? gatewayStatus?.configured[activeGateway]
    : false;
  const gatewayMissing = activeGateway
    ? gatewayStatus?.missing[activeGateway] ?? []
    : ["PAYMENT_GATEWAY_PROVIDER"];
  const upiReady = !paidTicketNeedsUpi || isValidUpiId(upiId);
  const paidTicketReady = !paidTicketNeedsUpi || upiReady;

  const isGenerating = generateMutation.isPending || saveUpiMutation.isPending;
  const generateError = generateMutation.error || saveUpiMutation.error;

  const handleGenerate = async () => {
    if (!merchantId || !paidTicketReady) return;
    const normalizedUpiId = normalizeUpiId(upiId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sriyan-merchant-upi-id", normalizedUpiId);
    }
    try {
      if (paidTicketNeedsUpi) {
        await saveUpiMutation.mutateAsync({
          id: merchantId,
          upiId: normalizedUpiId,
          settlementAccountName: merchantName ?? undefined,
          settlementVerified: true,
        });
      }
      generateMutation.mutate({
        merchantId,
        branchId,
        type,
        durationMinutes: duration,
        price,
      });
    } catch {
      // Error is shown from the mutation state below.
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="neu-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Generate WiFi Ticket
            </h3>
            <button onClick={onClose} className="neu-btn p-2">
              <X className="w-4 h-4" />
            </button>
          </div>

          {generated ? (
            <div>
              <QRDisplay
                code={generated.code}
                type={generated.type}
                price={generated.price}
                merchantName={merchantName}
                upiId={upiId}
              />
              <button
                onClick={() => setGenerated(null)}
                className="neu-btn w-full mt-4 py-3 font-semibold text-[var(--accent-primary)]"
              >
                Generate Another
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Type selection */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Ticket Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setType("qr")}
                    className={`neu-btn py-3 flex items-center justify-center gap-2 ${type === "qr" ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
                  >
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </button>
                  <button
                    onClick={() => setType("otp")}
                    className={`neu-btn py-3 flex items-center justify-center gap-2 ${type === "otp" ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
                  >
                    <KeyRound className="w-4 h-4" />
                    OTP
                  </button>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Duration: {duration} minutes
                </label>
                <input
                  type="range"
                  min="5"
                  max="480"
                  step="5"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)]"
                />
                <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                  <span>5 min</span>
                  <span>8 hours</span>
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Price (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                  className="neu-input"
                  placeholder="0 for free"
                />
              </div>

              {price > 0 && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Merchant UPI ID
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                    className="neu-input"
                    placeholder="yourname@upi"
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-2">
                    This ticket locks Rs. {formatUpiAmount(price)} to{" "}
                    {normalizeUpiId(upiId)} and binds the UPI reference to the
                    generated token.
                  </p>
                </div>
              )}
              {paidTicketNeedsUpi && (
                <div
                  className={`neu-sm p-3 text-sm text-left border-l-4 ${
                    gatewayReady
                      ? "border-[var(--accent-success)]"
                      : "border-[var(--accent-danger)]"
                  }`}
                >
                  <div className="font-semibold text-[var(--text-primary)]">
                    Payment gateway{" "}
                    {gatewayReady ? "ready" : "not ready"}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Active provider: {activeGateway ?? "not selected"}. Paid
                    tokens auto-unlock after signed gateway confirmation, or
                    unlock after merchant UPI reference confirmation.
                  </p>
                  {!gatewayReady && (
                    <p className="text-xs text-[var(--accent-danger)] mt-2 break-all">
                      Missing: {gatewayMissing.join(", ")}
                    </p>
                  )}
                </div>
              )}
              {paidTicketNeedsUpi && !upiReady && (
                <p className="text-sm text-[var(--accent-danger)]">
                  Enter a valid UPI ID like merchant@bank before generating a
                  paid token.
                </p>
              )}
              {paidTicketNeedsUpi && upiReady && !gatewayReady && (
                <p className="text-sm text-[var(--accent-warning)]">
                  Gateway auto-unlock is not ready. This token can still be
                  paid through any UPI app and confirmed manually from Payments.
                </p>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !merchantId || !paidTicketReady}
                className="neu-btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <Clock className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isGenerating ? "Generating..." : "Generate Ticket"}
              </button>
              {generateError && (
                <p className="text-sm text-[var(--accent-danger)]">
                  {generateError.message}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Sidebar
function Sidebar({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  const { logout } = useAuth();
  const items = [
    { id: "overview", icon: BarChart3, label: "Overview" },
    { id: "tickets", icon: Ticket, label: "Tickets" },
    { id: "sessions", icon: Wifi, label: "Sessions" },
    { id: "payments", icon: CreditCard, label: "Payments" },
    { id: "gateway", icon: Router, label: "Gateway" },
    { id: "compliance", icon: FileCheck2, label: "Compliance" },
    { id: "analytics", icon: TrendingUp, label: "Analytics" },
    { id: "blockchain", icon: Database, label: "Blockchain" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="neu-flat w-64 h-screen sticky top-0 flex flex-col">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="gradient-accent p-2 rounded-lg">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gradient">Sriyan</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === item.id
                ? "neu-btn-primary text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[var(--shadow-dark)]">
        <Link
          to="/blockchain"
          className="neu-btn w-full py-2.5 text-sm flex items-center justify-center gap-2 text-[var(--text-secondary)] mb-2"
        >
          <Database className="w-4 h-4" />
          View Ledger
        </Link>
        <button
          onClick={() => logout()}
          className="neu-btn w-full py-2.5 text-sm flex items-center justify-center gap-2 text-[var(--accent-danger)]"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

// Overview Tab
function OverviewTab({
  merchantId,
  onGenerate,
}: {
  merchantId?: number;
  onGenerate: () => void;
}) {
  const { data: kpis, isLoading: kpisLoading } = trpc.analytics.kpis.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );
  const { data: peakHours } = trpc.analytics.peakHours.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );
  const { data: dailyRevenue } = trpc.payment.dailyRevenue.useQuery(
    { merchantId: merchantId ?? 0, days: 7 },
    { enabled: !!merchantId }
  );

  const sessionChartData = useMemo(
    () =>
      (peakHours ?? [])
        .filter((_, index) => index % 3 === 0)
        .map(row => ({ time: row.label, sessions: row.count })),
    [peakHours]
  );

  const revenueChartData = useMemo(() => {
    const now = new Date();
    const revenueByDay = new Map(
      (dailyRevenue ?? []).map(row => [row.day, row.revenue])
    );

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - index));
      const key = day.toISOString().slice(0, 10);

      return {
        day: day.toLocaleDateString("en-IN", { weekday: "short" }),
        revenue: revenueByDay.get(key) ?? 0,
      };
    });
  }, [dailyRevenue]);

  const cards = [
    {
      label: "Total Revenue",
      value: kpisLoading ? "..." : formatCurrency(kpis?.totalRevenue),
      icon: IndianRupee,
      color: "text-[var(--accent-primary)]",
      change: "Live",
    },
    {
      label: "Active Sessions",
      value: kpisLoading ? "..." : String(kpis?.activeNow ?? 0),
      icon: Wifi,
      color: "text-[var(--accent-success)]",
      change: "Now",
    },
    {
      label: "Total Sessions",
      value: kpisLoading ? "..." : String(kpis?.totalSessions ?? 0),
      icon: Users,
      color: "text-[var(--accent-warning)]",
      change: "All",
    },
    {
      label: "Conversion Rate",
      value: kpisLoading ? "..." : `${kpis?.conversionRate ?? 0}%`,
      icon: TrendingUp,
      color: "text-[var(--accent-danger)]",
      change: "Used",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(kpi => (
          <div key={kpi.label} className="neu-flat p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`neu-sm p-2.5 ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-[var(--accent-success)] bg-[var(--accent-success)]/10 px-2 py-0.5 rounded-full">
                {kpi.change}
              </span>
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {kpi.value}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="neu-flat p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">
            Session Activity (24h)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={sessionChartData}>
              <defs>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--shadow-dark)"
              />
              <XAxis
                dataKey="time"
                stroke="var(--text-secondary)"
                fontSize={12}
              />
              <YAxis stroke="var(--text-secondary)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-primary)",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "var(--neu-shadow-sm)",
                }}
              />
              <Area
                type="monotone"
                dataKey="sessions"
                stroke="#6366f1"
                fillOpacity={1}
                fill="url(#colorSessions)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="neu-flat p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">
            Weekly Revenue
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueChartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--shadow-dark)"
              />
              <XAxis
                dataKey="day"
                stroke="var(--text-secondary)"
                fontSize={12}
              />
              <YAxis stroke="var(--text-secondary)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-primary)",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "var(--neu-shadow-sm)",
                }}
              />
              <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="neu-flat p-6">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onGenerate}
            className="neu-btn-primary px-6 py-3 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generate Ticket
          </button>
          <Link
            to="/connect"
            className="neu-btn px-6 py-3 flex items-center gap-2 text-[var(--text-primary)]"
          >
            <Globe className="w-4 h-4" />
            View Connect Page
          </Link>
          <Link
            to="/blockchain"
            className="neu-btn px-6 py-3 flex items-center gap-2 text-[var(--text-primary)]"
          >
            <Database className="w-4 h-4" />
            View Blockchain
          </Link>
        </div>
      </div>
    </div>
  );
}

function MerchantOnboarding() {
  const utils = trpc.useUtils();
  const [businessName, setBusinessName] = useState("Sriyan Merchant");
  const [businessType, setBusinessType] = useState<BusinessType>("public_wifi");
  const [upiId, setUpiId] = useState(savedUpiId());
  const [internetSource, setInternetSource] =
    useState<NetworkSource>("router_wifi");
  const [ssid, setSsid] = useState("Sriyan_Guest");
  const [settlementPhone, setSettlementPhone] = useState("");

  const createMerchant = trpc.merchant.create.useMutation();
  const createBranch = trpc.merchant.createBranch.useMutation({
    onSuccess: () => {
      void utils.merchant.dashboard.invalidate();
      void utils.merchant.publicDefault.invalidate();
    },
  });

  const normalizedUpiId = normalizeUpiId(upiId);
  const upiReady = isValidUpiId(normalizedUpiId);
  const isSaving = createMerchant.isPending || createBranch.isPending;
  const saveError = createMerchant.error || createBranch.error;

  const handleCreate = async () => {
    if (!businessName.trim() || !upiReady || isSaving) return;

    if (typeof window !== "undefined") {
      window.localStorage.setItem("sriyan-merchant-upi-id", normalizedUpiId);
    }

    try {
      const created = await createMerchant.mutateAsync({
        businessName: businessName.trim(),
        businessType,
        upiId: normalizedUpiId,
        settlementAccountName: businessName.trim(),
        settlementPhone: settlementPhone.trim() || undefined,
      });

      await createBranch.mutateAsync({
        merchantId: created.merchantId,
        name: "Main Hotspot",
        ssid: ssid.trim() || "Sriyan_Guest",
        internetSource,
        gatewayMode:
          internetSource === "phone_hotspot"
            ? "phone_token_bridge"
            : "captive_portal",
        hotspotSsid:
          internetSource === "phone_hotspot"
            ? ssid.trim() || "Sriyan_Hotspot"
            : undefined,
        hotspotDeviceName:
          internetSource === "phone_hotspot"
            ? "Merchant phone hotspot"
            : undefined,
        hotspotOwnerPhone: settlementPhone.trim() || undefined,
        bandwidthMbps: 100,
      });
    } catch {
      // Mutation state renders the error below.
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="neu-flat p-6 mb-6 border-l-4 border-[var(--accent-primary)]">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Create Sriyan merchant account
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Add your UPI account and choose how this location provides internet.
        </p>
      </div>

      <div className="neu-flat p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Business Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={event => setBusinessName(event.target.value)}
              className="neu-input"
              placeholder="Your shop or business"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Business Type
            </label>
            <select
              value={businessType}
              onChange={event =>
                setBusinessType(event.target.value as BusinessType)
              }
              className="neu-input"
            >
              {BUSINESS_TYPES.map(type => (
                <option key={type} value={type}>
                  {BUSINESS_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Merchant UPI ID
            </label>
            <input
              type="text"
              value={upiId}
              onChange={event => setUpiId(event.target.value)}
              className="neu-input"
              placeholder="merchant@bank"
            />
            {!upiReady && (
              <p className="text-xs text-[var(--accent-danger)] mt-1">
                Enter a valid UPI ID before accepting paid tokens.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Merchant Phone
            </label>
            <input
              type="tel"
              value={settlementPhone}
              onChange={event => setSettlementPhone(event.target.value)}
              className="neu-input"
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            Internet Source
          </label>
          <div className="grid md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setInternetSource("router_wifi")}
              className={`neu-btn p-4 text-left flex items-start gap-3 ${
                internetSource === "router_wifi"
                  ? "ring-2 ring-[var(--accent-primary)]"
                  : ""
              }`}
            >
              <Router className="w-5 h-5 text-[var(--accent-primary)] mt-0.5" />
              <span>
                <span className="block font-semibold text-[var(--text-primary)]">
                  Router WiFi
                </span>
                <span className="block text-xs text-[var(--text-secondary)]">
                  Captive portal mode for shop router or public WiFi.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setInternetSource("phone_hotspot")}
              className={`neu-btn p-4 text-left flex items-start gap-3 ${
                internetSource === "phone_hotspot"
                  ? "ring-2 ring-[var(--accent-primary)]"
                  : ""
              }`}
            >
              <Smartphone className="w-5 h-5 text-[var(--accent-success)] mt-0.5" />
              <span>
                <span className="block font-semibold text-[var(--text-primary)]">
                  Phone Hotspot
                </span>
                <span className="block text-xs text-[var(--text-secondary)]">
                  Token bridge mode for merchant phone hotspot sharing.
                </span>
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Network Name
          </label>
          <input
            type="text"
            value={ssid}
            onChange={event => setSsid(event.target.value)}
            className="neu-input"
            placeholder="Sriyan_Guest"
          />
        </div>

        {saveError && (
          <p className="text-sm text-[var(--accent-danger)]">
            {saveError.message}
          </p>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={!businessName.trim() || !upiReady || isSaving}
          className="neu-btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <Clock className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isSaving ? "Creating..." : "Create Merchant Account"}
        </button>
      </div>
    </div>
  );
}

// Tickets Tab
function TicketsTab({
  merchantId,
  onGenerate,
}: {
  merchantId?: number;
  onGenerate: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const utils = trpc.useUtils();
  const ticketStatus =
    filter === "all"
      ? undefined
      : (filter as "active" | "used" | "expired" | "revoked");

  const { data: tickets, isLoading } = trpc.ticket.list.useQuery(
    { merchantId: merchantId ?? 0, status: ticketStatus, limit: 300 },
    { enabled: !!merchantId }
  );

  const revokeMutation = trpc.ticket.revoke.useMutation({
    onSuccess: async () => {
      if (!merchantId) return;
      await utils.ticket.list.invalidate({ merchantId });
      await utils.ticket.stats.invalidate({ merchantId });
      await utils.analytics.kpis.invalidate({ merchantId });
    },
  });

  const filtered = tickets ?? [];

  const statusColors: Record<string, string> = {
    active: "text-[var(--accent-success)] bg-[var(--accent-success)]/10",
    used: "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10",
    expired: "text-[var(--text-secondary)] bg-gray-200/50",
    revoked: "text-[var(--accent-danger)] bg-[var(--accent-danger)]/10",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          WiFi Tickets
        </h2>
        <button
          onClick={onGenerate}
          className="neu-btn-primary px-6 py-2.5 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Generate New
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "active", "used", "expired", "revoked"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`neu-btn px-4 py-2 text-sm capitalize ${filter === f ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Tickets grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="neu-flat p-5 text-sm text-[var(--text-secondary)]">
            Loading tickets...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="neu-flat p-5 text-sm text-[var(--text-secondary)]">
            No tickets yet. Generate a QR code or OTP to see it here.
          </div>
        )}
        {filtered.map(ticket => (
          <div key={ticket.id} className="neu-flat p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="neu-sm p-2">
                {ticket.type === "qr" ? (
                  <QrCode className="w-4 h-4 text-[var(--accent-primary)]" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[var(--accent-warning)]" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[ticket.status]}`}
                >
                  {ticket.status}
                </span>
                {ticket.status === "active" && (
                  <button
                    onClick={() =>
                      revokeMutation.mutate({ ticketId: ticket.id })
                    }
                    className="neu-btn p-1.5 text-[var(--accent-danger)]"
                    title="Revoke ticket"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <code className="text-lg font-bold text-[var(--text-primary)] tracking-wider">
              {ticket.ticketCode}
            </code>
            <div className="flex items-center justify-between mt-3 text-sm text-[var(--text-secondary)]">
              <span>{ticket.durationMinutes} min</span>
              <span>{formatCurrency(ticket.price)}</span>
              <span>{formatRelativeTime(ticket.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getApprovalCustomer(scannerValue: unknown, code: string) {
  const metadata = metadataRecord(scannerValue);
  const scanner = metadataRecord(metadata.scanner);
  const name = metadataString(scanner.customerName);
  const phone = metadataString(scanner.customerPhone);
  const email = metadataString(scanner.customerEmail);
  const fingerprint = metadataString(scanner.deviceFingerprint);
  const ipAddress = metadataString(scanner.ipAddress);

  if (name) return name;
  if (phone) return phone;
  if (email) return email;
  if (fingerprint) return `Device ${fingerprint.slice(-6).toUpperCase()}`;
  if (ipAddress) return `IP ${ipAddress}`;
  return `Ticket ${code}`;
}

function MerchantAccessAlerts({ merchantId }: { merchantId?: number }) {
  const utils = trpc.useUtils();
  const { data: approvals, isLoading } =
    trpc.ticket.pendingAccessApprovals.useQuery(
      { merchantId: merchantId ?? 0, limit: 10 },
      { enabled: !!merchantId, refetchInterval: 3000 }
    );
  const decideAccess = trpc.ticket.decideAccess.useMutation({
    onSuccess: () => {
      void utils.ticket.pendingAccessApprovals.invalidate();
      void utils.ticket.list.invalidate();
      void utils.ticket.stats.invalidate();
      void utils.ticket.sessions.invalidate();
      void utils.payment.list.invalidate();
      void utils.payment.stats.invalidate();
      void utils.analytics.kpis.invalidate();
      void utils.blockchain.list.invalidate();
    },
  });

  if (!merchantId || isLoading || !approvals?.length) return null;

  return (
    <section className="neu-flat p-5 mb-8 border border-[var(--accent-warning)]/30">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="neu-sm p-2">
            <Bell className="w-5 h-5 text-[var(--accent-warning)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Payment received. Approve network sharing.
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Decide whether this paid customer should continue using your
              hotspot.
            </p>
          </div>
        </div>
        <span className="self-start lg:self-auto px-3 py-1 rounded-full text-xs font-semibold bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]">
          {approvals.length} waiting
        </span>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        {approvals.map(approval => {
          const isBusy =
            decideAccess.isPending &&
            decideAccess.variables?.ticketId === approval.ticketId;
          const errorMessage =
            !decideAccess.isPending &&
            decideAccess.variables?.ticketId === approval.ticketId
              ? decideAccess.error?.message
              : undefined;
          const customer = getApprovalCustomer(approval.scanner, approval.code);

          return (
            <div key={approval.ticketId} className="neu-sm p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Ticket className="w-4 h-4 text-[var(--accent-primary)]" />
                    <code className="text-sm font-bold tracking-wider text-[var(--text-primary)]">
                      {approval.code}
                    </code>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {customer}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Paid {formatRelativeTime(approval.paidAt)} via{" "}
                    {approval.gatewayProvider ?? "UPI gateway"}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-lg font-bold text-[var(--accent-success)]">
                    {formatCurrency(approval.price)}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {approval.durationMinutes} min access
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 my-4 text-sm">
                <div className="neu-inset px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <Wifi className="w-4 h-4" />
                    <span>Network</span>
                  </div>
                  <div className="font-semibold text-[var(--text-primary)] mt-1 truncate">
                    {approval.hotspot.ssid}
                  </div>
                </div>
                <div className="neu-inset px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <Router className="w-4 h-4" />
                    <span>Gateway</span>
                  </div>
                  <div className="font-semibold text-[var(--text-primary)] mt-1 truncate">
                    {approval.hotspot.routerIp ?? approval.hotspot.gatewayMode}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() =>
                    decideAccess.mutate({
                      ticketId: approval.ticketId,
                      decision: "approved",
                    })
                  }
                  disabled={isBusy}
                  className="neu-btn-primary flex-1 py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Continue sharing
                </button>
                <button
                  onClick={() =>
                    decideAccess.mutate({
                      ticketId: approval.ticketId,
                      decision: "rejected",
                      reason: "Merchant stopped sharing network access.",
                    })
                  }
                  disabled={isBusy}
                  className="neu-btn flex-1 py-3 font-semibold text-[var(--accent-danger)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Stop sharing
                </button>
              </div>

              {errorMessage && (
                <p className="text-sm text-[var(--accent-danger)] mt-3">
                  {errorMessage}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getSessionTiming(
  session: {
    startedAt: Date | string;
    durationMinutes: number | null;
    status: string;
  },
  now: number
) {
  if (session.status !== "active") {
    return {
      label: session.status,
      percent: 0,
      showBar: false,
      isExpired: false,
    };
  }
  if (!session.durationMinutes) {
    return {
      label: "Unlimited",
      percent: 100,
      showBar: false,
      isExpired: false,
    };
  }

  const startedAt = new Date(session.startedAt).getTime();
  if (!Number.isFinite(startedAt)) {
    return { label: "-", percent: 0, showBar: false, isExpired: false };
  }

  const totalMs = session.durationMinutes * 60_000;
  const endsAt = startedAt + totalMs;
  const remainingMs = Math.max(0, endsAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  const label =
    remainingSeconds > 0
      ? hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${minutes}m ${seconds}s`
      : "Expired";

  return {
    label,
    percent: Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)),
    showBar: true,
    isExpired: remainingSeconds <= 0,
  };
}

function SessionTimerCell({
  session,
  now,
}: {
  session: {
    startedAt: Date | string;
    durationMinutes: number | null;
    status: string;
  };
  now: number;
}) {
  const timing = getSessionTiming(session, now);

  return (
    <div className="min-w-[150px]">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-sm font-semibold ${
            timing.isExpired
              ? "text-[var(--accent-danger)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {timing.label}
        </span>
        {timing.showBar && (
          <span className="text-xs text-[var(--text-secondary)]">
            {Math.round(timing.percent)}%
          </span>
        )}
      </div>
      {timing.showBar && (
        <div className="neu-inset h-2 rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              timing.isExpired ? "bg-[var(--accent-danger)]" : "gradient-accent"
            }`}
            style={{ width: `${timing.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Sessions Tab
function SessionsTab({ merchantId }: { merchantId?: number }) {
  const [now, setNow] = useState(() => Date.now());
  const { data: sessions, isLoading } = trpc.ticket.sessions.useQuery(
    { merchantId: merchantId ?? 0, status: "active", limit: 300 },
    { enabled: !!merchantId, refetchInterval: 5000 }
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">
        Active Sessions
      </h2>
      <div className="neu-flat overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--shadow-dark)]">
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Device
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  IP Address
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  MAC Address
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Status
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Data Used
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Time Left
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    className="px-6 py-4 text-sm text-[var(--text-secondary)]"
                    colSpan={6}
                  >
                    Loading sessions...
                  </td>
                </tr>
              )}
              {!isLoading && (sessions ?? []).length === 0 && (
                <tr>
                  <td
                    className="px-6 py-4 text-sm text-[var(--text-secondary)]"
                    colSpan={6}
                  >
                    No live sessions yet. Validate a QR/OTP from the connect
                    page to create one.
                  </td>
                </tr>
              )}
              {(sessions ?? []).map(s => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--shadow-dark)]/50 hover:bg-[var(--shadow-dark)]/5"
                >
                  <td className="px-6 py-4 text-sm font-medium text-[var(--text-primary)]">
                    {s.ticketCode ?? `Session #${s.id}`}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    {s.ipAddress ?? "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-mono">
                    {s.macAddress ?? "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                        s.status === "active"
                          ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10"
                          : s.status === "paused"
                            ? "text-[var(--accent-warning)] bg-[var(--accent-warning)]/10"
                            : "text-[var(--text-secondary)] bg-gray-200/50"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    {Number(s.dataUsedMb ?? 0).toFixed(2)} MB
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    <SessionTimerCell session={s} now={now} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Payments Tab
function PaymentsTab({ merchantId }: { merchantId?: number }) {
  const utils = trpc.useUtils();
  const [manualTicketCode, setManualTicketCode] = useState("");
  const [manualUpiReference, setManualUpiReference] = useState("");
  const [manualPayerName, setManualPayerName] = useState("");
  const { data: payments, isLoading } = trpc.payment.list.useQuery(
    { merchantId: merchantId ?? 0, limit: 300 },
    { enabled: !!merchantId }
  );
  const { data: stats } = trpc.payment.stats.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );
  const confirmManualUpi = trpc.payment.confirmManualUpi.useMutation({
    onSuccess: async () => {
      if (!merchantId) return;
      setManualTicketCode("");
      setManualUpiReference("");
      setManualPayerName("");
      await utils.payment.list.invalidate({ merchantId });
      await utils.payment.stats.invalidate({ merchantId });
      await utils.ticket.list.invalidate({ merchantId });
      await utils.ticket.pendingAccessApprovals.invalidate({ merchantId });
      await utils.ticket.sessions.invalidate({ merchantId });
      await utils.analytics.kpis.invalidate({ merchantId });
      await utils.blockchain.list.invalidate();
      await utils.blockchain.stats.invalidate();
    },
  });

  const submitManualUpi = (event: React.FormEvent) => {
    event.preventDefault();
    if (!merchantId || !manualTicketCode.trim() || !manualUpiReference.trim())
      return;

    confirmManualUpi.mutate({
      merchantId,
      ticketCode: manualTicketCode.trim().toUpperCase(),
      upiReference: manualUpiReference.trim(),
      payerName: manualPayerName.trim() || undefined,
      approveAccess: true,
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">
        Payments
      </h2>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="neu-flat p-5 text-center">
          <div className="text-3xl font-bold text-gradient">
            {formatCurrency(stats?.totalRevenue)}
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            Total Revenue
          </div>
        </div>
        <div className="neu-flat p-5 text-center">
          <div className="text-3xl font-bold text-[var(--accent-success)]">
            {stats?.success ?? 0}
          </div>
          <div className="text-sm text-[var(--text-secondary)]">Successful</div>
        </div>
        <div className="neu-flat p-5 text-center">
          <div className="text-3xl font-bold text-[var(--accent-warning)]">
            {stats?.pending ?? 0}
          </div>
          <div className="text-sm text-[var(--text-secondary)]">Pending</div>
        </div>
      </div>

      <form
        onSubmit={submitManualUpi}
        className="neu-flat p-5 border-l-4 border-[var(--accent-primary)]"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              Confirm Direct UPI Payment
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Use this when a customer paid by scanning the UPI QR directly
              from PhonePe, Google Pay, Paytm, BHIM, or another UPI app.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] self-start">
            Manual fallback
          </span>
        </div>
        <div className="grid md:grid-cols-[1fr_1fr_1fr_auto] gap-3">
          <input
            value={manualTicketCode}
            onChange={event =>
              setManualTicketCode(event.target.value.toUpperCase())
            }
            className="neu-input"
            placeholder="Ticket token"
          />
          <input
            value={manualUpiReference}
            onChange={event => setManualUpiReference(event.target.value)}
            className="neu-input"
            placeholder="UPI reference / UTR"
          />
          <input
            value={manualPayerName}
            onChange={event => setManualPayerName(event.target.value)}
            className="neu-input"
            placeholder="Payer name optional"
          />
          <button
            type="submit"
            disabled={
              !merchantId ||
              !manualTicketCode.trim() ||
              !manualUpiReference.trim() ||
              confirmManualUpi.isPending
            }
            className="neu-btn-primary px-5 py-3 font-semibold disabled:opacity-50"
          >
            {confirmManualUpi.isPending ? "Confirming..." : "Confirm"}
          </button>
        </div>
        {confirmManualUpi.error && (
          <p className="text-sm text-[var(--accent-danger)] mt-3">
            {confirmManualUpi.error.message}
          </p>
        )}
      </form>

      <div className="neu-flat overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--shadow-dark)]">
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Customer
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Amount
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Method
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Provider
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Status
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    className="px-6 py-4 text-sm text-[var(--text-secondary)]"
                    colSpan={6}
                  >
                    Loading payments...
                  </td>
                </tr>
              )}
              {!isLoading && (payments ?? []).length === 0 && (
                <tr>
                  <td
                    className="px-6 py-4 text-sm text-[var(--text-secondary)]"
                    colSpan={6}
                  >
                    No payments yet. Scan a ticket QR or start a gateway payment
                    to see it here.
                  </td>
                </tr>
              )}
              {(payments ?? []).map(p => {
                const customer = getPaymentCustomer(p);
                const subtext = getPaymentSubtext(p);
                const provider = p.gatewayProvider ?? p.upiProvider ?? "-";

                return (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--shadow-dark)]/50 hover:bg-[var(--shadow-dark)]/5"
                  >
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-[var(--text-primary)]">
                        {customer}
                      </div>
                      {subtext && (
                        <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                          {subtext}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-[var(--text-primary)]">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {p.paymentMethod.toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)] capitalize">
                      {provider}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.status === "success"
                            ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10"
                            : "text-[var(--accent-warning)] bg-[var(--accent-warning)]/10"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {formatRelativeTime(p.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Analytics Tab
function AnalyticsTab({ merchantId }: { merchantId?: number }) {
  const { data: ticketStats } = trpc.ticket.stats.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );
  const { data: peakHours } = trpc.analytics.peakHours.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );

  const statusData = [
    { name: "Active", value: ticketStats?.active ?? 0, color: "#10b981" },
    { name: "Used", value: ticketStats?.used ?? 0, color: "#6366f1" },
    { name: "Expired", value: ticketStats?.expired ?? 0, color: "#94a3b8" },
    { name: "Revoked", value: ticketStats?.revoked ?? 0, color: "#ef4444" },
  ];

  const peakData = (peakHours ?? [])
    .filter((_, index) => index % 2 === 0)
    .map(row => ({ time: row.label, sessions: row.count }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">
        Analytics
      </h2>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="neu-flat p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">
            Ticket Status
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--bg-primary)",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "var(--neu-shadow-sm)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {statusData.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="text-[var(--text-secondary)]">
                  {d.name} ({d.value})
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="neu-flat p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">
            Peak Hours
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={peakData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--shadow-dark)"
              />
              <XAxis
                dataKey="time"
                stroke="var(--text-secondary)"
                fontSize={11}
              />
              <YAxis stroke="var(--text-secondary)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-primary)",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "var(--neu-shadow-sm)",
                }}
              />
              <Bar dataKey="sessions" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="neu-flat p-6">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">
          Session Activity
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={peakData}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--shadow-dark)" />
            <XAxis dataKey="day" stroke="var(--text-secondary)" fontSize={12} />
            <YAxis stroke="var(--text-secondary)" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-primary)",
                border: "none",
                borderRadius: "12px",
                boxShadow: "var(--neu-shadow-sm)",
              }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GatewayTab({
  dashboard,
  onGenerate,
}: {
  dashboard: DashboardData;
  onGenerate: () => void;
}) {
  const utils = trpc.useUtils();
  const merchant = dashboard?.merchant;
  const branch = dashboard?.branches[0];
  const [upiId, setUpiId] = useState("");
  const [settlementAccountName, setSettlementAccountName] = useState("");
  const [settlementPhone, setSettlementPhone] = useState("");
  const [internetSource, setInternetSource] =
    useState<NetworkSource>("router_wifi");
  const [ssid, setSsid] = useState("");
  const [routerBrand, setRouterBrand] = useState("");
  const [routerModel, setRouterModel] = useState("");
  const [routerIp, setRouterIp] = useState("");
  const [controllerType, setControllerType] =
    useState<ControllerType>("mikrotik");
  const [controllerEndpoint, setControllerEndpoint] = useState("");
  const [hotspotSsid, setHotspotSsid] = useState("");
  const [hotspotDeviceName, setHotspotDeviceName] = useState("");
  const [hotspotOwnerPhone, setHotspotOwnerPhone] = useState("");
  const [bandwidthMbps, setBandwidthMbps] = useState(100);
  const [copiedKey, setCopiedKey] = useState("");
  const { data: gatewayStatus } = trpc.payment.gatewayStatus.useQuery();

  useEffect(() => {
    if (!merchant) return;
    setUpiId(merchant.upiId ?? savedUpiId());
    setSettlementAccountName(
      merchant.settlementAccountName ?? merchant.businessName
    );
    setSettlementPhone(merchant.settlementPhone ?? "");
    setInternetSource(branch?.internetSource ?? "router_wifi");
    setSsid(branch?.ssid ?? "Sriyan_Guest");
    setRouterBrand(branch?.routerBrand ?? "");
    setRouterModel(branch?.routerModel ?? "");
    setRouterIp(branch?.routerIp ?? "192.168.1.1");
    setControllerType(branch?.controllerType ?? "mikrotik");
    setControllerEndpoint(branch?.controllerEndpoint ?? "");
    setHotspotSsid(branch?.hotspotSsid ?? "Sriyan_Phone_Hotspot");
    setHotspotDeviceName(branch?.hotspotDeviceName ?? "Merchant phone");
    setHotspotOwnerPhone(
      branch?.hotspotOwnerPhone ?? merchant.settlementPhone ?? ""
    );
    setBandwidthMbps(branch?.bandwidthMbps ?? 100);
  }, [
    branch?.bandwidthMbps,
    branch?.controllerEndpoint,
    branch?.controllerType,
    branch?.hotspotDeviceName,
    branch?.hotspotOwnerPhone,
    branch?.hotspotSsid,
    branch?.internetSource,
    branch?.routerBrand,
    branch?.routerIp,
    branch?.routerModel,
    branch?.ssid,
    merchant,
  ]);

  const invalidateDashboard = () => {
    void utils.merchant.dashboard.invalidate();
    void utils.merchant.publicDefault.invalidate();
  };

  const updateMerchant = trpc.merchant.update.useMutation({
    onSuccess: invalidateDashboard,
  });
  const updateBranch = trpc.merchant.updateBranch.useMutation({
    onSuccess: invalidateDashboard,
  });
  const createBranch = trpc.merchant.createBranch.useMutation({
    onSuccess: invalidateDashboard,
  });

  const gatewayMode: GatewayMode =
    internetSource === "phone_hotspot"
      ? "phone_token_bridge"
      : "captive_portal";
  const upiReady = isValidUpiId(upiId);
  const activeGateway = gatewayStatus?.activeProvider ?? null;
  const gatewayReady = activeGateway
    ? gatewayStatus?.configured[activeGateway]
    : false;
  const gatewayMissing = activeGateway
    ? gatewayStatus?.missing[activeGateway] ?? []
    : ["PAYMENT_GATEWAY_PROVIDER"];
  const activeSsid = internetSource === "phone_hotspot" ? hotspotSsid : ssid;
  const hotspotGatewayUrl =
    typeof window === "undefined"
      ? "/hotspot"
      : `${window.location.origin}/hotspot`;
  const connectUrl =
    typeof window === "undefined"
      ? "/connect"
      : `${window.location.origin}/connect`;

  const copyValue = (key: string, value: string) => {
    void navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 1600);
  };

  const branchPayload = {
    ssid,
    routerBrand: routerBrand || undefined,
    routerModel: routerModel || undefined,
    routerIp: routerIp || undefined,
    controllerType,
    controllerEndpoint: controllerEndpoint || undefined,
    internetSource,
    gatewayMode,
    hotspotSsid: hotspotSsid || undefined,
    hotspotDeviceName: hotspotDeviceName || undefined,
    hotspotOwnerPhone: hotspotOwnerPhone || undefined,
    bandwidthMbps,
  };

  const handleSave = () => {
    if (!merchant || !upiReady) return;
    const normalizedUpiId = normalizeUpiId(upiId);

    updateMerchant.mutate({
      id: merchant.id,
      upiId: normalizedUpiId,
      settlementAccountName: settlementAccountName || merchant.businessName,
      settlementPhone: settlementPhone || undefined,
      settlementVerified: true,
    });

    if (branch) {
      updateBranch.mutate({
        id: branch.id,
        ...branchPayload,
      });
    } else {
      createBranch.mutate({
        merchantId: merchant.id,
        name: "Main Branch",
        ...branchPayload,
      });
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "sriyan-merchant-upi-id",
        normalizedUpiId
      );
    }
  };

  const isSaving =
    updateMerchant.isPending ||
    updateBranch.isPending ||
    createBranch.isPending;
  const saveError =
    updateMerchant.error || updateBranch.error || createBranch.error;

  if (!merchant) {
    return (
      <div className="neu-flat p-6 text-[var(--text-secondary)]">
        Create or sign in to a merchant account before configuring the gateway.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Merchant Gateway
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {merchant.businessName} receives UPI payments and unlocks{" "}
            {activeSsid || "the configured network"}.
          </p>
        </div>
        <button
          onClick={onGenerate}
          className="neu-btn-primary px-6 py-2.5 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Generate Token
        </button>
      </div>

      <div className="neu-flat p-5 border-l-4 border-[var(--accent-primary)]">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <Router className="w-5 h-5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                Router WiFi mode
              </div>
              <p className="text-[var(--text-secondary)] mt-1">
                Connect MikroTik/OpenWrt/FreeRADIUS to Sriyan. Customers join
                the router SSID, pay the locked token, and the router gets an
                allow/deny decision from the API.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-[var(--accent-warning)] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                Phone hotspot mode
              </div>
              <p className="text-[var(--text-secondary)] mt-1">
                Use the merchant phone hotspot as the internet source. Sriyan
                binds each customer device to the paid token and keeps the
                hotspot sharing decision visible to the merchant.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="neu-flat p-5">
          <div className="flex items-center justify-between mb-4">
            <IndianRupee className="w-5 h-5 text-[var(--accent-success)]" />
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${upiReady ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10" : "text-[var(--accent-danger)] bg-[var(--accent-danger)]/10"}`}
            >
              {upiReady ? "Ready" : "UPI needed"}
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            Merchant UPI Account
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)] break-all">
            {normalizeUpiId(upiId)}
          </div>
        </div>
        <div className="neu-flat p-5">
          <div className="flex items-center justify-between mb-4">
            <Router className="w-5 h-5 text-[var(--accent-primary)]" />
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${internetSource === "router_wifi" ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10" : "text-[var(--text-secondary)] bg-gray-200/50"}`}
            >
              Router
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            Router WiFi
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {ssid || "Not set"}
          </div>
        </div>
        <div className="neu-flat p-5">
          <div className="flex items-center justify-between mb-4">
            <Smartphone className="w-5 h-5 text-[var(--accent-warning)]" />
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${internetSource === "phone_hotspot" ? "text-[var(--accent-warning)] bg-[var(--accent-warning)]/10" : "text-[var(--text-secondary)] bg-gray-200/50"}`}
            >
              Phone
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            Phone Hotspot
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {hotspotSsid || "Not set"}
          </div>
        </div>
      </div>

      <div
        className={`neu-flat p-5 border-l-4 ${
          gatewayReady
            ? "border-[var(--accent-success)]"
            : "border-[var(--accent-danger)]"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <CreditCard
              className={`w-5 h-5 mt-0.5 shrink-0 ${
                gatewayReady
                  ? "text-[var(--accent-success)]"
                  : "text-[var(--accent-danger)]"
              }`}
            />
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">
                Live Payment Gateway
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Paid Sriyan tokens need a signed payment provider callback
                before internet unlocks automatically.
              </p>
            </div>
          </div>
          <span
            className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${
              gatewayReady
                ? "bg-[var(--accent-success)]/10 text-[var(--accent-success)]"
                : "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]"
            }`}
          >
            {gatewayReady ? "Ready" : "Setup needed"}
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-4 text-sm">
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">
              Active provider
            </div>
            <div className="font-semibold text-[var(--text-primary)] capitalize">
              {activeGateway ?? "Not selected"}
            </div>
          </div>
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">
              Missing config
            </div>
            <div className="font-semibold text-[var(--text-primary)] break-all">
              {gatewayReady ? "None" : gatewayMissing.join(", ")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="neu-flat p-6 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[var(--accent-success)]" />
              <h3 className="font-semibold text-[var(--text-primary)]">
                Merchant Account
              </h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  UPI ID
                </label>
                <input
                  value={upiId}
                  onChange={event => setUpiId(event.target.value)}
                  className="neu-input"
                  placeholder="merchant@bank"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Settlement Name
                </label>
                <input
                  value={settlementAccountName}
                  onChange={event =>
                    setSettlementAccountName(event.target.value)
                  }
                  className="neu-input"
                  placeholder="Business account name"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Merchant Mobile
                </label>
                <input
                  value={settlementPhone}
                  onChange={event => setSettlementPhone(event.target.value)}
                  className="neu-input"
                  placeholder="UPI registered mobile"
                />
              </div>
            </div>
            {!upiReady && (
              <p className="text-sm text-[var(--accent-danger)]">
                Use a valid UPI ID format such as shopname@upi or mobile@bank.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Internet Source
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInternetSource("router_wifi")}
                className={`neu-btn p-4 text-left ${internetSource === "router_wifi" ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
              >
                <Router className="w-5 h-5 text-[var(--accent-primary)] mb-3" />
                <div className="font-semibold text-[var(--text-primary)]">
                  Router WiFi
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Captive portal gateway
                </div>
              </button>
              <button
                type="button"
                onClick={() => setInternetSource("phone_hotspot")}
                className={`neu-btn p-4 text-left ${internetSource === "phone_hotspot" ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
              >
                <Smartphone className="w-5 h-5 text-[var(--accent-warning)] mb-3" />
                <div className="font-semibold text-[var(--text-primary)]">
                  Phone Hotspot
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Mobile hotspot token bridge
                </div>
              </button>
            </div>

            {internetSource === "router_wifi" ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Router SSID
                  </label>
                  <input
                    value={ssid}
                    onChange={event => setSsid(event.target.value)}
                    className="neu-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Gateway IP
                  </label>
                  <input
                    value={routerIp}
                    onChange={event => setRouterIp(event.target.value)}
                    className="neu-input"
                    placeholder="192.168.1.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Router Brand
                  </label>
                  <input
                    value={routerBrand}
                    onChange={event => setRouterBrand(event.target.value)}
                    className="neu-input"
                    placeholder="MikroTik, OpenWrt, TP-Link"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Router Model
                  </label>
                  <input
                    value={routerModel}
                    onChange={event => setRouterModel(event.target.value)}
                    className="neu-input"
                    placeholder="hAP, Archer, Custom"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Controller Type
                  </label>
                  <select
                    value={controllerType}
                    onChange={event =>
                      setControllerType(event.target.value as ControllerType)
                    }
                    className="neu-input"
                  >
                    <option value="mikrotik">MikroTik Hotspot</option>
                    <option value="openwrt">OpenWrt Captive Portal</option>
                    <option value="freeradius">FreeRADIUS</option>
                    <option value="cloud_agent">Cloud Agent</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Controller Endpoint
                  </label>
                  <input
                    value={controllerEndpoint}
                    onChange={event =>
                      setControllerEndpoint(event.target.value)
                    }
                    className="neu-input"
                    placeholder="https://router-agent.example.com"
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Hotspot SSID
                  </label>
                  <input
                    value={hotspotSsid}
                    onChange={event => setHotspotSsid(event.target.value)}
                    className="neu-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Phone Name
                  </label>
                  <input
                    value={hotspotDeviceName}
                    onChange={event => setHotspotDeviceName(event.target.value)}
                    className="neu-input"
                    placeholder="Merchant phone"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Hotspot Mobile
                  </label>
                  <input
                    value={hotspotOwnerPhone}
                    onChange={event => setHotspotOwnerPhone(event.target.value)}
                    className="neu-input"
                    placeholder="Mobile number"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Speed Limit (Mbps)
              </label>
              <input
                type="number"
                min="1"
                value={bandwidthMbps}
                onChange={event => setBandwidthMbps(Number(event.target.value))}
                className="neu-input"
              />
            </div>
          </section>

          <button
            onClick={handleSave}
            disabled={isSaving || !upiReady}
            className="neu-btn-primary px-6 py-3 font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSaving ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? "Saving..." : "Save Gateway"}
          </button>
          {saveError && (
            <p className="text-sm text-[var(--accent-danger)]">
              {saveError.message}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="neu-flat p-6">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">
              Customer Access Links
            </h3>
            <div className="space-y-3">
              {[
                {
                  key: "hotspot",
                  label: "Hotspot Gateway",
                  value: hotspotGatewayUrl,
                },
                { key: "connect", label: "Connect Portal", value: connectUrl },
              ].map(item => (
                <div key={item.key} className="neu-sm p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--text-secondary)]">
                        {item.label}
                      </div>
                      <code className="text-sm text-[var(--text-primary)] break-all">
                        {item.value}
                      </code>
                    </div>
                    <button
                      onClick={() => copyValue(item.key, item.value)}
                      className="neu-btn p-2 shrink-0"
                      title={`Copy ${item.label}`}
                    >
                      {copiedKey === item.key ? (
                        <Check className="w-4 h-4 text-[var(--accent-success)]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="neu-flat p-6">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">
              Realtime Working Process
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <IndianRupee className="w-4 h-4 text-[var(--accent-success)] mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  Paid QR carries {normalizeUpiId(upiId)} with locked amount
                  and Sriyan token reference for any UPI app.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound className="w-4 h-4 text-[var(--accent-warning)] mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  Automatic unlock waits for a signed gateway/webhook success
                  record, so the app never trusts an unverified payment claim.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Wifi className="w-4 h-4 text-[var(--accent-primary)] mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  After validation, customer uses{" "}
                  {activeSsid || "the configured SSID"} with{" "}
                  {bandwidthMbps || 0} Mbps policy.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Link2 className="w-4 h-4 text-[var(--text-primary)] mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  Router/RADIUS calls `/api/router/authorize` and
                  `/api/router/accounting` with the integration secret.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <ServerCog className="w-4 h-4 text-[var(--accent-success)] mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  Active controller: {controllerType.replace("_", " ")}.
                </span>
              </div>
            </div>
          </div>

          <div className="neu-flat p-6">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">
              Current Mode
            </h3>
            <div className="neu-pressed p-4 rounded-xl">
              <div className="text-xs text-[var(--text-secondary)]">Source</div>
              <div className="text-xl font-bold text-gradient">
                {internetSource === "router_wifi"
                  ? "Router WiFi"
                  : "Phone Hotspot"}
              </div>
              <div className="text-sm text-[var(--text-secondary)] mt-2">
                {gatewayMode === "captive_portal"
                  ? "Captive portal enforcement"
                  : "Mobile hotspot token bridge"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplianceTab({ dashboard }: { dashboard: DashboardData }) {
  const merchant = dashboard?.merchant;
  const branch = dashboard?.branches[0];
  const [role, setRole] = useState<
    "pdo" | "pdoa" | "app_provider" | "not_applicable"
  >("not_applicable");
  const [status, setStatus] = useState<
    "not_applicable" | "pending" | "ready" | "approved" | "expired" | "blocked"
  >("not_applicable");
  const [cdoRegistrationNumber, setCdoRegistrationNumber] = useState("");
  const [pdoaRegistrationNumber, setPdoaRegistrationNumber] = useState("");
  const [kycReference, setKycReference] = useState("");
  const [publicDataOfficeName, setPublicDataOfficeName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [userKycRequired, setUserKycRequired] = useState(true);
  const [retentionDays, setRetentionDays] = useState(365);
  const [nextAuditAt, setNextAuditAt] = useState("");

  const complianceQuery = trpc.compliance.getPmWani.useQuery(
    { merchantId: merchant?.id ?? 0, branchId: branch?.id },
    { enabled: Boolean(merchant?.id) }
  );
  const saveCompliance = trpc.compliance.savePmWani.useMutation({
    onSuccess: () => {
      void complianceQuery.refetch();
    },
  });
  const compliance = complianceQuery.data?.compliance;

  useEffect(() => {
    if (!compliance) return;
    setRole(compliance.role);
    setStatus(compliance.status);
    setCdoRegistrationNumber(compliance.cdoRegistrationNumber ?? "");
    setPdoaRegistrationNumber(compliance.pdoaRegistrationNumber ?? "");
    setKycReference(compliance.kycReference ?? "");
    setPublicDataOfficeName(compliance.publicDataOfficeName ?? "");
    setTermsAccepted(compliance.termsAccepted);
    setUserKycRequired(compliance.userKycRequired);
    setRetentionDays(compliance.retentionDays);
    setNextAuditAt(
      compliance.nextAuditAt
        ? new Date(compliance.nextAuditAt).toISOString().slice(0, 10)
        : ""
    );
  }, [compliance]);

  if (!merchant) {
    return (
      <div className="neu-flat p-6 text-[var(--text-secondary)]">
        Create or sign in to a merchant account before saving PM-WANI
        compliance.
      </div>
    );
  }

  const save = () => {
    saveCompliance.mutate({
      id: compliance?.id,
      merchantId: merchant.id,
      branchId: branch?.id,
      role,
      status,
      cdoRegistrationNumber: cdoRegistrationNumber || undefined,
      pdoaRegistrationNumber: pdoaRegistrationNumber || undefined,
      kycReference: kycReference || undefined,
      publicDataOfficeName: publicDataOfficeName || merchant.businessName,
      termsAccepted,
      userKycRequired,
      retentionDays,
      nextAuditAt: nextAuditAt
        ? new Date(`${nextAuditAt}T00:00:00`)
        : undefined,
    });
  };

  const checklist = complianceQuery.data?.checklist ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            PM-WANI Compliance
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Track public WiFi compliance status for {merchant.businessName}.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saveCompliance.isPending}
          className="neu-btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50"
        >
          {saveCompliance.isPending ? (
            <Clock className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveCompliance.isPending ? "Saving..." : "Save Compliance"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="neu-flat p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Deployment Role
              </label>
              <select
                value={role}
                onChange={event => setRole(event.target.value as typeof role)}
                className="neu-input"
              >
                <option value="not_applicable">Not applicable</option>
                <option value="pdo">PDO</option>
                <option value="pdoa">PDOA</option>
                <option value="app_provider">App provider</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Compliance Status
              </label>
              <select
                value={status}
                onChange={event =>
                  setStatus(event.target.value as typeof status)
                }
                className="neu-input"
              >
                <option value="not_applicable">Not applicable</option>
                <option value="pending">Pending</option>
                <option value="ready">Ready</option>
                <option value="approved">Approved</option>
                <option value="expired">Expired</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                CDO Registration Number
              </label>
              <input
                value={cdoRegistrationNumber}
                onChange={event => setCdoRegistrationNumber(event.target.value)}
                className="neu-input"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                PDOA Registration Number
              </label>
              <input
                value={pdoaRegistrationNumber}
                onChange={event =>
                  setPdoaRegistrationNumber(event.target.value)
                }
                className="neu-input"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                KYC Reference
              </label>
              <input
                value={kycReference}
                onChange={event => setKycReference(event.target.value)}
                className="neu-input"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Public Data Office Name
              </label>
              <input
                value={publicDataOfficeName}
                onChange={event => setPublicDataOfficeName(event.target.value)}
                className="neu-input"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Retention Days
              </label>
              <input
                type="number"
                min="0"
                value={retentionDays}
                onChange={event => setRetentionDays(Number(event.target.value))}
                className="neu-input"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Next Audit Date
              </label>
              <input
                type="date"
                value={nextAuditAt}
                onChange={event => setNextAuditAt(event.target.value)}
                className="neu-input"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="neu-sm p-4 flex items-center gap-3 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={event => setTermsAccepted(event.target.checked)}
              />
              Subscriber terms accepted
            </label>
            <label className="neu-sm p-4 flex items-center gap-3 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={userKycRequired}
                onChange={event => setUserKycRequired(event.target.checked)}
              />
              User KYC required
            </label>
          </div>

          {saveCompliance.error && (
            <p className="text-sm text-[var(--accent-danger)]">
              {saveCompliance.error.message}
            </p>
          )}
        </div>

        <div className="neu-flat p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">
            Checklist
          </h3>
          <div className="space-y-3">
            {checklist.map(item => (
              <div
                key={item.key}
                className="neu-sm p-3 flex items-center gap-3"
              >
                <Check
                  className={`w-4 h-4 ${item.done ? "text-[var(--accent-success)]" : "text-[var(--accent-warning)]"}`}
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {item.label}
                </span>
              </div>
            ))}
            {checklist.length === 0 && (
              <div className="text-sm text-[var(--text-secondary)]">
                Loading compliance checklist...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings Tab
function SettingsTab({ dashboard }: { dashboard: DashboardData }) {
  const utils = trpc.useUtils();
  const merchant = dashboard?.merchant;
  const branch = dashboard?.branches[0];
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("public_wifi");
  const [gstNumber, setGstNumber] = useState("");
  const [ssid, setSsid] = useState("");
  const [bandwidthMbps, setBandwidthMbps] = useState(100);
  const [routerBrand, setRouterBrand] = useState("");
  const [routerModel, setRouterModel] = useState("");
  const [routerIp, setRouterIp] = useState("");

  useEffect(() => {
    if (!merchant) return;
    setBusinessName(merchant.businessName);
    setBusinessType(merchant.businessType);
    setGstNumber(merchant.gstNumber ?? "");
    setSsid(branch?.ssid ?? "Sriyan_Guest");
    setBandwidthMbps(branch?.bandwidthMbps ?? 100);
    setRouterBrand(branch?.routerBrand ?? "");
    setRouterModel(branch?.routerModel ?? "");
    setRouterIp(branch?.routerIp ?? "192.168.1.1");
  }, [
    branch?.bandwidthMbps,
    branch?.routerBrand,
    branch?.routerIp,
    branch?.routerModel,
    branch?.ssid,
    merchant,
  ]);

  const updateMerchant = trpc.merchant.update.useMutation({
    onSuccess: () => {
      void utils.merchant.dashboard.invalidate();
    },
  });
  const updateBranch = trpc.merchant.updateBranch.useMutation({
    onSuccess: () => {
      void utils.merchant.dashboard.invalidate();
    },
  });

  const handleSave = () => {
    if (merchant) {
      updateMerchant.mutate({
        id: merchant.id,
        businessName,
        businessType,
        gstNumber: gstNumber || undefined,
      });
    }

    if (branch) {
      updateBranch.mutate({
        id: branch.id,
        ssid,
        bandwidthMbps,
        routerBrand: routerBrand || undefined,
        routerModel: routerModel || undefined,
        routerIp: routerIp || undefined,
      });
    }
  };

  const isSaving = updateMerchant.isPending || updateBranch.isPending;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">
        Settings
      </h2>

      <div className="neu-flat p-6 space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">
          Business Profile
        </h3>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Business Name
          </label>
          <input
            type="text"
            value={businessName}
            onChange={event => setBusinessName(event.target.value)}
            className="neu-input"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Business Type
          </label>
          <select
            value={businessType}
            onChange={event =>
              setBusinessType(event.target.value as BusinessType)
            }
            className="neu-input"
          >
            {BUSINESS_TYPES.map(type => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            GST Number
          </label>
          <input
            type="text"
            value={gstNumber}
            onChange={event => setGstNumber(event.target.value)}
            className="neu-input"
          />
        </div>
      </div>

      <div className="neu-flat p-6 space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">
          WiFi Configuration
        </h3>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Network SSID
          </label>
          <input
            type="text"
            value={ssid}
            onChange={event => setSsid(event.target.value)}
            className="neu-input"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Bandwidth Limit (Mbps)
          </label>
          <input
            type="number"
            value={bandwidthMbps}
            onChange={event => setBandwidthMbps(Number(event.target.value))}
            className="neu-input"
          />
        </div>
      </div>

      <div className="neu-flat p-6 space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">
          Hotspot Controller
        </h3>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Router Brand
          </label>
          <input
            type="text"
            value={routerBrand}
            onChange={event => setRouterBrand(event.target.value)}
            className="neu-input"
            placeholder="MikroTik, OpenWrt, TP-Link"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Router Model
          </label>
          <input
            type="text"
            value={routerModel}
            onChange={event => setRouterModel(event.target.value)}
            className="neu-input"
            placeholder="hAP ac2, Archer, Custom"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Gateway IP
          </label>
          <input
            type="text"
            value={routerIp}
            onChange={event => setRouterIp(event.target.value)}
            className="neu-input"
            placeholder="192.168.1.1"
          />
        </div>
        <div className="neu-sm p-3 text-sm text-[var(--text-secondary)]">
          Captive portal URL:{" "}
          <code className="text-[var(--text-primary)]">
            {window.location.origin}/hotspot
          </code>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!merchant || isSaving}
        className="neu-btn-primary px-6 py-3 font-semibold disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Changes"}
      </button>
      {(updateMerchant.error || updateBranch.error) && (
        <p className="text-sm text-[var(--accent-danger)]">
          {(updateMerchant.error || updateBranch.error)?.message}
        </p>
      )}
    </div>
  );
}

// Legacy dashboard retained as a rollback reference while the simplified
// Sriyan merchant console below is the active export.
function LegacyMerchantDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showGenerate, setShowGenerate] = useState(false);

  const { user, isLoading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = trpc.merchant.dashboard.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const merchantId = dashboard?.merchant.id;

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            merchantId={merchantId}
            onGenerate={() => setShowGenerate(true)}
          />
        );
      case "tickets":
        return (
          <TicketsTab
            merchantId={merchantId}
            onGenerate={() => setShowGenerate(true)}
          />
        );
      case "sessions":
        return <SessionsTab merchantId={merchantId} />;
      case "payments":
        return <PaymentsTab merchantId={merchantId} />;
      case "gateway":
        return (
          <GatewayTab
            dashboard={dashboard}
            onGenerate={() => setShowGenerate(true)}
          />
        );
      case "compliance":
        return <ComplianceTab dashboard={dashboard} />;
      case "analytics":
        return <AnalyticsTab merchantId={merchantId} />;
      case "blockchain":
        return <BlockchainLink />;
      case "settings":
        return <SettingsTab dashboard={dashboard} />;
      default:
        return (
          <OverviewTab
            merchantId={merchantId}
            onGenerate={() => setShowGenerate(true)}
          />
        );
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-primary)" }}
    >
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {dashboard?.merchant.businessName ||
                `Welcome back, ${user?.name || "Merchant"}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/connect"
              className="neu-btn p-2.5"
              title="View Connect Page"
            >
              <Globe className="w-5 h-5 text-[var(--text-primary)]" />
            </Link>
            <button className="neu-btn p-2.5 relative">
              <Bell className="w-5 h-5 text-[var(--text-primary)]" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[var(--accent-danger)] rounded-full" />
            </button>
            <div className="neu-sm w-10 h-10 rounded-full overflow-hidden">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full gradient-accent flex items-center justify-center text-white font-bold">
                  {(user?.name || "M").charAt(0)}
                </div>
              )}
            </div>
          </div>
        </header>

        <MerchantAccessAlerts merchantId={merchantId} />

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {authLoading || (!user && !dashboardError) || dashboardLoading ? (
              <div className="neu-flat p-6 text-[var(--text-secondary)]">
                Loading realtime dashboard...
              </div>
            ) : !user ? (
              <div className="neu-flat p-6 border-l-4 border-[var(--accent-warning)]">
                <p className="font-semibold text-[var(--text-primary)]">
                  Sign in required
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Redirecting to login so this merchant account works with your
                  own session.
                </p>
              </div>
            ) : dashboardError ? (
              <div className="neu-flat p-6 border-l-4 border-[var(--accent-danger)]">
                <p className="font-semibold text-[var(--text-primary)]">
                  Dashboard could not connect
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {dashboardError.message}
                </p>
              </div>
            ) : !dashboard ? (
              <MerchantOnboarding />
            ) : (
              renderTab()
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Generate Ticket Modal */}
      <AnimatePresence>
        {showGenerate && (
          <GenerateTicketModal
            merchantId={merchantId}
            merchantName={dashboard?.merchant.businessName}
            merchantUpiId={dashboard?.merchant.upiId}
            branchId={dashboard?.branches[0]?.id}
            onClose={() => setShowGenerate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Blockchain link component
function BlockchainLink() {
  return (
    <div className="text-center py-16">
      <Database className="w-16 h-16 text-[var(--accent-primary)] mx-auto mb-4" />
      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        Blockchain Ledger
      </h3>
      <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
        View the complete immutable audit trail of all tickets, sessions, and
        payments on the blockchain.
      </p>
      <Link
        to="/blockchain"
        className="neu-btn-primary px-8 py-3 inline-flex items-center gap-2"
      >
        <Database className="w-5 h-5" />
        Open Blockchain Explorer
      </Link>
    </div>
  );
}

void LegacyMerchantDashboard;

type ScMerchantTab =
  | "dashboard"
  | "plans"
  | "codes"
  | "users"
  | "queue"
  | "payments"
  | "revenue"
  | "analytics"
  | "router"
  | "network"
  | "security"
  | "staff"
  | "notifications"
  | "support"
  | "profile";

type ScGeneratedTicket = {
  code: string;
  type: "qr" | "otp";
  price: number;
};

function useScMerchantTheme() {
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

function ScMerchantStatus({
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

function ScMerchantMetric({
  icon: Icon,
  label,
  value,
  helper,
  tone = "info",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="sc-metric">
      <div className="sc-row mb-4">
        <span className="sc-icon-box">
          <Icon className="h-5 w-5" />
        </span>
        <ScMerchantStatus tone={tone}>{helper}</ScMerchantStatus>
      </div>
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-sm font-extrabold text-[var(--sc-muted)]">
        {label}
      </div>
    </div>
  );
}

function ScMerchantSidebar({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
}: {
  activeTab: ScMerchantTab;
  setActiveTab: (tab: ScMerchantTab) => void;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
}) {
  const { logout } = useAuth();
  const items: Array<{
    id: ScMerchantTab;
    icon: ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { id: "dashboard", icon: BarChart3, label: "Dashboard" },
    { id: "plans", icon: Layers, label: "Create Plan" },
    { id: "codes", icon: QrCode, label: "QR / OTP" },
    { id: "users", icon: Users, label: "Active Users" },
    { id: "queue", icon: History, label: "Queue" },
    { id: "payments", icon: WalletCards, label: "Payments" },
    { id: "revenue", icon: IndianRupee, label: "Revenue" },
    { id: "analytics", icon: TrendingUp, label: "Analytics" },
    { id: "router", icon: Activity, label: "Router Health" },
    { id: "network", icon: Router, label: "Network Settings" },
    { id: "security", icon: LockKeyhole, label: "Security" },
    { id: "staff", icon: UserCog, label: "Staff" },
    { id: "notifications", icon: Bell, label: "Notifications" },
    { id: "support", icon: HelpCircle, label: "Support" },
    { id: "profile", icon: Settings, label: "Profile" },
  ];

  return (
    <aside className="sc-sidebar">
      <Link to="/" className="sc-brand">
        <span className="sc-brand-mark">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span>
          <span className="block leading-tight">Sriyan</span>
          <span className="sc-kicker block">Merchant Console</span>
        </span>
      </Link>

      <nav className="sc-sidebar-nav" aria-label="Merchant sections">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`sc-sidebar-item ${
              activeTab === item.id ? "is-active" : ""
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto grid gap-2">
        <button
          type="button"
          className="sc-button"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
        <button
          type="button"
          onClick={() => logout()}
          className="sc-button text-[var(--sc-danger)]"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function ScMerchantHeader({
  title,
  subtitle,
  onCreatePlan,
}: {
  title: string;
  subtitle: string;
  onCreatePlan: () => void;
}) {
  return (
    <header className="sc-header-row mb-6">
      <div>
        <ScMerchantStatus tone="success">
          <Radio className="h-4 w-4" />
          Live operations
        </ScMerchantStatus>
        <h1 className="mt-3 text-3xl font-black text-[var(--sc-text)]">
          {title}
        </h1>
        <p className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
          {subtitle}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/connect" className="sc-button">
          <Globe className="h-4 w-4" />
          Customer view
        </Link>
        <button type="button" onClick={onCreatePlan} className="sc-button-primary">
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>
    </header>
  );
}

function ScRevenueChart({
  merchantId,
}: {
  merchantId?: number;
}) {
  const { data: dailyRevenue } = trpc.payment.dailyRevenue.useQuery(
    { merchantId: merchantId ?? 0, days: 7 },
    { enabled: !!merchantId }
  );
  const chartData = useMemo(() => {
    const now = new Date();
    const revenueByDay = new Map(
      (dailyRevenue ?? []).map(row => [row.day, row.revenue])
    );

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - index));
      const key = day.toISOString().slice(0, 10);
      return {
        day: day.toLocaleDateString("en-IN", { weekday: "short" }),
        revenue: revenueByDay.get(key) ?? 0,
      };
    });
  }, [dailyRevenue]);

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--sc-line)" />
        <XAxis dataKey="day" stroke="var(--sc-muted)" fontSize={12} />
        <YAxis stroke="var(--sc-muted)" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: "var(--sc-surface-strong)",
            border: "1px solid var(--sc-line)",
            borderRadius: 8,
            color: "var(--sc-text)",
          }}
        />
        <Bar dataKey="revenue" fill="var(--sc-primary)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ScDashboardOverview({
  merchantId,
  dashboard,
  onOpenPlan,
  onGenerateCode,
  setActiveTab,
}: {
  merchantId?: number;
  dashboard: DashboardData;
  onOpenPlan: () => void;
  onGenerateCode: (type: "qr" | "otp") => void;
  setActiveTab: (tab: ScMerchantTab) => void;
}) {
  const branch = dashboard?.branches[0];
  const { data: kpis, isLoading } = trpc.analytics.kpis.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId, refetchInterval: 5000 }
  );
  const { data: approvals } = trpc.ticket.pendingAccessApprovals.useQuery(
    { merchantId: merchantId ?? 0, limit: 25 },
    { enabled: !!merchantId, refetchInterval: 4000 }
  );
  const activeUsers = kpis?.activeNow ?? 0;
  const capacity = Math.max(8, Math.round((branch?.bandwidthMbps ?? 80) / 4));
  const availableSlots = Math.max(0, capacity - activeUsers);
  const queueCount = (approvals?.length ?? 0) + (availableSlots === 0 ? 3 : 0);
  const networkOnline = Boolean(branch?.ssid || branch?.hotspotSsid);

  const metrics = [
    {
      icon: Users,
      label: "Active Users",
      value: isLoading ? "..." : String(activeUsers),
      helper: "Now",
      tone: "success" as const,
    },
    {
      icon: Signal,
      label: "Available Slots",
      value: String(availableSlots),
      helper: `${capacity} capacity`,
      tone: availableSlots > 0 ? ("success" as const) : ("warning" as const),
    },
    {
      icon: History,
      label: "Queue",
      value: String(queueCount),
      helper: queueCount ? "Waiting" : "Clear",
      tone: queueCount ? ("warning" as const) : ("success" as const),
    },
    {
      icon: IndianRupee,
      label: "Revenue",
      value: isLoading ? "..." : formatCurrency(kpis?.totalRevenue),
      helper: "Settled",
      tone: "info" as const,
    },
    {
      icon: networkOnline ? Radio : WifiOff,
      label: "Network Status",
      value: networkOnline ? "Online" : "Offline",
      helper: branch?.internetSource === "phone_hotspot" ? "Hotspot" : "Router",
      tone: networkOnline ? ("success" as const) : ("danger" as const),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-5 sm:grid-cols-2">
        {metrics.map(metric => (
          <ScMerchantMetric key={metric.label} {...metric} />
        ))}
      </div>

      <section className="sc-panel">
        <div className="sc-row mb-5">
          <div>
            <h2 className="text-xl font-black">Quick actions</h2>
            <p className="text-sm font-semibold text-[var(--sc-muted)]">
              Common shop-owner tasks stay one tap away.
            </p>
          </div>
          <ScMerchantStatus tone="success">
            <BadgeCheck className="h-4 w-4" />
            Simple mode
          </ScMerchantStatus>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            {
              label: "Create Plan",
              icon: Layers,
              action: onOpenPlan,
            },
            {
              label: "Generate QR",
              icon: QrCode,
              action: () => onGenerateCode("qr"),
            },
            {
              label: "Generate OTP",
              icon: KeyRound,
              action: () => onGenerateCode("otp"),
            },
            {
              label: "View Users",
              icon: Users,
              action: () => setActiveTab("users"),
            },
            {
              label: "View Queue",
              icon: History,
              action: () => setActiveTab("queue"),
            },
            {
              label: "View Revenue",
              icon: IndianRupee,
              action: () => setActiveTab("revenue"),
            },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="sc-card sc-card-interactive text-left"
            >
              <item.icon className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
              <span className="font-black">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <section className="sc-panel">
          <div className="sc-row mb-5">
            <div>
              <h2 className="text-xl font-black">Revenue trend</h2>
              <p className="text-sm font-semibold text-[var(--sc-muted)]">
                Real-time payment and settlement movement.
              </p>
            </div>
            <IndianRupee className="h-5 w-5 text-[var(--sc-primary)]" />
          </div>
          <ScRevenueChart merchantId={merchantId} />
        </section>

        <section className="sc-panel space-y-4">
          <div className="sc-row">
            <div>
              <h2 className="text-xl font-black">Network at a glance</h2>
              <p className="text-sm font-semibold text-[var(--sc-muted)]">
                Advanced controls remain under Network Settings.
              </p>
            </div>
            <Router className="h-5 w-5 text-[var(--sc-primary)]" />
          </div>
          <div className="sc-card">
            <div className="sc-kicker">SSID</div>
            <div className="mt-1 text-2xl font-black">
              {branch?.internetSource === "phone_hotspot"
                ? branch.hotspotSsid || branch.ssid || "Sriyan_Hotspot"
                : branch?.ssid || "Sriyan_Guest"}
            </div>
          </div>
          <div className="sc-grid-2">
            <div className="sc-card">
              <Gauge className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
              <div className="text-xs font-black text-[var(--sc-muted)]">
                Bandwidth
              </div>
              <div className="font-black">{branch?.bandwidthMbps ?? 80} Mbps</div>
            </div>
            <div className="sc-card">
              <MapPin className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
              <div className="text-xs font-black text-[var(--sc-muted)]">
                Branch
              </div>
              <div className="font-black">Main hotspot</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ScPlanBuilderModal({
  merchantId,
  merchantName,
  merchantUpiId,
  branchId,
  initialType,
  onClose,
}: {
  merchantId?: number;
  merchantName?: string | null;
  merchantUpiId?: string | null;
  branchId?: number;
  initialType: "qr" | "otp";
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"qr" | "otp">(initialType);
  const [planName, setPlanName] = useState("Quick Guest Pass");
  const [price, setPrice] = useState(29);
  const [duration, setDuration] = useState(60);
  const [dataLimitMb, setDataLimitMb] = useState(1024);
  const [bandwidthMbps, setBandwidthMbps] = useState(20);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [concurrentUsers, setConcurrentUsers] = useState(20);
  const [generated, setGenerated] = useState<ScGeneratedTicket | null>(null);
  const upiId = savedUpiId(merchantUpiId);
  const utils = trpc.useUtils();
  const generateMutation = trpc.ticket.generate.useMutation({
    onSuccess: data => {
      setGenerated({
        code: data.ticket.code,
        type: data.ticket.type,
        price: data.ticket.price,
      });
      if (merchantId) {
        void utils.ticket.list.invalidate({ merchantId });
        void utils.ticket.stats.invalidate({ merchantId });
        void utils.analytics.kpis.invalidate({ merchantId });
      }
    },
  });
  const steps = [
    "Plan",
    "Price",
    "Duration",
    "Data",
    "Bandwidth",
    "Devices",
    "Review",
  ];
  const canPublish = Boolean(merchantId && planName.trim());

  const publish = () => {
    if (!merchantId || !canPublish) return;
    generateMutation.mutate({
      merchantId,
      branchId,
      type,
      durationMinutes: duration,
      dataLimitMb,
      speedLimitMbps: bandwidthMbps,
      maxDevices: deviceLimit,
      price,
    });
  };

  return (
    <motion.div
      className="sc-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="sc-modal"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={event => event.stopPropagation()}
      >
        <div className="grid gap-0 lg:grid-cols-[0.72fr_0.28fr]">
          <section className="p-6">
            <div className="sc-row mb-6">
              <div>
                <ScMerchantStatus tone="info">
                  <Layers className="h-4 w-4" />
                  Guided plan builder
                </ScMerchantStatus>
                <h2 className="mt-3 text-2xl font-black">
                  Create Plan and Generate {type.toUpperCase()}
                </h2>
              </div>
              <button type="button" onClick={onClose} className="sc-icon-button">
                <X className="h-4 w-4" />
              </button>
            </div>

            {generated ? (
              <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                <QRDisplay
                  code={generated.code}
                  type={generated.type}
                  price={generated.price}
                  merchantName={merchantName}
                  upiId={upiId}
                />
                <div className="sc-panel space-y-4">
                  <ScMerchantStatus tone="success">
                    <Check className="h-4 w-4" />
                    Published
                  </ScMerchantStatus>
                  <h3 className="text-2xl font-black">{planName}</h3>
                  <p className="text-sm font-semibold text-[var(--sc-muted)]">
                    Scan → Verify → Pay → Connect is ready for customers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setGenerated(null)}
                    className="sc-button"
                  >
                    <Plus className="h-4 w-4" />
                    Generate another
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[0.74fr_0.26fr]">
                <div className="space-y-5">
                  <div className="sc-flow">
                    {steps.map((item, index) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setStep(index)}
                        className={`sc-flow-step text-left ${
                          index === step
                            ? "is-active"
                            : index < step
                              ? "is-done"
                              : ""
                        }`}
                      >
                        <BadgeCheck className="h-4 w-4" />
                        <span className="text-xs font-black">{item}</span>
                      </button>
                    ))}
                  </div>

                  <div className="sc-panel space-y-4">
                    {step === 0 && (
                      <>
                        <label>
                          <span className="sc-label">Plan name</span>
                          <input
                            value={planName}
                            onChange={event => setPlanName(event.target.value)}
                            className="sc-input"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setType("qr")}
                            className={`sc-card sc-card-interactive text-left ${
                              type === "qr" ? "border-[var(--sc-primary)]" : ""
                            }`}
                          >
                            <QrCode className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
                            <div className="font-black">Generate QR</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setType("otp")}
                            className={`sc-card sc-card-interactive text-left ${
                              type === "otp" ? "border-[var(--sc-primary)]" : ""
                            }`}
                          >
                            <KeyRound className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
                            <div className="font-black">Generate OTP</div>
                          </button>
                        </div>
                      </>
                    )}
                    {step === 1 && (
                      <label>
                        <span className="sc-label">Price (Rs.)</span>
                        <input
                          type="number"
                          min="0"
                          value={price}
                          onChange={event => setPrice(Number(event.target.value))}
                          className="sc-input"
                        />
                      </label>
                    )}
                    {step === 2 && (
                      <label>
                        <span className="sc-label">Duration: {duration} minutes</span>
                        <input
                          type="range"
                          min="5"
                          max="1440"
                          step="5"
                          value={duration}
                          onChange={event => setDuration(Number(event.target.value))}
                          className="w-full accent-[var(--sc-primary)]"
                        />
                      </label>
                    )}
                    {step === 3 && (
                      <label>
                        <span className="sc-label">Data limit (MB)</span>
                        <input
                          type="number"
                          min="100"
                          value={dataLimitMb}
                          onChange={event =>
                            setDataLimitMb(Number(event.target.value))
                          }
                          className="sc-input"
                        />
                      </label>
                    )}
                    {step === 4 && (
                      <label>
                        <span className="sc-label">Bandwidth (Mbps)</span>
                        <input
                          type="number"
                          min="1"
                          value={bandwidthMbps}
                          onChange={event =>
                            setBandwidthMbps(Number(event.target.value))
                          }
                          className="sc-input"
                        />
                      </label>
                    )}
                    {step === 5 && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="sc-label">Device limit</span>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={deviceLimit}
                            onChange={event =>
                              setDeviceLimit(Number(event.target.value))
                            }
                            className="sc-input"
                          />
                        </label>
                        <label>
                          <span className="sc-label">Concurrent users</span>
                          <input
                            type="number"
                            min="1"
                            value={concurrentUsers}
                            onChange={event =>
                              setConcurrentUsers(Number(event.target.value))
                            }
                            className="sc-input"
                          />
                        </label>
                      </div>
                    )}
                    {step === 6 && (
                      <div className="sc-card">
                        <div className="font-black">Review and publish</div>
                        <p className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
                          The plan creates a live {type.toUpperCase()} token with
                          price, duration, data, bandwidth and device limits.
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(Math.max(0, step - 1))}
                        className="sc-button"
                      >
                        Back
                      </button>
                      {step < steps.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
                          className="sc-button-primary"
                        >
                          Next
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={publish}
                          disabled={!canPublish || generateMutation.isPending}
                          className="sc-button-primary"
                        >
                          {generateMutation.isPending ? "Publishing..." : "Publish"}
                        </button>
                      )}
                    </div>
                    {generateMutation.error && (
                      <p className="text-sm font-bold text-[var(--sc-danger)]">
                        {generateMutation.error.message}
                      </p>
                    )}
                  </div>
                </div>

                <aside className="sc-panel h-fit space-y-4">
                  <ScMerchantStatus tone="success">
                    <Layers className="h-4 w-4" />
                    Live preview
                  </ScMerchantStatus>
                  <h3 className="text-xl font-black">{planName}</h3>
                  <div className="sc-grid-2">
                    <div className="sc-card">
                      <IndianRupee className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                      <div className="font-black">Rs. {price}</div>
                    </div>
                    <div className="sc-card">
                      <Timer className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                      <div className="font-black">{duration} min</div>
                    </div>
                    <div className="sc-card">
                      <Database className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                      <div className="font-black">{dataLimitMb} MB</div>
                    </div>
                    <div className="sc-card">
                      <Gauge className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                      <div className="font-black">{bandwidthMbps} Mbps</div>
                    </div>
                  </div>
                  <div className="sc-card">
                    <Users className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
                    <div className="font-black">
                      {deviceLimit} device / {concurrentUsers} concurrent users
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </section>

          <aside className="border-l border-[var(--sc-line)] bg-[var(--sc-surface-muted)] p-6">
            <div className="sc-card">
              <div className="sc-kicker">Customer QR story</div>
              <div className="mt-3 grid gap-2">
                {["Scan", "Verify", "Pay", "Connect"].map(item => (
                  <div key={item} className="flex items-center gap-2 font-black">
                    <Check className="h-4 w-4 text-[var(--sc-success)]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ScMerchantOnboarding() {
  const utils = trpc.useUtils();
  const [businessName, setBusinessName] = useState("Sriyan Merchant");
  const [businessType, setBusinessType] = useState<BusinessType>("public_wifi");
  const [upiId, setUpiId] = useState(savedUpiId());
  const [internetSource, setInternetSource] =
    useState<NetworkSource>("router_wifi");
  const [ssid, setSsid] = useState("Sriyan_Guest");
  const [settlementPhone, setSettlementPhone] = useState("");

  const createMerchant = trpc.merchant.create.useMutation();
  const createBranch = trpc.merchant.createBranch.useMutation({
    onSuccess: () => {
      void utils.merchant.dashboard.invalidate();
      void utils.merchant.publicDefault.invalidate();
    },
  });
  const normalizedUpiId = normalizeUpiId(upiId);
  const upiReady = isValidUpiId(normalizedUpiId);
  const isSaving = createMerchant.isPending || createBranch.isPending;
  const saveError = createMerchant.error || createBranch.error;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessName.trim() || !upiReady || isSaving) return;

    if (typeof window !== "undefined") {
      window.localStorage.setItem("sriyan-merchant-upi-id", normalizedUpiId);
    }

    try {
      const created = await createMerchant.mutateAsync({
        businessName: businessName.trim(),
        businessType,
        upiId: normalizedUpiId,
        settlementAccountName: businessName.trim(),
        settlementPhone: settlementPhone.trim() || undefined,
      });

      await createBranch.mutateAsync({
        merchantId: created.merchantId,
        name: "Main Branch",
        ssid: ssid.trim() || "Sriyan_Guest",
        internetSource,
        gatewayMode:
          internetSource === "phone_hotspot"
            ? "phone_token_bridge"
            : "captive_portal",
        hotspotSsid:
          internetSource === "phone_hotspot"
            ? ssid.trim() || "Sriyan_Hotspot"
            : undefined,
        hotspotDeviceName:
          internetSource === "phone_hotspot"
            ? "Merchant phone hotspot"
            : undefined,
        hotspotOwnerPhone: settlementPhone.trim() || undefined,
        bandwidthMbps: 80,
      });
    } catch {
      // Mutation state renders the error below.
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sc-panel mx-auto max-w-4xl space-y-6">
      <div>
        <ScMerchantStatus tone="info">
          <Building2 className="h-4 w-4" />
          Business setup
        </ScMerchantStatus>
        <h1 className="mt-3 text-3xl font-black">Set up your WiFi business</h1>
        <p className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
          Non-technical setup: business, branch, payment and network in one form.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="sc-label">Business name</span>
          <input
            value={businessName}
            onChange={event => setBusinessName(event.target.value)}
            className="sc-input"
          />
        </label>
        <label>
          <span className="sc-label">Business type</span>
          <select
            value={businessType}
            onChange={event => setBusinessType(event.target.value as BusinessType)}
            className="sc-select"
          >
            {BUSINESS_TYPES.map(type => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sc-label">Merchant UPI ID</span>
          <input
            value={upiId}
            onChange={event => setUpiId(event.target.value)}
            className="sc-input"
            placeholder="merchant@bank"
          />
        </label>
        <label>
          <span className="sc-label">Merchant phone</span>
          <input
            value={settlementPhone}
            onChange={event => setSettlementPhone(event.target.value)}
            className="sc-input"
            placeholder="Optional"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          {
            id: "router_wifi" as const,
            icon: Router,
            title: "Router WiFi",
            text: "Recommended captive portal mode.",
          },
          {
            id: "phone_hotspot" as const,
            icon: Smartphone,
            title: "Phone Hotspot",
            text: "Simple token bridge for a merchant phone.",
          },
        ].map(source => (
          <button
            key={source.id}
            type="button"
            onClick={() => setInternetSource(source.id)}
            className={`sc-card sc-card-interactive text-left ${
              internetSource === source.id ? "border-[var(--sc-primary)]" : ""
            }`}
          >
            <source.icon className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
            <div className="font-black">{source.title}</div>
            <div className="text-sm font-semibold text-[var(--sc-muted)]">
              {source.text}
            </div>
          </button>
        ))}
      </div>
      <label>
        <span className="sc-label">Network name</span>
        <input
          value={ssid}
          onChange={event => setSsid(event.target.value)}
          className="sc-input"
        />
      </label>
      {saveError && (
        <p className="text-sm font-bold text-[var(--sc-danger)]">
          {saveError.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!businessName.trim() || !upiReady || isSaving}
        className="sc-button-primary w-full"
      >
        {isSaving ? "Creating..." : "Create Merchant Account"}
      </button>
    </form>
  );
}

function ScCodesTab({
  merchantId,
  onGenerate,
}: {
  merchantId?: number;
  onGenerate: (type: "qr" | "otp") => void;
}) {
  const { data: tickets, isLoading } = trpc.ticket.list.useQuery(
    { merchantId: merchantId ?? 0, limit: 120 },
    { enabled: !!merchantId, refetchInterval: 5000 }
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onGenerate("qr")}
          className="sc-card sc-card-interactive text-left"
        >
          <QrCode className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
          <div className="font-black">Generate QR</div>
          <div className="text-sm font-semibold text-[var(--sc-muted)]">
            Customer sees Scan → Verify → Pay → Connect.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onGenerate("otp")}
          className="sc-card sc-card-interactive text-left"
        >
          <KeyRound className="mb-3 h-5 w-5 text-[var(--sc-primary)]" />
          <div className="font-black">Generate OTP</div>
          <div className="text-sm font-semibold text-[var(--sc-muted)]">
            Simple fallback for customers without camera access.
          </div>
        </button>
      </div>
      <section className="sc-panel">
        <div className="sc-row mb-4">
          <h2 className="text-xl font-black">Recent QR / OTP tokens</h2>
          <ScMerchantStatus tone="info">
            <Radio className="h-4 w-4" />
            Live
          </ScMerchantStatus>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && <div className="sc-card sc-skeleton h-28" />}
          {!isLoading && !(tickets ?? []).length && (
            <div className="sc-card text-sm font-semibold text-[var(--sc-muted)]">
              Empty state: create a plan or generate a QR/OTP to start.
            </div>
          )}
          {(tickets ?? []).slice(0, 9).map(ticket => (
            <div key={ticket.id} className="sc-card">
              <div className="sc-row mb-3">
                <span className="sc-icon-box">
                  {ticket.type === "qr" ? (
                    <QrCode className="h-5 w-5" />
                  ) : (
                    <KeyRound className="h-5 w-5" />
                  )}
                </span>
                <ScMerchantStatus
                  tone={
                    ticket.status === "active"
                      ? "success"
                      : ticket.status === "expired"
                        ? "warning"
                        : "info"
                  }
                >
                  {ticket.status}
                </ScMerchantStatus>
              </div>
              <code className="break-all text-lg font-black">
                {ticket.ticketCode}
              </code>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-[var(--sc-muted)]">
                <span>{ticket.durationMinutes} min</span>
                <span>{formatCurrency(ticket.price)}</span>
                <span>{formatRelativeTime(ticket.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScActiveUsersTab({ merchantId }: { merchantId?: number }) {
  const [now, setNow] = useState(() => Date.now());
  const { data: sessions, isLoading } = trpc.ticket.sessions.useQuery(
    { merchantId: merchantId ?? 0, status: "active", limit: 200 },
    { enabled: !!merchantId, refetchInterval: 5000 }
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="sc-panel">
      <div className="sc-row mb-4">
        <h2 className="text-xl font-black">Active users</h2>
        <ScMerchantStatus tone="success">{sessions?.length ?? 0} online</ScMerchantStatus>
      </div>
      <div className="overflow-x-auto">
        <table className="sc-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Network</th>
              <th>Data</th>
              <th>Speed</th>
              <th>Time left</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6}>Loading active users...</td>
              </tr>
            )}
            {!isLoading && !(sessions ?? []).length && (
              <tr>
                <td colSpan={6}>
                  Empty state: no connected customers right now.
                </td>
              </tr>
            )}
            {(sessions ?? []).map(session => (
              <tr key={session.id}>
                <td className="font-black">{session.ticketCode ?? session.id}</td>
                <td>{session.ssid ?? "Guest WiFi"}</td>
                <td>{Number(session.dataUsedMb ?? 0).toFixed(2)} MB</td>
                <td>
                  {session.speedLimitMbps
                    ? `${session.speedLimitMbps} Mbps`
                    : "Standard"}
                </td>
                <td>
                  <SessionTimerCell session={session} now={now} />
                </td>
                <td>
                  <ScMerchantStatus tone="success">{session.status}</ScMerchantStatus>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScQueueTab({ merchantId }: { merchantId?: number }) {
  const utils = trpc.useUtils();
  const { data: approvals, isLoading } = trpc.ticket.pendingAccessApprovals.useQuery(
    { merchantId: merchantId ?? 0, limit: 50 },
    { enabled: !!merchantId, refetchInterval: 3000 }
  );
  const decideAccess = trpc.ticket.decideAccess.useMutation({
    onSuccess: () => {
      void utils.ticket.pendingAccessApprovals.invalidate();
      void utils.ticket.sessions.invalidate();
      void utils.analytics.kpis.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <section className="sc-panel">
        <div className="sc-row mb-5">
          <div>
            <h2 className="text-xl font-black">Queue</h2>
            <p className="text-sm font-semibold text-[var(--sc-muted)]">
              Shows Network Busy, position, people ahead and expected access.
            </p>
          </div>
          <ScMerchantStatus tone={(approvals?.length ?? 0) ? "warning" : "success"}>
            {(approvals?.length ?? 0) ? "Waiting" : "Clear"}
          </ScMerchantStatus>
        </div>
        <div className="sc-queue-meter mb-5">
          <span style={{ width: `${Math.min(100, (approvals?.length ?? 0) * 18)}%` }} />
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {isLoading && <div className="sc-card sc-skeleton h-32" />}
          {!isLoading && !(approvals ?? []).length && (
            <div className="sc-card">
              <Wifi className="mb-3 h-5 w-5 text-[var(--sc-success)]" />
              <div className="font-black">No queue</div>
              <div className="text-sm font-semibold text-[var(--sc-muted)]">
                Slot available state will show Activate WiFi when needed.
              </div>
            </div>
          )}
          {(approvals ?? []).map((approval, index) => (
            <div key={approval.ticketId} className="sc-card">
              <div className="sc-row mb-3">
                <div>
                  <div className="font-black">
                    Position {index + 1}: {getApprovalCustomer(approval.scanner, approval.code)}
                  </div>
                  <div className="text-sm font-semibold text-[var(--sc-muted)]">
                    {approval.durationMinutes} min access • {formatCurrency(approval.price)}
                  </div>
                </div>
                <ScMerchantStatus tone="warning">Network busy</ScMerchantStatus>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    decideAccess.mutate({
                      ticketId: approval.ticketId,
                      decision: "approved",
                    })
                  }
                  className="sc-button-primary"
                >
                  Slot Available → Activate WiFi
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decideAccess.mutate({
                      ticketId: approval.ticketId,
                      decision: "rejected",
                      reason: "Merchant stopped sharing network access.",
                    })
                  }
                  className="sc-button text-[var(--sc-danger)]"
                >
                  Stop sharing
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScPaymentsOperationsTab({ merchantId }: { merchantId?: number }) {
  return (
    <div className="space-y-6">
      <PaymentsTab merchantId={merchantId} />
    </div>
  );
}

function ScRevenueTab({ merchantId }: { merchantId?: number }) {
  const { data: stats } = trpc.payment.stats.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId, refetchInterval: 5000 }
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <ScMerchantMetric
          icon={IndianRupee}
          label="Total revenue"
          value={formatCurrency(stats?.totalRevenue)}
          helper="Success"
          tone="success"
        />
        <ScMerchantMetric
          icon={Check}
          label="Successful"
          value={String(stats?.success ?? 0)}
          helper="Paid"
          tone="success"
        />
        <ScMerchantMetric
          icon={Clock}
          label="Pending"
          value={String(stats?.pending ?? 0)}
          helper="Waiting"
          tone="warning"
        />
        <ScMerchantMetric
          icon={AlertCircle}
          label="Failed"
          value={String(stats?.failed ?? 0)}
          helper="Needs help"
          tone="danger"
        />
      </div>
      <section className="sc-panel">
        <h2 className="mb-4 text-xl font-black">Revenue</h2>
        <ScRevenueChart merchantId={merchantId} />
      </section>
    </div>
  );
}

function ScAnalyticsOperationsTab({ merchantId }: { merchantId?: number }) {
  const { data: ticketStats } = trpc.ticket.stats.useQuery(
    { merchantId: merchantId ?? 0 },
    { enabled: !!merchantId }
  );
  const statusData = [
    { name: "Active", value: ticketStats?.active ?? 0, color: "var(--sc-success)" },
    { name: "Used", value: ticketStats?.used ?? 0, color: "var(--sc-primary)" },
    { name: "Expired", value: ticketStats?.expired ?? 0, color: "var(--sc-warning)" },
    { name: "Revoked", value: ticketStats?.revoked ?? 0, color: "var(--sc-danger)" },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="sc-panel">
        <h2 className="mb-4 text-xl font-black">Ticket analytics</h2>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={88} label>
              {statusData.map(row => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--sc-surface-strong)",
                border: "1px solid var(--sc-line)",
                borderRadius: 8,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </section>
      <section className="sc-panel">
        <h2 className="mb-4 text-xl font-black">Revenue analytics</h2>
        <ScRevenueChart merchantId={merchantId} />
      </section>
    </div>
  );
}

function ScRouterHealthTab({ dashboard }: { dashboard: DashboardData }) {
  const branch = dashboard?.branches[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="sc-panel space-y-4">
        <ScMerchantStatus tone={branch ? "success" : "danger"}>
          {branch ? "Router online" : "Router offline"}
        </ScMerchantStatus>
        <h2 className="text-2xl font-black">Router health</h2>
        <div className="sc-grid-2">
          <div className="sc-card">
            <Router className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
            <div className="font-black">
              {[branch?.routerBrand, branch?.routerModel].filter(Boolean).join(" ") ||
                "Configured router"}
            </div>
          </div>
          <div className="sc-card">
            <Gauge className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
            <div className="font-black">{branch?.bandwidthMbps ?? 80} Mbps</div>
          </div>
          <div className="sc-card">
            <Signal className="mb-2 h-5 w-5 text-[var(--sc-success)]" />
            <div className="font-black">Quality 94%</div>
          </div>
          <div className="sc-card">
            <Cloud className="mb-2 h-5 w-5 text-[var(--sc-primary)]" />
            <div className="font-black">Cloud sync healthy</div>
          </div>
        </div>
      </section>
      <section className="sc-network-visual min-h-[390px]">
        <span className="sc-signal-ring" aria-hidden="true" />
        <span className="sc-signal-ring" aria-hidden="true" />
        <span className="sc-data-line sc-data-line-one" aria-hidden="true" />
        <span className="sc-data-line sc-data-line-two" aria-hidden="true" />
        <div className="sc-router-core">
          <Router className="h-12 w-12" />
        </div>
      </section>
    </div>
  );
}

function ScNetworkSettingsTab({ dashboard }: { dashboard: DashboardData }) {
  return (
    <div className="space-y-6">
      <GatewayTab dashboard={dashboard} onGenerate={() => undefined} />
      <section className="sc-panel">
        <details>
          <summary className="cursor-pointer text-lg font-black">
            Advanced Network Settings
          </summary>
          <p className="mt-2 text-sm font-semibold text-[var(--sc-muted)]">
            Router controller, gateway endpoint, captive portal and compliance
            controls stay hidden until merchants need them.
          </p>
        </details>
      </section>
    </div>
  );
}

function ScSimpleMerchantPanel({
  tab,
  dashboard,
}: {
  tab: ScMerchantTab;
  dashboard?: DashboardData;
}) {
  const data: Record<
    ScMerchantTab,
    {
      icon: ComponentType<{ className?: string }>;
      title: string;
      subtitle: string;
      state: string;
    }
  > = {
    dashboard: {
      icon: BarChart3,
      title: "Dashboard",
      subtitle: "Live merchant operations.",
      state: "Dashboard ready.",
    },
    plans: {
      icon: Layers,
      title: "Plans",
      subtitle: "Guided plan creation.",
      state: "Use Create Plan to publish QR or OTP access.",
    },
    codes: {
      icon: QrCode,
      title: "QR / OTP",
      subtitle: "Generate customer access codes.",
      state: "No token selected.",
    },
    users: {
      icon: Users,
      title: "Active Users",
      subtitle: "Connected customers.",
      state: "No users currently selected.",
    },
    queue: {
      icon: History,
      title: "Queue",
      subtitle: "Network busy states.",
      state: "Queue is clear.",
    },
    payments: {
      icon: WalletCards,
      title: "Payments",
      subtitle: "UPI and gateway verification.",
      state: "No payment selected.",
    },
    revenue: {
      icon: IndianRupee,
      title: "Revenue",
      subtitle: "Settlement and earnings.",
      state: "Revenue chart ready.",
    },
    analytics: {
      icon: TrendingUp,
      title: "Analytics",
      subtitle: "Network and payment insights.",
      state: "Analytics ready.",
    },
    router: {
      icon: Activity,
      title: "Router Health",
      subtitle: "Router and cloud status.",
      state: "Router health ready.",
    },
    network: {
      icon: Router,
      title: "Network Settings",
      subtitle: "Simple first, advanced hidden.",
      state: "Advanced settings are collapsed.",
    },
    security: {
      icon: Shield,
      title: "Security",
      subtitle: "Verification and access controls.",
      state: "Security policy uses shield/check/device states.",
    },
    staff: {
      icon: UserCog,
      title: "Staff",
      subtitle: "Operator permissions.",
      state: "No staff invites pending.",
    },
    notifications: {
      icon: Bell,
      title: "Notifications",
      subtitle: "Payment, queue, router and session alerts.",
      state: "No urgent notifications.",
    },
    support: {
      icon: HelpCircle,
      title: "Support",
      subtitle: "Help for non-technical merchants.",
      state: "Support is ready.",
    },
    profile: {
      icon: Settings,
      title: "Profile",
      subtitle: dashboard?.merchant.businessName ?? "Merchant profile",
      state: "Business settings ready.",
    },
  };
  const item = data[tab];
  const Icon = item.icon;

  return (
    <section className="sc-panel mx-auto max-w-4xl text-center">
      <span className="sc-brand-mark mx-auto mb-5">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="text-3xl font-black">{item.title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-[var(--sc-muted)]">
        {item.subtitle}
      </p>
      <div className="sc-card mt-6 text-left">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 text-[var(--sc-primary)]" />
          <div>
            <div className="font-black">{item.state}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sc-muted)]">
              Loading, success, error, empty, disabled, offline and permission
              states follow the Sriyan status system.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function MerchantDashboard() {
  const [activeTab, setActiveTab] = useState<ScMerchantTab>("dashboard");
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [initialCodeType, setInitialCodeType] = useState<"qr" | "otp">("qr");
  const [darkMode, setDarkMode] = useScMerchantTheme();
  const { user, isLoading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = trpc.merchant.dashboard.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const merchantId = dashboard?.merchant.id;

  const openPlanBuilder = (type: "qr" | "otp" = "qr") => {
    setInitialCodeType(type);
    setShowPlanBuilder(true);
  };

  const activeTitle =
    activeTab === "dashboard"
      ? "Merchant Dashboard"
      : activeTab
          .split("_")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

  const renderContent = () => {
    if (authLoading || (!user && !dashboardError) || dashboardLoading) {
      return (
        <div className="sc-panel">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 animate-pulse text-[var(--sc-primary)]" />
            <div>
              <div className="font-black">Loading real-time dashboard</div>
              <div className="text-sm font-semibold text-[var(--sc-muted)]">
                Payment, ticket, connection and router state are syncing.
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="sc-panel">
          <ScMerchantStatus tone="warning">Sign in required</ScMerchantStatus>
          <p className="mt-3 font-semibold text-[var(--sc-muted)]">
            Redirecting to login for this merchant account.
          </p>
        </div>
      );
    }

    if (dashboardError) {
      return (
        <div className="sc-panel">
          <ScMerchantStatus tone="danger">Dashboard unavailable</ScMerchantStatus>
          <p className="mt-3 font-semibold text-[var(--sc-muted)]">
            {dashboardError.message}
          </p>
        </div>
      );
    }

    if (!dashboard) return <ScMerchantOnboarding />;

    switch (activeTab) {
      case "dashboard":
        return (
          <ScDashboardOverview
            merchantId={merchantId}
            dashboard={dashboard}
            onOpenPlan={() => openPlanBuilder("qr")}
            onGenerateCode={openPlanBuilder}
            setActiveTab={setActiveTab}
          />
        );
      case "plans":
        return (
          <ScSimpleMerchantPanel tab="plans" dashboard={dashboard} />
        );
      case "codes":
        return <ScCodesTab merchantId={merchantId} onGenerate={openPlanBuilder} />;
      case "users":
        return <ScActiveUsersTab merchantId={merchantId} />;
      case "queue":
        return <ScQueueTab merchantId={merchantId} />;
      case "payments":
        return <ScPaymentsOperationsTab merchantId={merchantId} />;
      case "revenue":
        return <ScRevenueTab merchantId={merchantId} />;
      case "analytics":
        return <ScAnalyticsOperationsTab merchantId={merchantId} />;
      case "router":
        return <ScRouterHealthTab dashboard={dashboard} />;
      case "network":
        return <ScNetworkSettingsTab dashboard={dashboard} />;
      case "profile":
        return <SettingsTab dashboard={dashboard} />;
      default:
        return <ScSimpleMerchantPanel tab={activeTab} dashboard={dashboard} />;
    }
  };

  return (
    <div className={`sc-app ${darkMode ? "sc-dark" : ""}`}>
      <div className="sc-dashboard">
        <ScMerchantSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
        <main className="sc-main">
          <ScMerchantHeader
            title={activeTitle}
            subtitle={
              dashboard?.merchant.businessName ??
              "Simple operations for premium public WiFi"
            }
            onCreatePlan={() => openPlanBuilder("qr")}
          />
          <MerchantAccessAlerts merchantId={merchantId} />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {showPlanBuilder && (
          <ScPlanBuilderModal
            merchantId={merchantId}
            merchantName={dashboard?.merchant.businessName}
            merchantUpiId={dashboard?.merchant.upiId}
            branchId={dashboard?.branches[0]?.id}
            initialType={initialCodeType}
            onClose={() => setShowPlanBuilder(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
