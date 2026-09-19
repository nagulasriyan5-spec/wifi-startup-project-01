import {
  verifyCashfreeWebhook,
  verifyPhonePeWebhook,
  verifyRazorpayWebhook,
  type PaymentGatewayProvider,
} from "./lib/payment-gateways";
import { completeSuccessfulPayment, markPaymentFailed } from "./lib/payment-service";

type WebhookResult = {
  received: true;
  provider: PaymentGatewayProvider;
  action: "completed" | "failed" | "ignored";
  paymentId?: number;
};

function parseJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, any>;
  } catch {
    throw new Error("Webhook body must be valid JSON.");
  }
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function extractRazorpayRef(payload: Record<string, any>) {
  const payment = payload.payload?.payment?.entity;
  const order = payload.payload?.order?.entity;
  return {
    transactionId:
      payment?.notes?.sriyan_transaction_id ??
      order?.receipt,
    gatewayOrderId: payment?.order_id ?? order?.id,
    gatewayPaymentId: payment?.id,
    status: normalizeStatus(payment?.status ?? order?.status),
  };
}

function extractCashfreeRef(payload: Record<string, any>) {
  const order = payload.data?.order;
  const payment = payload.data?.payment;
  return {
    transactionId: order?.order_id,
    gatewayOrderId: order?.order_id,
    gatewayPaymentId: payment?.cf_payment_id ? String(payment.cf_payment_id) : undefined,
    status: normalizeStatus(payment?.payment_status ?? payload.type),
  };
}

function extractPhonePeRef(payload: Record<string, any>) {
  const data = payload.payload ?? payload.data ?? payload;
  return {
    transactionId: data.merchantOrderId ?? data.merchantTransactionId,
    gatewayOrderId: data.orderId ?? data.transactionId ?? data.merchantOrderId,
    gatewayPaymentId: data.paymentId ?? data.transactionId,
    status: normalizeStatus(data.state ?? data.status ?? payload.event),
  };
}

function isSuccessStatus(status: string) {
  return ["CAPTURED", "PAID", "SUCCESS", "COMPLETED", "ORDER_PAID", "PAYMENT_SUCCESS_WEBHOOK"].includes(status);
}

function isFailureStatus(status: string) {
  return ["FAILED", "FAILURE", "CANCELLED", "EXPIRED", "PAYMENT_FAILED_WEBHOOK"].includes(status);
}

export async function handlePaymentWebhook(
  provider: PaymentGatewayProvider,
  rawBody: string,
  headers: Headers,
): Promise<WebhookResult> {
  const payload = parseJson(rawBody);

  if (provider === "razorpay") {
    if (!verifyRazorpayWebhook(rawBody, headers.get("x-razorpay-signature"))) {
      throw new Error("Invalid Razorpay webhook signature.");
    }
    const ref = extractRazorpayRef(payload);
    if (payload.event === "payment.failed" || isFailureStatus(ref.status)) {
      const failed = await markPaymentFailed({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "failed", paymentId: failed.paymentId };
    }
    if (payload.event === "payment.captured" || payload.event === "order.paid" || isSuccessStatus(ref.status)) {
      const completed = await completeSuccessfulPayment({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "completed", paymentId: completed.paymentId };
    }
  }

  if (provider === "cashfree") {
    if (!verifyCashfreeWebhook(rawBody, headers)) {
      throw new Error("Invalid Cashfree webhook signature.");
    }
    const ref = extractCashfreeRef(payload);
    if (isSuccessStatus(ref.status)) {
      const completed = await completeSuccessfulPayment({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "completed", paymentId: completed.paymentId };
    }
    if (isFailureStatus(ref.status)) {
      const failed = await markPaymentFailed({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "failed", paymentId: failed.paymentId };
    }
  }

  if (provider === "phonepe") {
    if (!verifyPhonePeWebhook(headers)) {
      throw new Error("Invalid PhonePe webhook authorization.");
    }
    const ref = extractPhonePeRef(payload);
    if (isSuccessStatus(ref.status)) {
      const completed = await completeSuccessfulPayment({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "completed", paymentId: completed.paymentId };
    }
    if (isFailureStatus(ref.status)) {
      const failed = await markPaymentFailed({ provider, ...ref, source: "webhook", gatewayEvent: payload });
      return { received: true, provider, action: "failed", paymentId: failed.paymentId };
    }
  }

  return { received: true, provider, action: "ignored" };
}
