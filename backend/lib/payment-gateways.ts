import crypto from "crypto";
import { env } from "./env";

export type PaymentGatewayProvider = "razorpay" | "phonepe" | "cashfree";

export type GatewayCustomer = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type CreateGatewayOrderInput = {
  provider?: PaymentGatewayProvider;
  paymentId: number;
  merchantId: number;
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  customer: GatewayCustomer;
  ticketCode?: string;
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

export type GatewayOrderResult = {
  provider: PaymentGatewayProvider;
  gatewayOrderId: string;
  checkout: GatewayCheckout;
  raw: unknown;
};

export type GatewayRuntimeStatus = {
  activeProvider: PaymentGatewayProvider | null;
  configured: Record<PaymentGatewayProvider, boolean>;
  missing: Record<PaymentGatewayProvider, string[]>;
};

const providers = ["razorpay", "phonepe", "cashfree"] as const;

function amountToMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

function isProvider(value: string): value is PaymentGatewayProvider {
  return providers.includes(value as PaymentGatewayProvider);
}

function missingValues(values: Record<string, string | undefined>) {
  return Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function getProviderMissingConfig(provider: PaymentGatewayProvider) {
  if (provider === "razorpay") {
    return missingValues({
      RAZORPAY_KEY_ID: env.razorpayKeyId,
      RAZORPAY_KEY_SECRET: env.razorpayKeySecret,
      RAZORPAY_WEBHOOK_SECRET: env.razorpayWebhookSecret,
    });
  }

  if (provider === "cashfree") {
    return missingValues({
      CASHFREE_CLIENT_ID: env.cashfreeClientId,
      CASHFREE_CLIENT_SECRET: env.cashfreeClientSecret,
      CASHFREE_WEBHOOK_SECRET: env.cashfreeWebhookSecret,
    });
  }

  return missingValues({
    PHONEPE_CLIENT_ID: env.phonepeClientId,
    PHONEPE_CLIENT_SECRET: env.phonepeClientSecret,
    PHONEPE_WEBHOOK_USERNAME: env.phonepeWebhookUsername,
    PHONEPE_WEBHOOK_PASSWORD: env.phonepeWebhookPassword,
  });
}

export function getPaymentGatewayRuntimeStatus(): GatewayRuntimeStatus {
  const configured = Object.fromEntries(
    providers.map((provider) => [provider, getProviderMissingConfig(provider).length === 0]),
  ) as Record<PaymentGatewayProvider, boolean>;
  const missing = Object.fromEntries(
    providers.map((provider) => [provider, getProviderMissingConfig(provider)]),
  ) as Record<PaymentGatewayProvider, string[]>;
  const requested = env.paymentGatewayProvider.trim().toLowerCase();

  return {
    activeProvider: isProvider(requested) ? requested : null,
    configured,
    missing,
  };
}

export function resolvePaymentGatewayProvider(
  provider?: PaymentGatewayProvider,
): PaymentGatewayProvider {
  const requested = provider ?? env.paymentGatewayProvider.trim().toLowerCase();
  if (!requested) {
    throw new Error("Set PAYMENT_GATEWAY_PROVIDER to razorpay, phonepe, or cashfree.");
  }
  if (!isProvider(requested)) {
    throw new Error("PAYMENT_GATEWAY_PROVIDER must be razorpay, phonepe, or cashfree.");
  }

  const missing = getProviderMissingConfig(requested);
  if (missing.length > 0) {
    throw new Error(
      `${requested} payment gateway is not configured. Missing: ${missing.join(", ")}.`,
    );
  }

  return requested;
}

function gatewayHeaders(init?: Record<string, string>) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...init,
  };
}

function appendReturnParams(returnUrl: string, params: Record<string, string | number>) {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseGatewayResponse<T>(
  response: Response,
  provider: PaymentGatewayProvider,
): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${provider} order request failed with ${response.status}: ${text || response.statusText}`,
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${provider} order response was not valid JSON.`);
  }
}

async function createRazorpayOrder(
  input: CreateGatewayOrderInput,
): Promise<GatewayOrderResult> {
  const body = {
    amount: amountToMinorUnits(input.amount),
    currency: input.currency,
    receipt: input.transactionId,
      notes: {
      sriyan_payment_id: String(input.paymentId),
      sriyan_transaction_id: input.transactionId,
      sriyan_merchant_id: String(input.merchantId),
      sriyan_ticket_code: input.ticketCode ?? "",
    },
  };
  const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: gatewayHeaders({ Authorization: `Basic ${auth}` }),
    body: JSON.stringify(body),
  });
  const data = await parseGatewayResponse<{ id: string }>(response, "razorpay");

  return {
    provider: "razorpay",
    gatewayOrderId: data.id,
    checkout: {
      mode: "razorpay",
      provider: "razorpay",
      publicKey: env.razorpayKeyId,
      orderId: data.id,
      amountMinor: body.amount,
      currency: input.currency,
      name: "Sriyan WiFi",
      description: input.description,
    },
    raw: data,
  };
}

async function createCashfreeOrder(
  input: CreateGatewayOrderInput,
): Promise<GatewayOrderResult> {
  if (!input.customer.email && !input.customer.phone) {
    throw new Error("Cashfree requires a customer phone number or email address.");
  }

  const endpoint = env.cashfreeEnvironment === "production"
    ? "https://api.cashfree.com/pg/orders"
    : "https://sandbox.cashfree.com/pg/orders";
  const body = {
    order_id: input.transactionId,
    order_amount: input.amount,
    order_currency: input.currency,
    customer_details: {
      customer_id: input.customer.id,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
    },
    order_meta: {
      return_url: appendReturnParams(input.returnUrl, {
        paymentId: input.paymentId,
        provider: "cashfree",
        order_id: input.transactionId,
      }),
      notify_url: `${env.publicAppUrl.replace(/\/$/, "")}/api/webhooks/payments/cashfree`,
    },
    order_note: input.description,
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: gatewayHeaders({
      "x-client-id": env.cashfreeClientId,
      "x-client-secret": env.cashfreeClientSecret,
      "x-api-version": env.cashfreeApiVersion,
    }),
    body: JSON.stringify(body),
  });
  const data = await parseGatewayResponse<{
    order_id: string;
    payment_session_id: string;
  }>(response, "cashfree");

  return {
    provider: "cashfree",
    gatewayOrderId: data.order_id,
    checkout: {
      mode: "cashfree",
      provider: "cashfree",
      paymentSessionId: data.payment_session_id,
      orderId: data.order_id,
      environment: env.cashfreeEnvironment === "production" ? "production" : "sandbox",
    },
    raw: data,
  };
}

async function getPhonePeAccessToken() {
  const endpoint = env.phonepeOauthUrl || (
    env.phonepeEnvironment === "production"
      ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
      : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token"
  );
  const body = new URLSearchParams({
    client_id: env.phonepeClientId,
    client_version: env.phonepeClientVersion,
    client_secret: env.phonepeClientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await parseGatewayResponse<{
    access_token?: string;
    accessToken?: string;
    token_type?: string;
  }>(response, "phonepe");
  const token = data.access_token ?? data.accessToken;
  if (!token) {
    throw new Error("PhonePe OAuth response did not include an access token.");
  }
  return token;
}

async function createPhonePeOrder(
  input: CreateGatewayOrderInput,
): Promise<GatewayOrderResult> {
  const token = await getPhonePeAccessToken();
  const endpoint = env.phonepePayUrl || (
    env.phonepeEnvironment === "production"
      ? "https://api.phonepe.com/apis/pg/checkout/v2/pay"
      : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay"
  );
  const redirectUrl = appendReturnParams(input.returnUrl, {
    paymentId: input.paymentId,
    provider: "phonepe",
    order_id: input.transactionId,
  });
  const body = {
    merchantOrderId: input.transactionId,
    amount: amountToMinorUnits(input.amount),
    expireAfter: 1200,
    metaInfo: {
      udf1: String(input.paymentId),
      udf2: String(input.merchantId),
      udf3: input.ticketCode ?? "",
    },
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: input.description,
      merchantUrls: {
        redirectUrl,
      },
    },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: gatewayHeaders({ Authorization: `O-Bearer ${token}` }),
    body: JSON.stringify(body),
  });
  const data = await parseGatewayResponse<{
    orderId?: string;
    merchantOrderId?: string;
    redirectUrl?: string;
  }>(response, "phonepe");
  const paymentUrl = data.redirectUrl;
  if (!paymentUrl) {
    throw new Error("PhonePe order response did not include a payment redirect URL.");
  }

  return {
    provider: "phonepe",
    gatewayOrderId: data.orderId ?? data.merchantOrderId ?? input.transactionId,
    checkout: {
      mode: "redirect",
      provider: "phonepe",
      orderId: data.orderId ?? data.merchantOrderId ?? input.transactionId,
      paymentUrl,
    },
    raw: data,
  };
}

export async function createGatewayOrder(
  input: CreateGatewayOrderInput,
): Promise<GatewayOrderResult> {
  const provider = resolvePaymentGatewayProvider(input.provider);

  if (provider === "razorpay") return createRazorpayOrder({ ...input, provider });
  if (provider === "cashfree") return createCashfreeOrder({ ...input, provider });
  return createPhonePeOrder({ ...input, provider });
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyRazorpayCheckoutSignature(input: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}) {
  const expected = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
    .digest("hex");

  return timingSafeEqual(expected, input.gatewaySignature);
}

export function verifyRazorpayWebhook(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", env.razorpayWebhookSecret)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqual(expected, signature);
}

export function verifyCashfreeWebhook(rawBody: string, headers: Headers) {
  const signature = headers.get("x-webhook-signature");
  const timestamp = headers.get("x-webhook-timestamp");
  if (!signature || !timestamp) return false;
  const expected = crypto
    .createHmac("sha256", env.cashfreeWebhookSecret)
    .update(`${timestamp}${rawBody}`)
    .digest("base64");
  return timingSafeEqual(expected, signature);
}

export function verifyPhonePeWebhook(headers: Headers) {
  if (!env.phonepeWebhookUsername || !env.phonepeWebhookPassword) return false;
  const auth = headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`${env.phonepeWebhookUsername}:${env.phonepeWebhookPassword}`).toString("base64")}`;
  return timingSafeEqual(expected, auth);
}
