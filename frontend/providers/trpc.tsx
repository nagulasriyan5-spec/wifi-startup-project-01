import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../backend/router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "react-router";

export const trpc = createTRPCReact<AppRouter>();

const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl("/api/trpc"),
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

type RealtimeEvent = {
  topic: "system" | "merchant" | "ticket" | "session" | "connectivity" | "payment" | "blockchain";
  action: string;
  merchantId?: number;
  entityId?: number;
  data?: unknown;
  ts: number;
};

function RealtimeBridge() {
  const utils = trpc.useUtils();
  const location = useLocation();
  const realtimeEnabled =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/blockchain");

  useEffect(() => {
    if (!realtimeEnabled) return;

    const source = new EventSource(apiUrl("/api/realtime"), {
      withCredentials: true,
    });
    const pendingMerchantIds = new Set<number>();
    let pendingGlobal = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flushInvalidations = () => {
      flushTimer = undefined;

      void utils.merchant.dashboard.invalidate();
      void utils.merchant.publicDefault.invalidate();
      void utils.blockchain.list.invalidate();
      void utils.blockchain.stats.invalidate();

      for (const merchantId of pendingMerchantIds) {
        const input = { merchantId };
        void utils.ticket.list.invalidate();
        void utils.ticket.recent.invalidate({ ...input, limit: 10 });
        void utils.ticket.stats.invalidate(input);
        void utils.ticket.sessions.invalidate();
        void utils.payment.list.invalidate();
        void utils.payment.recent.invalidate({ ...input, limit: 10 });
        void utils.payment.stats.invalidate(input);
        void utils.payment.dailyRevenue.invalidate({ ...input, days: 7 });
        void utils.analytics.kpis.invalidate(input);
        void utils.analytics.peakHours.invalidate(input);
        void utils.analytics.getByMerchant.invalidate({ ...input, days: 30 });
      }

      if (pendingGlobal) {
        void utils.ticket.list.invalidate();
        void utils.ticket.recent.invalidate();
        void utils.ticket.stats.invalidate();
        void utils.ticket.sessions.invalidate();
        void utils.payment.list.invalidate();
        void utils.payment.recent.invalidate();
        void utils.payment.stats.invalidate();
        void utils.payment.dailyRevenue.invalidate();
        void utils.analytics.kpis.invalidate();
        void utils.analytics.peakHours.invalidate();
        void utils.analytics.getByMerchant.invalidate();
      }

      pendingMerchantIds.clear();
      pendingGlobal = false;
    };

    const scheduleInvalidations = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flushInvalidations, 350);
    };

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;

      if (event.topic === "system") return;
      if (event.merchantId) pendingMerchantIds.add(event.merchantId);
      else pendingGlobal = true;

      scheduleInvalidations();
    };

    source.onerror = () => {
      // EventSource reconnects automatically.
    };

    return () => {
      source.close();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [realtimeEnabled, utils]);

  return null;
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RealtimeBridge />
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
