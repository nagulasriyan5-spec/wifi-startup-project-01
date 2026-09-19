import { env } from "./lib/env";

export type RealtimeTopic =
  | "system"
  | "merchant"
  | "ticket"
  | "session"
  | "connectivity"
  | "payment"
  | "blockchain";

export type RealtimeEvent = {
  topic: RealtimeTopic;
  action: string;
  merchantId?: number;
  entityId?: number;
  data?: unknown;
  ts: number;
};

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const keepAliveTimers = new Map<
  ReadableStreamDefaultController<Uint8Array>,
  ReturnType<typeof setInterval>
>();

function formatEvent(event: RealtimeEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function removeClient(controller: ReadableStreamDefaultController<Uint8Array>) {
  clients.delete(controller);
  const timer = keepAliveTimers.get(controller);
  if (timer) clearInterval(timer);
  keepAliveTimers.delete(controller);
}

export function canAcceptRealtimeClient() {
  return clients.size < env.realtimeMaxClients;
}

export function getRealtimeStats() {
  return {
    clients: clients.size,
    maxClients: env.realtimeMaxClients,
    keepAliveMs: env.realtimeKeepAliveMs,
  };
}

export function publishRealtimeEvent(event: Omit<RealtimeEvent, "ts">) {
  const payload: RealtimeEvent = { ...event, ts: Date.now() };

  for (const controller of [...clients]) {
    try {
      controller.enqueue(formatEvent(payload));
    } catch {
      removeClient(controller);
    }
  }
}

export function createRealtimeStream() {
  let activeController: ReadableStreamDefaultController<Uint8Array> | null =
    null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (!canAcceptRealtimeClient()) {
        controller.enqueue(
          formatEvent({
            topic: "system",
            action: "overloaded",
            ts: Date.now(),
            data: { maxClients: env.realtimeMaxClients },
          }),
        );
        controller.close();
        return;
      }

      activeController = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      controller.enqueue(
        formatEvent({ topic: "system", action: "connected", ts: Date.now() }),
      );

      const timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          removeClient(controller);
        }
      }, env.realtimeKeepAliveMs);

      keepAliveTimers.set(controller, timer);
    },
    cancel() {
      if (activeController) removeClient(activeController);
    },
  });
}
