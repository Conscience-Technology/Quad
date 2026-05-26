/**
 * SDK key authentication for the public ingest endpoints. Verifies the
 * `x-quad-key` header, looks up the matching project, enforces origin
 * allowlist, and applies a simple in-memory rate limit.
 */
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "~/db";
import { hashApiKey } from "./api-key";

export type AuthedSdkRequest = {
  project: typeof schema.projects.$inferSelect;
  apiKey: typeof schema.apiKeys.$inferSelect;
  origin: string | null;
};

const KEY_HEADER = "x-quad-key";

/** Cheap per-key per-IP token bucket. Resets every minute. */
const RATE_BUCKET: Map<string, { count: number; resetAt: number }> = new Map();
const LIMIT_PER_MIN = 240;

function rateLimit(bucketKey: string): boolean {
  const now = Date.now();
  const cur = RATE_BUCKET.get(bucketKey);
  if (!cur || cur.resetAt < now) {
    RATE_BUCKET.set(bucketKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  cur.count += 1;
  if (cur.count > LIMIT_PER_MIN) return false;
  return true;
}

export type SdkAuthError = { error: string; status: number };

export async function authSdkRequest(req: Request): Promise<
  | { ok: true; auth: AuthedSdkRequest }
  | { ok: false; err: SdkAuthError }
> {
  const key = req.headers.get(KEY_HEADER);
  if (!key) return fail(401, "missing api key");

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const hash = hashApiKey(key);
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.keyHash, hash),
        eq(schema.apiKeys.scope, "sdk"),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .limit(1);
  const apiKey = rows[0];
  if (!apiKey || !apiKey.projectId) return fail(401, "invalid api key");

  const proj = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, apiKey.projectId))
    .limit(1);
  const project = proj[0];
  if (!project) return fail(401, "project missing");

  // Origin allowlist (empty list = allow all, useful for dev / Capture Helper).
  if (project.allowedOrigins.length > 0) {
    const candidate = origin ?? (referer ? new URL(referer).origin : null);
    if (!candidate || !project.allowedOrigins.includes(candidate)) {
      return fail(403, "origin not allowed");
    }
  }

  if (!rateLimit(`${apiKey.id}:${ip}`)) return fail(429, "rate limit");

  // last_used_at refresh, fire-and-forget.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, apiKey.id));

  return { ok: true, auth: { project, apiKey, origin } };
}

function fail(status: number, error: string) {
  return { ok: false as const, err: { status, error } };
}

/** Common CORS headers for ingest endpoints, scoped to the project's allowed
 * origins. Falls back to `*` for empty allowlists (dev convenience). */
export function corsHeaders(req: Request, allowed: string[]): HeadersInit {
  const origin = req.headers.get("origin");
  const allow =
    allowed.length === 0
      ? "*"
      : origin && allowed.includes(origin)
        ? origin
        : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, x-quad-key, x-quad-sdk-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function withCors(req: Request, allowed: string[], res: NextResponse): NextResponse {
  const h = corsHeaders(req, allowed);
  for (const [k, v] of Object.entries(h)) res.headers.set(k, String(v));
  return res;
}
