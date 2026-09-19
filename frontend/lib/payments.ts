export type PaymentGatewayProvider = "razorpay" | "phonepe" | "cashfree";

export type CreatedPayment = {
  id: number;
  merchantId?: number;
  transactionId?: string;
  invoiceNumber?: string;
  amount: number;
  gstAmount?: number;
  status: string;
  gatewayProvider?: PaymentGatewayProvider;
  gatewayOrderId?: string;
  currency?: string;
};

export type GatewayCheckout =
  | {
      mode: "razorpay";
      provider: "razorpay";
      publicKey: string;
      orderId: string;
      amountMinor: number;
      currency: string;
      name: string;
      description: string;
    }
  | {
      mode: "cashfree";
      provider: "cashfree";
      paymentSessionId: string;
      orderId: string;
      environment: "sandbox" | "production";
    }
  | {
      mode: "redirect";
      provider: "phonepe";
      orderId: string;
      paymentUrl: string;
    };

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget: "_self" | "_blank" }) => Promise<void>;
    };
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load payment script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function launchGatewayCheckout({
  checkout,
  payment,
  customerName,
  customerEmail,
  customerPhone,
  onRazorpaySuccess,
}: {
  checkout: GatewayCheckout;
  payment: CreatedPayment;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  onRazorpaySuccess: (response: RazorpayResponse) => Promise<void>;
}) {
  if (checkout.mode === "redirect") {
    window.location.href = checkout.paymentUrl;
    return;
  }

  if (checkout.mode === "cashfree") {
    await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
    if (!window.Cashfree) {
      throw new Error("Cashfree checkout did not initialize.");
    }
    const cashfree = window.Cashfree({ mode: checkout.environment });
    await cashfree.checkout({
      paymentSessionId: checkout.paymentSessionId,
      redirectTarget: "_self",
    });
    return;
  }

  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!window.Razorpay) {
    throw new Error("Razorpay checkout did not initialize.");
  }

  const razorpay = new window.Razorpay({
    key: checkout.publicKey,
    amount: checkout.amountMinor,
    currency: checkout.currency,
    name: checkout.name,
    description: checkout.description,
    order_id: checkout.orderId,
    prefill: {
      name: customerName,
      email: customerEmail,
      contact: customerPhone,
    },
    notes: {
      sriyan_payment_id: String(payment.id),
      sriyan_transaction_id: payment.transactionId ?? "",
    },
    theme: {
      color: "#2563eb",
    },
    handler: async (response: RazorpayResponse) => {
      await onRazorpaySuccess(response);
    },
  });

  razorpay.open();
}
