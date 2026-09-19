import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let pool: Pool | undefined;
let instance: ReturnType<typeof drizzle<typeof fullSchema>> | undefined;

export function getMysqlPool() {
  if (!pool) {
    pool = createPool({
      uri: env.databaseUrl,
      waitForConnections: true,
      connectionLimit: env.databaseConnectionLimit,
      maxIdle: env.databaseMaxIdle,
      idleTimeout: env.databaseIdleTimeoutMs,
      queueLimit: env.databaseQueueLimit,
      connectTimeout: env.databaseConnectTimeoutMs,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      supportBigNumbers: true,
    });
  }
  return pool;
}

export function getDb() {
  if (!instance) {
    instance = drizzle(getMysqlPool(), {
      mode: env.databaseMode,
      schema: fullSchema,
    });
  }
  return instance;
}

export async function assertDbConnection() {
  await getMysqlPool().promise().query("SELECT 1");
}

export function getDbPoolStats() {
  const currentPool = getMysqlPool() as Pool & {
    _allConnections?: unknown[];
    _freeConnections?: unknown[];
    _connectionQueue?: unknown[];
  };

  return {
    connectionLimit: env.databaseConnectionLimit,
    maxIdle: env.databaseMaxIdle,
    queueLimit: env.databaseQueueLimit,
    totalConnections: currentPool._allConnections?.length ?? null,
    freeConnections: currentPool._freeConnections?.length ?? null,
    queuedRequests: currentPool._connectionQueue?.length ?? null,
  };
}

export async function closeDbPool() {
  if (!pool) return;
  const poolToClose = pool;
  pool = undefined;
  instance = undefined;
  await poolToClose.promise().end();
}
