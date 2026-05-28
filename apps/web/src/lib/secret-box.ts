import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

const VERSION = "v1";

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join(":");
}

export function decryptSecret(boxed: string): string {
  const [version, ivB64, tagB64, ciphertextB64] = boxed.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Unsupported encrypted secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), unb64(ivB64));
  decipher.setAuthTag(unb64(tagB64));
  return Buffer.concat([
    decipher.update(unb64(ciphertextB64)),
    decipher.final(),
  ]).toString("utf8");
}

function key(): Buffer {
  return createHash("sha256").update(env().SESSION_SECRET).digest();
}

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

function unb64(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
