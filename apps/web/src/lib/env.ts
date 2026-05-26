import { z } from "zod";

/**
 * Quad environment schema. Validated once on process start; the app fails fast
 * if required values are missing. Optional values gate features (no STT
 * without OPENAI_API_KEY).
 */
const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  APP_URL: z.string().url().default("http://localhost:3010"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be >=32 chars; generate with `openssl rand -base64 48`")
    .refine(
      (v) => v !== "replace-me-with-openssl-rand-base64-48",
      "SESSION_SECRET still set to the placeholder from .env.example",
    ),

  SUPER_ADMIN_EMAIL: z.string().email("SUPER_ADMIN_EMAIL must be a valid email"),

  DATABASE_URL: z.string().url().refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
    message: "DATABASE_URL must be a Postgres URL",
  }),

  BUCKET_NAME: z.string().min(1),
  BUCKET_ENDPOINT: z.string().url(),
  BUCKET_ACCESS_KEY_ID: z.string().min(1),
  BUCKET_SECRET_KEY: z.string().min(1),
  BUCKET_REGION: z.string().default("auto"),
  BUCKET_PUBLIC_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),
  WHISPER_MONTHLY_MINUTES_CAP: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 0)),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | undefined;

// During `next build` (which runs server code while collecting page data),
// the real DATABASE_URL / BUCKET_* / SESSION_SECRET / SUPER_ADMIN_EMAIL may not
// be available yet — they're only injected at deploy time on platforms like
// Railway. We fill harmless placeholders so the build can finish, then
// validate strictly at runtime ("phase-production-server").
const BUILD_PLACEHOLDERS: Record<string, string> = {
  SESSION_SECRET: "build-time-placeholder-not-a-real-secret-1234",
  SUPER_ADMIN_EMAIL: "build@example.com",
  DATABASE_URL: "postgres://x:x@localhost:5432/x",
  BUCKET_NAME: "build",
  BUCKET_ENDPOINT: "http://localhost:9000",
  BUCKET_ACCESS_KEY_ID: "x",
  BUCKET_SECRET_KEY: "x",
};

function load(): Env {
  const source: Record<string, string | undefined> =
    process.env.NEXT_PHASE === "phase-production-build"
      ? { ...BUILD_PLACEHOLDERS, ...process.env }
      : process.env;
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (!cached) cached = load();
  return cached;
}

// Feature gates derived from optional env vars.
export const features = {
  stt(): boolean {
    return !!env().OPENAI_API_KEY;
  },
};
