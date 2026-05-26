/**
 * HMAC-signed cookie sessions. No DB session table — the cookie itself is the
 * session. Rotating SESSION_SECRET invalidates every session at once.
 *
 * Cookie payload (base64url): `${payloadB64}.${sigB64}`
 *   payload = { uid: string, iat: number (ms), exp: number (ms) }
 *   sig     = HMAC-SHA256(SESSION_SECRET, payloadB64)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "~/lib/env";

const COOKIE_NAME = "quad_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type SessionPayload = {
  uid: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string): string {
  const sig = createHmac("sha256", env().SESSION_SECRET)
    .update(payloadB64)
    .digest();
  return b64urlEncode(sig);
}

export function issueSession(userId: string, now = Date.now()): string {
  const payload: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + TTL_MS,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySession(
  cookie: string | undefined,
  now = Date.now(),
): SessionPayload | null {
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  if (dot < 1 || dot >= cookie.length - 1) return null;
  const payloadB64 = cookie.slice(0, dot);
  const sigB64 = cookie.slice(dot + 1);
  const expected = sign(payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp <= now) return null;
  return payload;
}

export const SESSION = {
  COOKIE_NAME,
  TTL_MS,
} as const;
