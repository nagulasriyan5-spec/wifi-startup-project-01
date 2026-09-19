import net from "net";
import { env } from "./env";

type RedisHealth = {
  configured: boolean;
  ok: boolean;
  required: boolean;
  latencyMs?: number;
  error?: string;
};

function encodeRespCommand(parts: string[]) {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function parseRedisUrl() {
  if (!env.redisUrl) return null;
  const url = new URL(env.redisUrl);
  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? url.pathname.slice(1) : undefined,
  };
}

async function redisRoundTrip(commands: string[]) {
  const target = parseRedisUrl();
  if (!target) {
    return {
      configured: false,
      ok: !env.redisRequired,
      required: env.redisRequired,
      error: env.redisRequired ? "REDIS_URL is required in this deployment." : undefined,
    } satisfies RedisHealth;
  }

  const startedAt = Date.now();

  return new Promise<RedisHealth>((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        configured: true,
        ok: false,
        required: env.redisRequired,
        error: "Redis health check timed out.",
      });
    }, env.redisHealthTimeoutMs);

    let settled = false;
    const settle = (health: RedisHealth) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(health);
    };

    socket.once("error", (error) => {
      settle({
        configured: true,
        ok: false,
        required: env.redisRequired,
        error: error.message,
      });
    });

    socket.once("connect", () => {
      const auth = target.password ? encodeRespCommand(["AUTH", target.password]) : "";
      const select = target.db ? encodeRespCommand(["SELECT", target.db]) : "";
      socket.write(`${auth}${select}${commands.join("")}`);
    });

    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (text.includes("-ERR") || text.includes("-NOAUTH")) {
        settle({
          configured: true,
          ok: false,
          required: env.redisRequired,
          latencyMs: Date.now() - startedAt,
          error: text.trim(),
        });
        return;
      }
      if (text.includes("+PONG")) {
        settle({
          configured: true,
          ok: true,
          required: env.redisRequired,
          latencyMs: Date.now() - startedAt,
        });
      }
    });
  });
}

export function getRedisStats() {
  return {
    configured: Boolean(env.redisUrl),
    required: env.redisRequired,
  };
}

export function checkRedisHealth() {
  return redisRoundTrip([encodeRespCommand(["PING"])]);
}
