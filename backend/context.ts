import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./sriyan/auth";
import { env } from "./lib/env";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  authError?: string;
};

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Local authentication failed";

  if (
    error.message.includes("Failed query") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("Access denied") ||
    error.message.includes("Unknown database")
  ) {
    return "Database is not ready. Check DATABASE_URL, then run `npm run db:setup`.";
  }

  return error.message;
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch (error) {
    if (!env.isProduction && env.devAuthEnabled) {
      ctx.authError = getAuthErrorMessage(error);
    }
    // Authentication is optional here
  }
  return ctx;
}
