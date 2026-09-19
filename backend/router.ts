import { authRouter } from "./auth-router";
import { merchantRouter } from "./merchant-router";
import { ticketRouter } from "./ticket-router";
import { paymentRouter } from "./payment-router";
import { analyticsRouter } from "./analytics-router";
import { blockchainRouter } from "./blockchain-router";
import { complianceRouter } from "./compliance-router";
import { connectivityRouter } from "./connectivity-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  merchant: merchantRouter,
  ticket: ticketRouter,
  payment: paymentRouter,
  analytics: analyticsRouter,
  blockchain: blockchainRouter,
  compliance: complianceRouter,
  connectivity: connectivityRouter,
});

export type AppRouter = typeof appRouter;
