import { useState } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { COPYRIGHT_TEXT } from "@/const";
import { launchGatewayCheckout } from "@/lib/payments";
import type { GatewayCheckout } from "@/lib/payments";
import {
  CreditCard, Smartphone, Check, ArrowRight, ChevronLeft,
  Wifi, Clock, Shield, Zap, AlertCircle, IndianRupee
} from "lucide-react";

const UPI_PROVIDERS = [
  { id: "phonepe", name: "PhonePe", color: "#5f259f" },
  { id: "gpay", name: "Google Pay", color: "#1a73e8" },
  { id: "paytm", name: "Paytm", color: "#00baf2" },
  { id: "other", name: "Other UPI", color: "#6366f1" },
] as const;

type UpiProvider = (typeof UPI_PROVIDERS)[number]["id"];

type PaymentPlan = {
  amount: number;
  duration: number;
};

type CreatedPayment = {
  id: number;
  merchantId: number;
  transactionId: string;
  invoiceNumber: string;
  amount: number;
  gstAmount: number;
  status: string;
  gatewayProvider: "razorpay" | "phonepe" | "cashfree";
  gatewayOrderId: string;
  currency: string;
};

type GeneratedTicket = {
  id: number;
  code: string;
  type: "qr" | "otp";
  durationMinutes: number;
  price: number;
  expiresAt: Date | string | null;
};

// Step 1: Payment details
function PaymentForm({ onSubmit }: { onSubmit: (data: PaymentPlan) => void }) {
  const [amount, setAmount] = useState(20);
  const [duration, setDuration] = useState(60);

  const presets = [
    { amount: 10, duration: 30, label: "30 min" },
    { amount: 20, duration: 60, label: "1 hour" },
    { amount: 50, duration: 180, label: "3 hours" },
    { amount: 100, duration: 480, label: "8 hours" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <CreditCard className="w-10 h-10 text-[var(--accent-primary)]" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Buy WiFi Access</h2>
        <p className="text-[var(--text-secondary)]">Choose your plan and pay via UPI</p>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {presets.map((p) => (
          <button
            key={p.duration}
            onClick={() => { setAmount(p.amount); setDuration(p.duration); }}
            className={`neu-btn p-4 text-left ${amount === p.amount ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
          >
            <div className="text-lg font-bold text-[var(--text-primary)]">Rs. {p.amount}</div>
            <div className="text-sm text-[var(--text-secondary)]">{p.label}</div>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="neu-flat p-4 mb-6">
        <label className="block text-sm text-[var(--text-secondary)] mb-2">Custom Amount (Rs.)</label>
        <div className="flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-[var(--text-secondary)]" />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min="5"
            className="neu-input"
          />
        </div>
      </div>

      {/* Duration slider */}
      <div className="neu-flat p-4 mb-6">
        <label className="block text-sm text-[var(--text-secondary)] mb-2">
          Duration: {duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration} min`}
        </label>
        <input
          type="range"
          min="15"
          max="480"
          step="15"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full accent-[var(--accent-primary)]"
        />
      </div>

      {/* Summary */}
      <div className="neu-flat p-4 mb-6">
        <h4 className="font-semibold text-[var(--text-primary)] mb-3">Order Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>WiFi Access ({duration} min)</span>
            <span>Rs. {(amount * 0.85).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>GST (18%)</span>
            <span>Rs. {(amount * 0.15).toFixed(2)}</span>
          </div>
          <div className="border-t border-[var(--shadow-dark)] pt-2 flex justify-between font-bold text-[var(--text-primary)]">
            <span>Total</span>
            <span>Rs. {amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => onSubmit({ amount, duration })}
        className="neu-btn-primary w-full py-4 text-lg font-semibold flex items-center justify-center gap-2"
      >
        Proceed to Pay
        <ArrowRight className="w-5 h-5" />
      </button>
    </motion.div>
  );
}

// Step 2: UPI Payment
function UpiPayment({
  payment,
  checkout,
  duration,
  onSuccess,
}: {
  payment: CreatedPayment;
  checkout: GatewayCheckout;
  duration: number;
  onSuccess: (ticket: GeneratedTicket | null) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<UpiProvider | "">("");
  const [processing, setProcessing] = useState(false);
  const [gatewayError, setGatewayError] = useState("");

  const verifyMutation = trpc.payment.verifyGatewayPayment.useMutation({
    onSuccess: (data) => {
      setProcessing(false);
      onSuccess(data.ticket);
    },
    onError: (err) => {
      setProcessing(false);
      setGatewayError(err.message);
    },
  });

  const handlePay = async () => {
    if (!selectedProvider) return;
    setProcessing(true);
    setGatewayError("");

    try {
      await launchGatewayCheckout({
        checkout,
        payment,
        onRazorpaySuccess: async (response) => {
          await verifyMutation.mutateAsync({
            provider: "razorpay",
            paymentId: payment.id,
            transactionId: payment.transactionId,
            gatewayOrderId: response.razorpay_order_id,
            gatewayPaymentId: response.razorpay_payment_id,
            gatewaySignature: response.razorpay_signature,
            durationMinutes: duration,
            ticketType: "otp",
          });
        },
      });
      if (checkout.mode !== "razorpay") {
        setProcessing(false);
      }
    } catch (error) {
      setProcessing(false);
      setGatewayError(error instanceof Error ? error.message : "Payment checkout failed");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <div className="neu-lg w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-[var(--accent-success)]" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Gateway Payment</h2>
        <p className="text-[var(--text-secondary)]">
          Open the configured gateway to pay <strong>Rs. {payment.amount}</strong>
        </p>
      </div>

      {/* UPI Providers */}
      <div className="space-y-3 mb-6">
        {UPI_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setSelectedProvider(provider.id)}
            className={`neu-btn w-full p-4 flex items-center gap-4 text-left ${
              selectedProvider === provider.id ? "ring-2 ring-[var(--accent-primary)]" : ""
            }`}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ background: provider.color }}
            >
              {provider.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[var(--text-primary)]">{provider.name}</div>
              <div className="text-xs text-[var(--text-secondary)]">Payment preference</div>
            </div>
            {selectedProvider === provider.id && (
              <Check className="w-5 h-5 text-[var(--accent-success)]" />
            )}
          </button>
        ))}
      </div>

      {/* Gateway order */}
      <div className="neu-flat p-4 mb-6">
        <div className="text-sm text-[var(--text-secondary)] mb-2">Gateway Order</div>
        <code className="text-sm text-[var(--text-primary)] break-all">{payment.gatewayOrderId}</code>
      </div>

      <button
        onClick={handlePay}
        disabled={!selectedProvider || processing}
        className="neu-btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Clock className="w-5 h-5 animate-spin" />
            Opening checkout...
          </>
        ) : (
          <>
            <Smartphone className="w-5 h-5" />
            Pay Rs. {payment.amount}
          </>
        )}
      </button>

      {gatewayError && (
        <div className="mt-4 p-4 neu-flat border-l-4 border-[var(--accent-danger)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">{gatewayError}</p>
          </div>
        </div>
      )}

      <div className="mt-4 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" /> Secure
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" /> Instant
          </span>
          <span className="flex items-center gap-1">
            <Check className="w-3 h-3" /> Verified
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Step 3: Success
function PaymentSuccess({ ticket, onDone }: { ticket: GeneratedTicket | null; onDone: () => void }) {
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

      <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Payment Successful!</h2>
      <p className="text-[var(--text-secondary)] mb-8">
        Your WiFi access ticket has been generated and is ready to use.
      </p>

      <div className="neu-flat p-6 mb-6">
        <div className="neu-pressed p-4 rounded-xl mb-4">
          <div className="text-sm text-[var(--text-secondary)] mb-1">Ticket Code</div>
          <div className="text-2xl font-bold text-gradient tracking-widest">{ticket?.code ?? "Generated"}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Duration</div>
            <div className="font-semibold text-[var(--text-primary)]">{ticket?.durationMinutes ?? 60} minutes</div>
          </div>
          <div className="neu-sm p-3">
            <div className="text-xs text-[var(--text-secondary)]">Type</div>
            <div className="font-semibold text-[var(--text-primary)]">{ticket?.type?.toUpperCase() ?? "OTP"}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/connect"
          className="neu-btn-primary flex-1 py-3 font-semibold flex items-center justify-center gap-2"
        >
          <Wifi className="w-5 h-5" />
          Connect Now
        </Link>
        <button
          onClick={onDone}
          className="neu-btn px-6 py-3 text-[var(--text-primary)]"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}

// Main Payment Page
export default function PaymentPage() {
  const [step, setStep] = useState<"form" | "upi" | "success">("form");
  const [payment, setPayment] = useState<CreatedPayment | null>(null);
  const [checkout, setCheckout] = useState<GatewayCheckout | null>(null);
  const [plan, setPlan] = useState<PaymentPlan>({ amount: 20, duration: 60 });
  const [ticket, setTicket] = useState<GeneratedTicket | null>(null);

  const createMutation = trpc.payment.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setPayment(data.payment);
        setCheckout(data.checkout);
        setStep("upi");
      }
    },
  });

  const handleFormSubmit = (data: { amount: number; duration: number }) => {
    setPlan(data);
    setTicket(null);
    createMutation.mutate({
      amount: data.amount,
      paymentMethod: "upi",
      durationMinutes: data.duration,
      ticketType: "otp",
      returnUrl: `${window.location.origin}/payment`,
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
            <span className="text-xs text-[var(--text-secondary)]">SSL Secured</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="w-full max-w-lg mt-16">
        <AnimatePresence mode="wait">
          {step === "form" && (
            <PaymentForm key="form" onSubmit={handleFormSubmit} />
          )}
          {step === "upi" && payment && checkout && (
            <UpiPayment
              key="upi"
              payment={payment}
              checkout={checkout}
              duration={plan.duration}
              onSuccess={(generatedTicket) => {
                setTicket(generatedTicket);
                setStep("success");
              }}
            />
          )}
          {step === "success" && (
            <PaymentSuccess key="success" ticket={ticket} onDone={() => setStep("form")} />
          )}
        </AnimatePresence>

        {/* Loading state */}
        {createMutation.isPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center"
          >
            <div className="neu-sm w-12 h-12 mx-auto flex items-center justify-center">
              <Clock className="w-6 h-6 text-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">Creating your ticket...</p>
          </motion.div>
        )}

        {/* Error */}
        {createMutation.error && (
          <div className="mt-4 p-4 neu-flat border-l-4 border-[var(--accent-danger)]">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--accent-danger)] shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">{createMutation.error.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-[var(--text-secondary)]">
          Powered by <span className="text-gradient font-semibold">Sriyan</span> WiFi. {COPYRIGHT_TEXT}
        </p>
      </footer>
    </div>
  );
}
