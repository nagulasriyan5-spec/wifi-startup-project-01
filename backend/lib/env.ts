import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const generatedProductionSecret = `ephemeral-${crypto.randomUUID()}`;
const appSecret = optional(
  "APP_SECRET",
  isProduction ? generatedProductionSecret : "local-dev-secret-change-me"
);
const publicAppUrl = optional("PUBLIC_APP_URL", "http://127.0.0.1:5175");

if (isProduction && !process.env.APP_SECRET) {
  console.warn(
    "[env] APP_SECRET is not set. Using an ephemeral startup secret; set APP_SECRET in Render for stable sessions and signatures."
  );
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }
  return parsed;
}

function integerFromEnv(name: string, fallback: number): number {
  const parsed = numberFromEnv(name, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be a whole number`);
  }
  return parsed;
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const parsed = integerFromEnv(name, fallback);
  if (parsed <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }
  return parsed;
}

function nonNegativeIntegerFromEnv(name: string, fallback: number): number {
  const parsed = integerFromEnv(name, fallback);
  if (parsed < 0) {
    throw new Error(`${name} must be 0 or greater`);
  }
  return parsed;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export const env = {
  appId: optional("APP_ID", "local-dev-app"),
  appSecret,
  chainSigningSecret: optional("CHAIN_SIGNING_SECRET", appSecret),
  legalOwnerName: optional("LEGAL_OWNER_NAME", "SRIYAN"),
  isProduction,
  host: optional("HOST", isProduction ? "0.0.0.0" : "127.0.0.1"),
  port: positiveIntegerFromEnv("PORT", 4000),
  databaseUrl: required("DATABASE_URL"),
  sriyanAuthUrl: optional("SRIYAN_AUTH_URL", publicAppUrl),
  sriyanOpenUrl: optional("SRIYAN_OPEN_URL", publicAppUrl),
  googleOauthClientId: optional("GOOGLE_OAUTH_CLIENT_ID"),
  googleOauthClientSecret: optional("GOOGLE_OAUTH_CLIENT_SECRET"),
  appleOauthClientId: optional("APPLE_OAUTH_CLIENT_ID"),
  appleOauthTeamId: optional("APPLE_OAUTH_TEAM_ID"),
  appleOauthKeyId: optional("APPLE_OAUTH_KEY_ID"),
  appleOauthPrivateKey: optional("APPLE_OAUTH_PRIVATE_KEY"),
  authEmailWebhookUrl: optional("AUTH_EMAIL_WEBHOOK_URL"),
  ownerUnionId: optional("OWNER_UNION_ID", "local-dev-user"),
  devAuthEnabled: booleanFromEnv("DEV_AUTH_ENABLED", false),
  bodyLimitBytes: positiveIntegerFromEnv("BODY_LIMIT_BYTES", 10 * 1024 * 1024),
  databaseConnectionLimit: positiveIntegerFromEnv(
    "DB_CONNECTION_LIMIT",
    isProduction ? 50 : 10
  ),
  databaseMaxIdle: positiveIntegerFromEnv(
    "DB_MAX_IDLE",
    isProduction ? 20 : 10
  ),
  databaseIdleTimeoutMs: positiveIntegerFromEnv("DB_IDLE_TIMEOUT_MS", 60_000),
  databaseQueueLimit: nonNegativeIntegerFromEnv(
    "DB_QUEUE_LIMIT",
    isProduction ? 2_000 : 0
  ),
  databaseConnectTimeoutMs: positiveIntegerFromEnv(
    "DB_CONNECT_TIMEOUT_MS",
    10_000
  ),
  redisUrl: optional("REDIS_URL"),
  redisRequired: process.env.REDIS_REQUIRED === "true" || isProduction,
  redisHealthTimeoutMs: positiveIntegerFromEnv(
    "REDIS_HEALTH_TIMEOUT_MS",
    2_000
  ),
  paymentGatewayProvider: optional("PAYMENT_GATEWAY_PROVIDER"),
  publicAppUrl,
  razorpayKeyId: optional("RAZORPAY_KEY_ID"),
  razorpayKeySecret: optional("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: optional("RAZORPAY_WEBHOOK_SECRET"),
  cashfreeClientId: optional("CASHFREE_CLIENT_ID"),
  cashfreeClientSecret: optional("CASHFREE_CLIENT_SECRET"),
  cashfreeWebhookSecret: optional("CASHFREE_WEBHOOK_SECRET"),
  cashfreeApiVersion: optional("CASHFREE_API_VERSION", "2025-01-01"),
  cashfreeEnvironment: optional("CASHFREE_ENVIRONMENT", "sandbox"),
  phonepeClientId: optional("PHONEPE_CLIENT_ID"),
  phonepeClientSecret: optional("PHONEPE_CLIENT_SECRET"),
  phonepeClientVersion: optional("PHONEPE_CLIENT_VERSION", "1"),
  phonepeEnvironment: optional("PHONEPE_ENVIRONMENT", "sandbox"),
  phonepeOauthUrl: optional("PHONEPE_OAUTH_URL"),
  phonepePayUrl: optional("PHONEPE_PAY_URL"),
  phonepeWebhookUsername: optional("PHONEPE_WEBHOOK_USERNAME"),
  phonepeWebhookPassword: optional("PHONEPE_WEBHOOK_PASSWORD"),
  phonepeWebhookSecret: optional("PHONEPE_WEBHOOK_SECRET"),
  routerIntegrationSecret: optional("ROUTER_INTEGRATION_SECRET", appSecret),
  routerRequireRequestSignature: booleanFromEnv(
    "ROUTER_REQUIRE_REQUEST_SIGNATURE",
    isProduction
  ),
  routerSignatureToleranceSeconds: positiveIntegerFromEnv(
    "ROUTER_SIGNATURE_TOLERANCE_SECONDS",
    300
  ),
  paymentConnectivityMaxSeconds: positiveIntegerFromEnv(
    "PAYMENT_CONNECTIVITY_MAX_SECONDS",
    300
  ),
  paymentConnectivityBandwidthMbps: positiveIntegerFromEnv(
    "PAYMENT_CONNECTIVITY_BANDWIDTH_MBPS",
    2
  ),
  paymentConnectivityAllowedHosts: listFromEnv(
    "PAYMENT_CONNECTIVITY_ALLOWED_HOSTS",
    []
  ),
  rateLimitWindowMs: positiveIntegerFromEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMaxRequests: nonNegativeIntegerFromEnv(
    "RATE_LIMIT_MAX_REQUESTS",
    isProduction ? 600 : 2_000
  ),
  realtimeMaxClients: positiveIntegerFromEnv(
    "REALTIME_MAX_CLIENTS",
    isProduction ? 5_000 : 500
  ),
  realtimeKeepAliveMs: positiveIntegerFromEnv("REALTIME_KEEPALIVE_MS", 25_000),
  ledgerLockTimeoutSeconds: positiveIntegerFromEnv(
    "LEDGER_LOCK_TIMEOUT_SECONDS",
    5
  ),
  frontendOrigins: listFromEnv("FRONTEND_ORIGIN", [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]),
  databaseMode:
    process.env.DATABASE_MODE === "planetscale"
      ? ("planetscale" as const)
      : ("default" as const),
};
