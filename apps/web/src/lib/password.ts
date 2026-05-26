/**
 * argon2id wrapper. @node-rs/argon2 = pure Rust binding, fast, no native build
 * step on the user's machine (prebuilt binaries per platform). OWASP-aligned
 * defaults; cost = ~50ms on a modern laptop.
 */
import { hash, verify } from "@node-rs/argon2";

// algorithm default in @node-rs/argon2 is Argon2id; we keep cost params explicit.
const OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_LENGTH = 12;

const COMMON_PATTERNS = [
  /^password/i,
  /^12345/,
  /^qwerty/i,
  /^letmein/i,
  /^abc123/i,
];

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePassword(p: string): PasswordValidation {
  if (p.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
  }
  if (COMMON_PATTERNS.some((rx) => rx.test(p))) {
    return { ok: false, reason: "This password is too common" };
  }
  return { ok: true };
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
