# Sriyan WiFi Production Deployment

Founder CEO and copyright holder: **SRIYAN**.

This app is prepared for a large production deployment with:

- React/Vite frontend served by the production Node server
- Hono/tRPC backend with configurable MySQL pooling, rate limiting, health checks, and graceful shutdown
- Real Razorpay, PhonePe, or Cashfree payment gateway orders plus signed webhook settlement
- MikroTik/OpenWrt/FreeRADIUS router integration endpoints for authorization and accounting
- MySQL 8.4 with production indexes and a tuned config
- Redis health gating for production readiness
- Nginx reverse proxy/load balancer for edge limits, compression, forwarded headers, and SSE support
- Prometheus metrics endpoint and optional monitoring profile
- Installable mobile PWA assets for phone-first operators and customers
- PM-WANI compliance tracking for applicable Indian public WiFi deployments
- Blockchain-style audit ledger with ordered writes, previous-hash chaining, payload hashes, and HMAC chain signatures

## Production Topology

For 10,000 to 50,000 users, run at least:

- 2 to 8 app containers behind Nginx
- 1 dedicated MySQL server with SSD/NVMe storage
- 1 Redis instance for production readiness and future shared coordination
- 4 CPU / 8 GB RAM minimum for a small production node
- 8 to 16 CPU / 16 to 32 GB RAM for higher traffic
- Daily database backups and off-server backup storage

The app service is stateless except for in-memory realtime streams. MySQL is the system of record.

## First Deploy

1. Install Docker and Docker Compose on the server.

2. Copy the production env template:

   ```bash
   cp .env.production.example .env.production
   ```

3. Edit `.env.production` and replace every `change-this-*`, domain, payment, router, and OAuth value. Keep:

   ```bash
   LEGAL_OWNER_NAME=SRIYAN
   NODE_ENV=production
   DEV_AUTH_ENABLED=false
   HOST=0.0.0.0
   ```

   Set exactly one gateway:

   ```bash
   PAYMENT_GATEWAY_PROVIDER=razorpay
   # or phonepe / cashfree
   ```

   Configure the matching gateway secrets and webhook URL:

   ```text
   https://your-domain.com/api/webhooks/payments/razorpay
   https://your-domain.com/api/webhooks/payments/phonepe
   https://your-domain.com/api/webhooks/payments/cashfree
   ```

4. Build and start the stack:

   ```bash
   npm run deploy:prod
   ```

5. Push the database schema:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml --profile tools run --rm migrate
   ```

6. Confirm health:

   ```bash
   curl http://127.0.0.1/api/health
   curl http://127.0.0.1/api/ready
   ```

   In production, readiness fails until MySQL, Redis, and the selected payment gateway are configured.

7. Optional: start Prometheus monitoring:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml --profile monitoring up -d prometheus
   ```

## Scaling App Servers

Start with 4 backend containers:

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --scale app=4
```

Increase `app` replicas when CPU is high or request latency rises. Increase `DB_CONNECTION_LIMIT` carefully. The total possible MySQL connections is:

```text
app replicas * DB_CONNECTION_LIMIT
```

Keep that below MySQL `max_connections` with room for admin and migration connections.

## Suggested Capacity Settings

For a 4-replica app tier:

```bash
DB_CONNECTION_LIMIT=50
DB_MAX_IDLE=20
DB_QUEUE_LIMIT=2000
RATE_LIMIT_MAX_REQUESTS=600
REALTIME_MAX_CLIENTS=5000
REDIS_REQUIRED=true
```

This supports large traffic bursts better than one oversized Node process. For 50,000 active users, add more app replicas and use a managed MySQL-compatible database or a dedicated database server.

## Blockchain / Tamper Protection

Every new ledger row includes:

- `previousHash`
- `payloadHash`
- `transactionHash`
- `chainSignature`
- `nonce`
- `blockNumber`

Ledger writes use a MySQL advisory lock so concurrent backend replicas append in one ordered sequence. The `/api/trpc/blockchain.verify` procedure checks chain links, payload hashes, transaction hashes, and signatures for the latest verification window.

Use a strong `CHAIN_SIGNING_SECRET`. Changing it later means old signed rows cannot be re-verified with the new secret.

## Operational Checklist

- Set real `APP_SECRET` and `CHAIN_SIGNING_SECRET`.
- Set `FRONTEND_ORIGIN` to the real HTTPS domain.
- Set `PUBLIC_APP_URL` to the real HTTPS domain.
- Configure one payment gateway and validate signed webhooks before going live.
- Set `ROUTER_INTEGRATION_SECRET` and rotate it if a router config is exposed.
- Keep `ROUTER_REQUIRE_REQUEST_SIGNATURE=true` in production. Use `deploy/router/sriyan-signing-proxy.mjs` when FreeRADIUS cannot sign requests directly.
- Use adaptive payment connectivity only for weak mobile network cases; do not open payment connectivity when mobile is sufficient.
- Configure MikroTik/OpenWrt through FreeRADIUS or a trusted controller using `deploy/router/`.
- Run `npm run db:push` or migrations after schema changes.
- Put TLS in front of Nginx with a cloud load balancer or Certbot-managed proxy.
- Run `npm run check` and `npm run build` before every deployment.
- Back up MySQL daily.
- Monitor `/api/health`, `/api/ready`, and `/api/metrics` for database pool, Redis, gateway configuration, and realtime client pressure.
- Watch MySQL slow query logs.
- Complete the dashboard PM-WANI checklist for applicable public WiFi deployments.
- Keep `DEV_AUTH_ENABLED=false` in production.

## Ownership

Copyright 2026 Sriyan. Founder CEO: **SRIYAN**. All rights reserved.
