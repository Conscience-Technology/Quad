import { z } from "zod";

/**
 * Quad environment schema. Validated once on process start; the app fails fast
 * if required values are missing. Optional values gate features (no STT
 * without OPENAI_API_KEY).
 */
const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  API_URL: z.string().url().default("http://localhost:3010"),

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

  BUCKET: z.string().min(1),
  ENDPOINT: z.string().url(),
  ACCESS_KEY_ID: z.string().min(1),
  SECRET_ACCESS_KEY: z.string().min(1),
  REGION: z.string().default("auto"),
  BUCKET_PUBLIC_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),
  AZURE_DEVOPS_PAT: z.string().optional(),
  WHISPER_MONTHLY_MINUTES_CAP: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 0)),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | undefined;
let placeholderWarningEmitted = false;

// Fail-fast keys are validated at module-load time on every import, including
// during `next build` when page modules are evaluated to collect static
// metadata. Real values aren't always present at build time on platforms like
// Railway (BUCKET_* especially), so we backfill clearly-marked placeholders.
// The actual S3 / Postgres / cookie code will surface a more specific error
// at the first real request if the operator forgot to set a real value.
const BUILD_PLACEHOLDERS: Record<string, string> = {
  SESSION_SECRET: "build-time-placeholder-not-a-real-secret-1234",
  SUPER_ADMIN_EMAIL: "build@example.com",
  DATABASE_URL: "postgres://placeholder:placeholder@localhost:5432/placeholder",
  BUCKET: "placeholder",
  ENDPOINT: "http://localhost:9000",
  ACCESS_KEY_ID: "placeholder",
  SECRET_ACCESS_KEY: "placeholder",
};

function load(): Env {
  const filled: Record<string, string | undefined> = {};
  let usedPlaceholder = false;
  for (const k of Object.keys(BUILD_PLACEHOLDERS)) {
    if (!process.env[k] || process.env[k] === "") {
      const fallback = BUILD_PLACEHOLDERS[k];
      if (fallback !== undefined) {
        filled[k] = fallback;
        usedPlaceholder = true;
      }
    }
  }
  const source: Record<string, string | undefined> = { ...filled, ...process.env };
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  if (usedPlaceholder && !placeholderWarningEmitted) {
    placeholderWarningEmitted = true;
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn(
        "[quad] using placeholder env values for missing keys. " +
          "S3/DB will fail on first real request. Set: " +
          Object.keys(BUILD_PLACEHOLDERS).filter((k) => !process.env[k]).join(", "),
      );
    }
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
