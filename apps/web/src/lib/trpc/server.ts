/**
 * Server-side tRPC caller for use from server components / route handlers.
 * Builds a per-request context without going through HTTP.
 */
import "server-only";
import { headers } from "next/headers";
import { db } from "~/db";
import { getCurrentUser } from "~/lib/auth/current-user";
import { appRouter } from "~/server/routers/_app";

export async function serverTrpc() {
  const [user, hdrs] = await Promise.all([getCurrentUser(), headers()]);
  return appRouter.createCaller({ user, db, headers: hdrs });
}
