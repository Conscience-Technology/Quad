/**
 * API key issuance + verification.
 *
 * Plain key shape: `qd_<scope>_<48 chars base64url>` (e.g. `qd_sdk_AbCd...`)
 * - shown ONCE on issuance, never again
 * - DB stores: prefix (first 12 chars including `qd_<scope>_`) for UI, plus
 *   sha256(plainKey) as `key_hash`. SHA-256 is fine here: the key carries
 *   ~256 bits of entropy, no need for bcrypt/argon2.
 */
import { createHash, randomBytes } from "node:crypto";

export type Scope = "sdk" | "mcp";

export function generateApiKey(scope: Scope): { plain: string; prefix: string; hash: string } {
  const raw = randomBytes(36).toString("base64url"); // 48 chars
  const plain = `qd_${scope}_${raw}`;
  const prefix = plain.slice(0, 12); // `qd_sdk_AbCd` / `qd_mcp_AbCd`
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, prefix, hash };
}

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}
