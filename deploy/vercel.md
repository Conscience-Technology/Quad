# Deploy to Vercel

Quad is a Next.js fullstack app, so Vercel works — with one important caveat:
the preprocessing pipeline (FFmpeg keyframes + Whisper STT) needs more wall
time than a Hobby-plan function allows, and FFmpeg binaries are not on the
Vercel Node runtime by default. Read the **Caveats** section before you
commit to this path.

## TL;DR

| You want | Pick |
|---|---|
| Just a hosted dashboard, no preprocessing | Vercel works on Hobby, but every captured video stays without keyframes or transcript |
| The full pipeline | **Vercel Pro+** (60s function limit) **plus** `@ffmpeg-installer/ffmpeg`, **or** run a small worker elsewhere (Railway is easiest — see [`railway.md`](./railway.md)) |
| Simplest path | Skip Vercel and use Railway — it has Postgres + Storage Bucket + persistent Node runtime in one click |

## 1. Provision

- **Vercel project** — import your fork of `quad`. Vercel auto-detects the
  Next.js app under `apps/web`.
  - Root directory: `apps/web`
  - Build command: `pnpm install --frozen-lockfile=false && pnpm --filter @quad/web build`
  - Install command: `pnpm install --frozen-lockfile=false`
- **Postgres** — pick one:
  - **Vercel Postgres** (built-in) — auto-injects `POSTGRES_URL`. You'll set
    `DATABASE_URL=$POSTGRES_URL` in Variables.
  - **Neon** / **Supabase** / **Railway Postgres** — copy the connection
    string and paste it as `DATABASE_URL` in Vercel Variables.
- **Storage** — pick one:
  - **Vercel Blob** — needs an adapter (Quad currently uses S3-compatible
    presigned POST; a Blob adapter is a community PR opportunity). Until that
    lands, point Quad at S3-compatible storage instead.
  - **Cloudflare R2** (recommended) — S3 API, no egress fees. Free tier
    covers small projects.
  - **AWS S3** — standard S3 API.
  - **Backblaze B2** — cheapest egress.

## 2. Variables

Vercel → Settings → Environment Variables:

```ini
NODE_ENV=production
APP_URL=https://your-quad.vercel.app

SESSION_SECRET=...                     # openssl rand -base64 48
                                       # Windows: [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
SUPER_ADMIN_EMAIL=you@example.com

DATABASE_URL=postgres://...            # from your Postgres provider

# S3-compatible (Cloudflare R2 shown — replace with your provider)
BUCKET_NAME=quad
BUCKET_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
BUCKET_ACCESS_KEY_ID=...
BUCKET_SECRET_KEY=...
BUCKET_REGION=auto
BUCKET_PUBLIC_URL=                     # optional, only if you front the bucket with a CDN

OPENAI_API_KEY=                        # optional, for Whisper STT
```

## 3. Migrations

Vercel doesn't run a long-lived process, so the Docker entrypoint approach
doesn't apply. Two options:

- **Manual** — run `pnpm --filter @quad/web db:migrate` locally with the
  remote `DATABASE_URL` exported, whenever you ship a new migration.
- **Build hook** — add to `apps/web/package.json`:
  ```jsonc
  {
    "scripts": {
      "build": "pnpm db:migrate && next build"
    }
  }
  ```
  Vercel will then run migrations as part of every deploy. Keep migrations
  idempotent (Drizzle's `__drizzle_migrations` table handles this already).

## 4. Caveats — read carefully

### 4-1. Function timeout

Quad's preprocessing pipeline (`lib/preprocess/index.ts`) runs
fire-and-forget after a bug ingest:

```ts
setImmediate(() => { void processBugReport(result.id); });
```

On Vercel, `setImmediate` after the HTTP response still counts against the
function's wall time. A 90-second video → ~30s of work. So:

- **Hobby (10s function limit)** — preprocessing **will not finish**.
  Videos store; keyframes / transcripts won't appear.
- **Pro (60s default, up to 300s)** — fits most captures. Set
  `maxDuration = 300` on the ingest route:
  ```ts
  // apps/web/src/app/api/ingest/session/route.ts (and pin/presign)
  export const maxDuration = 300;
  ```
- **Enterprise (900s)** — fits anything.

### 4-2. FFmpeg binary

Vercel Node runtime doesn't ship `ffmpeg` / `ffprobe`. Options:

- **`@ffmpeg-installer/ffmpeg` + `@ffprobe-installer/ffprobe`** (npm) — add
  to `apps/web` deps and adjust `lib/preprocess/ffmpeg.ts` to call the
  binary from `require('@ffmpeg-installer/ffmpeg').path`. Function bundle
  grows to ~30 MB; check Vercel's per-function size limit (50 MB unzipped).
- **External worker** — push the ingest event to a small worker running on
  Railway / Fly / Render. Quad's preprocess is decoupled enough to extract;
  this is the more robust pattern for production.
- **Skip preprocessing** — set `OPENAI_API_KEY=""` and patch the ingest
  route to not call `processBugReport`. Videos still upload and play, but
  no key frames and no transcript.

### 4-3. Cold starts

Vercel's serverless cold start adds 200–400 ms to the first request after
idle. Acceptable for a dashboard; for the ingest endpoints (called from
end-user browsers), expect occasional warm-up delays.

### 4-4. No native binaries in the build

If you take the `@ffmpeg-installer/ffmpeg` path, set:

```jsonc
// vercel.json
{
  "functions": {
    "apps/web/src/app/api/ingest/**/route.ts": { "maxDuration": 300 }
  }
}
```

so the ingest routes inherit the longer wall time.

## 5. Health check + first login

Once the build finishes:

1. `https://your-quad.vercel.app/api/health` → `{"ok":true}`
2. Open `/signup` → sign up with `SUPER_ADMIN_EMAIL` → auto-promoted to
   super admin
3. Create your first project → issue an SDK key → install in your host app

## 6. When to pick Vercel vs Railway

| Vercel | Railway |
|---|---|
| Already have a Vercel team / billing relationship | Want one place for app + Postgres + Storage |
| OK with the FFmpeg caveat or running a worker elsewhere | Want the FFmpeg pipeline to "just work" |
| Edge-network latency matters | Single-region is fine |

For most self-hosters, **Railway is the simpler path**. Vercel shines when
you already live on Vercel and are willing to put the preprocessing worker
somewhere else.
