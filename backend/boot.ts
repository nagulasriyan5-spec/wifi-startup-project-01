import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { rateLimit, getRateLimitStats } from "./lib/rate-limit";
import { createOAuthCallbackHandler } from "./sriyan/auth";
import { authHttpApp, oauthHttpApp } from "./auth-http";
import { handlePaymentWebhook } from "./payment-webhook";
import type { PaymentGatewayProvider } from "./lib/payment-gateways";
import { getPaymentGatewayRuntimeStatus } from "./lib/payment-gateways";
import { Paths } from "@contracts/constants";
import {
  canAcceptRealtimeClient,
  createRealtimeStream,
  getRealtimeStats,
} from "./realtime";
import { assertDbConnection, getDbPoolStats } from "./queries/connection";
import { routerIntegrationApp } from "./router-integration";
import { checkRedisHealth } from "./lib/redis";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("*", requestId());
app.use(bodyLimit({ maxSize: env.bodyLimitBytes }));
app.use(
  "/api/*",
  cors({
    origin: env.frontendOrigins,
    credentials: true,
  })
);
app.get("/api/health", async c =>
  c.json({
    ok: true,
    service: "sriyan-api",
    owner: env.legalOwnerName,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    databasePool: getDbPoolStats(),
    realtime: getRealtimeStats(),
    rateLimit: getRateLimitStats(),
    redis: await checkRedisHealth(),
    paymentGateway: getPaymentGatewayRuntimeStatus(),
    ts: Date.now(),
  })
);
app.get("/api/ready", async c => {
  try {
    const redis = await checkRedisHealth();
    const paymentGateway = getPaymentGatewayRuntimeStatus();
    if (!redis.ok && redis.required) {
      return c.json(
        {
          ok: false,
          service: "sriyan-api",
          database: "mysql",
          redis,
          error: redis.error ?? "Redis is unavailable",
          ts: Date.now(),
        },
        503
      );
    }
    if (env.isProduction) {
      const activeProvider = paymentGateway.activeProvider;
      if (!activeProvider || !paymentGateway.configured[activeProvider]) {
        return c.json(
          {
            ok: false,
            service: "sriyan-api",
            database: "mysql",
            redis,
            paymentGateway,
            error: activeProvider
              ? `${activeProvider} payment gateway is not fully configured`
              : "PAYMENT_GATEWAY_PROVIDER must be razorpay, phonepe, or cashfree",
            ts: Date.now(),
          },
          503
        );
      }
    }
    await assertDbConnection();
    return c.json({
      ok: true,
      service: "sriyan-api",
      owner: env.legalOwnerName,
      database: "mysql",
      redis,
      paymentGateway,
      realtime: getRealtimeStats(),
      ts: Date.now(),
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        service: "sriyan-api",
        database: "unavailable",
        error:
          error instanceof Error ? error.message : "Unknown database error",
        ts: Date.now(),
      },
      503
    );
  }
});
app.get("/api/metrics", async c => {
  const realtime = getRealtimeStats();
  const dbPool = getDbPoolStats();
  const rateLimit = getRateLimitStats();
  const redis = await checkRedisHealth();
  const lines = [
    "# HELP sriyan_process_uptime_seconds Node process uptime.",
    "# TYPE sriyan_process_uptime_seconds gauge",
    `sriyan_process_uptime_seconds ${Math.round(process.uptime())}`,
    "# HELP sriyan_realtime_clients Connected realtime clients.",
    "# TYPE sriyan_realtime_clients gauge",
    `sriyan_realtime_clients ${realtime.clients}`,
    "# HELP sriyan_rate_limit_tracked_clients In-memory tracked rate-limit clients.",
    "# TYPE sriyan_rate_limit_tracked_clients gauge",
    `sriyan_rate_limit_tracked_clients ${rateLimit.trackedClients}`,
    "# HELP sriyan_database_pool_connections MySQL pool connection count.",
    "# TYPE sriyan_database_pool_connections gauge",
    `sriyan_database_pool_connections ${dbPool.totalConnections ?? 0}`,
    "# HELP sriyan_redis_up Redis health status.",
    "# TYPE sriyan_redis_up gauge",
    `sriyan_redis_up ${redis.ok ? 1 : 0}`,
    "# HELP sriyan_redis_latency_ms Redis PING latency.",
    "# TYPE sriyan_redis_latency_ms gauge",
    `sriyan_redis_latency_ms ${redis.latencyMs ?? 0}`,
  ];
  return c.text(`${lines.join("\n")}\n`, 200, {
    "Content-Type": "text/plain; version=0.0.4",
  });
});
app.use(
  "/api/*",
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    maxRequests: env.rateLimitMaxRequests,
  })
);
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.route("/api/auth", authHttpApp);
app.route("/api/oauth", oauthHttpApp);
app.get("/api/realtime", c => {
  if (!canAcceptRealtimeClient()) {
    c.header("Retry-After", "5");
    return c.json(
      {
        error: "Realtime capacity reached",
        realtime: getRealtimeStats(),
      },
      503
    );
  }

  return c.body(createRealtimeStream(), 200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
});
app.post("/api/webhooks/payments/:provider", async c => {
  const provider = c.req.param("provider") as PaymentGatewayProvider;
  if (!["razorpay", "phonepe", "cashfree"].includes(provider)) {
    return c.json({ error: "Unsupported payment provider" }, 400);
  }

  try {
    const rawBody = await c.req.text();
    const result = await handlePaymentWebhook(
      provider,
      rawBody,
      c.req.raw.headers
    );
    return c.json(result);
  } catch (error) {
    console.error("[payment-webhook] Failed to process webhook", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Payment webhook failed",
      },
      400
    );
  }
});
app.route("/api/router", routerIntegrationApp);
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", c => c.json({ error: "Not Found" }, 404));

export default app;
