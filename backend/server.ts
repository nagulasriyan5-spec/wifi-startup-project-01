import { serve } from "@hono/node-server";
import app from "./boot";
import { assertDbConnection, closeDbPool } from "./queries/connection";
import { env } from "./lib/env";

if (env.isProduction) {
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
}

try {
  await assertDbConnection();
  console.log("[api] MySQL connection ready");
} catch (error) {
  console.error("[api] MySQL connection failed");
  console.error(error);
  console.error(
    "[api] Check DATABASE_URL and run `npm run db:setup` before starting the app.",
  );
  process.exit(1);
}

const server = serve({ fetch: app.fetch, hostname: env.host, port: env.port }, () => {
  console.log(`[api] Server running on http://${env.host}:${env.port}`);
});

if ("keepAliveTimeout" in server) {
  server.keepAliveTimeout = 65_000;
}
if ("headersTimeout" in server) {
  server.headersTimeout = 66_000;
}

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);

  const forceExitTimer = setTimeout(() => {
    console.error("[api] Forced shutdown after timeout");
    process.exit(1);
  }, 30_000);
  forceExitTimer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await closeDbPool();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error("[api] Shutdown failed");
    console.error(error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
