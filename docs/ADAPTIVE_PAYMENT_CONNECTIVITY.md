# Adaptive Payment Connectivity Architecture

Founder CEO and copyright holder: SRIYAN.

This is an additive platform layer on top of the current Sriyan WiFi app. It does not replace the existing dashboard, ticket flow, or payment screens. It adds the infrastructure direction from the CTO brief: connectivity exists only to complete a payment, never to provide public internet.

## 1. Problem

Merchants lose successful UPI/payment conversion when mobile networks are weak, congested, underground, or unreliable. Fake screenshots and delayed confirmations create dispute risk.

## 2. Current Solution

The app already supports QR/OTP WiFi tickets, real gateway orders, signed webhooks, MikroTik/OpenWrt/FreeRADIUS integration, PM-WANI tracking, Redis readiness, and production monitoring.

## 3. Why Current Solution Fails

A normal hotspot can become free internet if it is not tightly controlled. A normal payment QR is not always linked to a short-lived network session. If payment succeeds but connectivity stays open, the platform becomes a WiFi product, which violates the mission.

## 4. Our Innovation

Payment connectivity is adaptive and payment-only:

- If mobile data is sufficient, use mobile and open no connectivity.
- If mobile data is weak, create a temporary payment-connectivity session.
- The session has a random public id and secret token.
- A gateway payment can be cryptographically bound to that exact session.
- Controllers receive only payment provider/app allowlists.
- After webhook verification, the session is destroyed.

## 5. Technical Feasibility

This is feasible on router-controlled networks using MikroTik, OpenWrt, FreeRADIUS, or a signed controller agent. Browsers cannot force the phone to join WiFi or restrict all traffic by themselves. Android and iOS also do not allow a web app to silently change WiFi networks or intercept UPI apps. The practical solution is router/controller enforcement plus a normal browser or PWA checkout.

## 6. Architecture

```mermaid
flowchart LR
  Customer[Customer Phone] --> Assess[Connectivity Assessment]
  Assess -->|Mobile OK| MobilePay[Use Mobile Payment]
  Assess -->|Mobile Weak| PCS[Payment Connectivity Session]
  PCS --> Router[MikroTik / OpenWrt / FreeRADIUS]
  Router --> Allowlist[Payment-only DNS/host allowlist]
  PCS --> Gateway[Razorpay / PhonePe / Cashfree]
  Gateway --> Webhook[Signed Webhook]
  Webhook --> Verify[Verify Payment]
  Verify --> Destroy[Destroy Connectivity Session]
  Verify --> Notify[Notify Merchant]
```

## 7. Security

- Session token is returned once and stored only as an HMAC hash.
- Router API supports shared-secret auth and production HMAC request signatures.
- Signature payload is `timestamp.method.path.rawBody`.
- Gateway callbacks are verified by provider signatures or auth headers.
- Payment completion validates provider, transaction id, and gateway order id.
- Payment connectivity sessions expire automatically.
- Router response declares `publicInternetAllowed: false`.
- Controllers receive an allowlist of payment domains, not unrestricted access.

## 8. Scalability

The model is stateless at the app tier. MySQL stores sessions/payments. Redis is already health-gated for production and can later hold distributed locks, short TTL session lookups, or queue coordination. The table indexes support lookup by public id, merchant/status, branch/status, payment id, and expiry.

## 9. Failure Cases

- Mobile is actually sufficient: no connectivity should be opened.
- Gateway order creation fails: payment and connectivity session are marked failed.
- Webhook is delayed: session expires automatically.
- Webhook succeeds after expiry: payment is still verified, and any matching session is destroyed idempotently.
- Router sends stale token: authorization rejects.
- Device identity changes: authorization rejects when the session was bound to a different fingerprint/MAC.
- Controller cannot sign requests: use a local signing proxy/agent or disable strict signing only for a trusted private test network.

## 10. Recovery

- Re-run assessment and create a new session for a failed checkout.
- Use provider reconciliation reports for pending/late payments.
- Use `/api/ready` to fail production rollout when Redis/MySQL/gateway config is incomplete.
- Use `/api/metrics` and realtime events to detect stuck pending sessions.

## 11. Future Improvements

- Redis-backed session TTL cache.
- Automated reconciliation workers for Razorpay, PhonePe, and Cashfree.
- Native Android companion app for smoother WiFi handoff where permitted.
- Controller-side DNS enforcement profiles per gateway.
- Kubernetes manifests and AWS reference deployment.
- Grafana dashboard for failed payment zones, latency, and gateway reachability.

## 12. Android And iOS Reality

Android and iOS do not allow a website to silently connect to WiFi, change network routing, or restrict traffic to payment apps. A PWA can measure approximate network quality and launch web checkout, but router-level enforcement requires router/controller configuration or a native companion app with user-approved permissions.

## API Specification

### tRPC

- `connectivity.assess`
  - Public.
  - Input: gateway reachability, payment app reachability, latency, downlink, effective network type, optional force flag.
  - Output: `use_mobile`, `offer_payment_connectivity`, or `force_payment_connectivity`.

- `connectivity.createSession`
  - Merchant authenticated.
  - Creates a short-lived payment-connectivity session.
  - Returns `publicId`, one-time `token`, expiry, allowed payment hosts, and assessment.

- `connectivity.getSession`
  - Public tokenized lookup.
  - Requires `publicId` and `token`.

- `connectivity.createPayment`
  - Public tokenized payment creation.
  - Creates a real Razorpay, PhonePe, or Cashfree order bound to the session.

### Router API

All routes require `Authorization: Bearer ROUTER_INTEGRATION_SECRET` or `X-Router-Secret`.

When `ROUTER_REQUIRE_REQUEST_SIGNATURE=true`, also send:

```text
X-Sriyan-Timestamp: <epoch milliseconds>
X-Sriyan-Signature: v1=<hmac-sha256(timestamp.method.path.rawBody)>
```

- `POST /api/router/payment-connectivity/authorize`
  - Input: `publicId`/`connectivitySessionId`, `token`, optional router id and device identity.
  - Output: accept/reject, session timeout, rate limit, `Filter-Id=sriyan-payment-only`, `Class`, and `allowedHosts`.

- `POST /api/router/payment-connectivity/accounting`
  - Input: `sessionId` or RADIUS `Class`, plus status.
  - Output: updated status.

## ER Diagram

```mermaid
erDiagram
  merchants ||--o{ payment_connectivity_sessions : owns
  branches ||--o{ payment_connectivity_sessions : hosts
  payments ||--o| payment_connectivity_sessions : binds
  payment_connectivity_sessions {
    bigint id
    string publicId
    bigint merchantId
    bigint branchId
    bigint paymentId
    string sessionTokenHash
    string status
    string networkDecision
    decimal amount
    string currency
    json allowedHosts
    datetime expiresAt
  }
```
