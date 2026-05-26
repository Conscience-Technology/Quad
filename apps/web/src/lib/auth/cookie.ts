/**
 * Glue between the SESSION cookie helpers and Next's cookies() API.
 * Server-only — never imported into client bundles.
 */
import "server-only";
import { cookies } from "next/headers";
import { env } from "~/lib/env";
import { SESSION, issueSession, verifySession } from "./session";

const isProd = () => env().NODE_ENV === "production";

export async function setSessionCookie(userId: string): Promise<void> {
  const value = issueSession(userId);
  const store = await cookies();
  store.set(SESSION.COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION.TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION.COOKIE_NAME);
}

export async function readSession(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const raw = store.get(SESSION.COOKIE_NAME)?.value;
  const payload = verifySession(raw);
  return payload ? { userId: payload.uid } : null;
}
