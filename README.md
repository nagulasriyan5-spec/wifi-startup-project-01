# Sriyan WiFi

Realtime UPI token WiFi app with user and merchant flows, QR/OTP access, Razorpay/PhonePe/Cashfree payments, router WiFi and phone hotspot modes, MikroTik/OpenWrt/FreeRADIUS controller integration, installable mobile PWA, PM-WANI compliance tracking, Redis health checks, production monitoring, and audit ledger.

Founder CEO and copyright holder: **SRIYAN**.

## Project Layout

- `frontend/` - React + Vite app
- `backend/` - Hono + tRPC API and realtime SSE server
- `database/` - Drizzle MySQL schema, seed script, and local MySQL Docker Compose file
- `contracts/` - Shared constants/types

## Local Setup

1. Install packages:

   ```bash
   npm install
   ```

2. Create `.env` from the example:

   ```bash
   copy .env.example .env
   ```

3. Start MySQL.

   On Windows with MySQL Server 8 installed, the easiest local path is:

   ```bash
   npm run mysql:start
   ```

   This starts an app-only MySQL instance on `127.0.0.1:3307` using `local-mysql-data/` and creates the `sriyan` database/user from `.env`.

   With Docker:

   ```bash
   docker compose -f database/docker-compose.yml up -d
   ```

   Without Docker or the helper script, create a MySQL database yourself and update `DATABASE_URL` in `.env`.

4. Push schema and seed local merchant data:

   ```bash
   npm run db:push
   npm run db:seed
   ```

   Or run the complete local database setup:

   ```bash
   npm run db:setup
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

   This starts two separate local servers:

   - Backend API: `http://127.0.0.1:4000`
   - Frontend app: `http://127.0.0.1:5175`

   Open `http://127.0.0.1:5175/`.

   To run them separately, use `npm run dev:backend` and `npm run dev:frontend`.

## Useful URLs

- Merchant dashboard: `http://127.0.0.1:5175/dashboard`
- Customer connect portal: `http://127.0.0.1:5175/connect`
- Payment flow: `http://127.0.0.1:5175/payment`
- Audit ledger: `http://127.0.0.1:5175/blockchain`
- Backend health check: `http://127.0.0.1:4000/api/health`
- Backend readiness check: `http://127.0.0.1:4000/api/ready`
- Prometheus metrics: `http://127.0.0.1:4000/api/metrics`
- Realtime stream: `http://127.0.0.1:5175/api/realtime`

## Real Payments

Payments are gateway-backed only. There is no local paid button or mock success path.

Set one provider in `.env`:

```bash
PAYMENT_GATEWAY_PROVIDER=razorpay
```

Then configure the matching keys and webhook secret for Razorpay, PhonePe, or Cashfree. Webhooks must point to:

```text
https://your-domain.com/api/webhooks/payments/razorpay
https://your-domain.com/api/webhooks/payments/phonepe
https://your-domain.com/api/webhooks/payments/cashfree
```

In production, `/api/ready` returns `503` until Redis, MySQL, and the selected payment gateway are configured.

## Adaptive Payment Connectivity

The payment-connectivity layer is added without changing the current app screens. It creates short-lived, tokenized, payment-only sessions when mobile data is weak, keeps customers on mobile when mobile is good enough, and destroys connectivity after verified payment. See [docs/ADAPTIVE_PAYMENT_CONNECTIVITY.md](./docs/ADAPTIVE_PAYMENT_CONNECTIVITY.md).

## Router Integration

The app validates QR/OTP tickets and creates live sessions in realtime. Merchants can choose router/controller type per branch: MikroTik, OpenWrt, FreeRADIUS, cloud agent, or manual.

Controller APIs:

- `GET /api/router/config/:branchId`
- `POST /api/router/authorize`
- `POST /api/router/accounting`

Send `Authorization: Bearer ROUTER_INTEGRATION_SECRET` from controllers or FreeRADIUS. The authorize response includes standard RADIUS reply attributes such as `Session-Timeout`, `Mikrotik-Rate-Limit`, WISPr bandwidth limits, and `Class` for accounting correlation.

Router deployment examples are in `deploy/router/`:

- `freeradius-rlm-rest.conf`
- `mikrotik-hotspot-radius.rsc`
- `openwrt-coovachilli.conf`

A normal browser cannot directly enforce network-layer internet access. For automatic access, connect MikroTik/OpenWrt/FreeRADIUS or a trusted native companion app to the router APIs above.

## Mobile App

The frontend is an installable PWA with a web manifest, service worker, offline fallback, and mobile app metadata. Deploy over HTTPS, then install it from Chrome/Edge/Android or Safari/iOS using the browser's install/add-to-home-screen action.

## PM-WANI

The merchant dashboard includes a Compliance tab for PDO/aggregator/app-provider applicability, registration references, KYC, public office details, security/contact details, data-retention notes, audit readiness, and an operational checklist. PM-WANI obligations depend on your actual role and geography, so keep legal/compliance review in the deployment process.

After pulling schema changes for merchant UPI accounts or gateway modes, run:

```bash
npm run db:push
```

## Checks

```bash
npm run check
npm run lint
npm test
npm run build
```

## Production Deployment

Use [DEPLOYMENT.md](./DEPLOYMENT.md) for the ready-to-deploy Docker/Nginx/MySQL production stack, scaling notes for 10,000 to 50,000 users, and tamper-proof ledger operations.

```bash
copy .env.production.example .env.production
npm run deploy:prod
docker compose -f deploy/docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f deploy/docker-compose.prod.yml up -d --scale app=4
```

Copyright 2026 Sriyan. Founder CEO: **SRIYAN**. All rights reserved.
