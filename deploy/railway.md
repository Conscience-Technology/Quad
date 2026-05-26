# Deploy to Railway (recommended path)

Railway gives you Postgres + an S3-compatible Storage Bucket + a Next.js
service in one project. Total setup time: ~5 minutes.

## 1. Create the Railway project

1. New project → "Deploy from GitHub repo" → point at your fork of `quad`.
2. Railway auto-detects Nixpacks and reads `railway.json` from the repo root.

## 2. Add Postgres

Add → Database → **Postgres**. Railway auto-injects `DATABASE_URL` into the
service environment. First boot will be empty; the app applies Drizzle
migrations on startup (see `apps/web/src/db/migrate.ts`).

## 3. Add a Storage Bucket

Add → **Storage Bucket**. Railway auto-injects:

```
BUCKET_NAME
BUCKET_ENDPOINT
BUCKET_ACCESS_KEY_ID
BUCKET_SECRET_KEY
BUCKET_REGION
```

Quad reads them directly — no extra config.

## 4. Required variables (set manually)

Variables → Add:

| Key                       | Notes                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `SESSION_SECRET`          | `openssl rand -base64 48` &nbsp;·&nbsp; Windows PowerShell: `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))` |
| `SUPER_ADMIN_EMAIL`       | The email you'll sign up with. That account becomes Super Admin automatically (and is auto-activated). Anyone else who signs up lands in `pending` and you approve them at `/admin/users`. |
| `APP_URL`                 | The public Railway URL (e.g. `https://quad-production-abcd.up.railway.app`)           |
| `PORT`                    | `3010` (Railway also injects its own PORT; this is fine to leave as the docker default) |
| `OPENAI_API_KEY`          | Optional. If unset, STT (Whisper) is disabled. No other OpenAI endpoint is used.      |
| `WHISPER_MONTHLY_MINUTES_CAP` | Optional. `0` = no cap. Otherwise STT auto-suspends past N minutes per month.    |

## 5. Health check + first login

Railway hits `/api/health` (configured in `railway.json`). After the first
deploy succeeds:

1. Open the public URL → `/signup`
2. Sign up with `SUPER_ADMIN_EMAIL` — you're promoted to Super Admin
3. `/admin` → create your first project → copy the SDK API key

## 6. Install the SDK in your app

```tsx
// app/layout.tsx in your Next.js host app
import { QuadProvider } from "@quad/sdk/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <QuadProvider
          apiKey={process.env.NEXT_PUBLIC_QUAD_KEY!}
          options={{ video: { enabled: true }, voice: { enabled: true } }}
        >
          {children}
        </QuadProvider>
      </body>
    </html>
  );
}
```

Set `NEXT_PUBLIC_QUAD_KEY` to the SDK key from the dashboard.

## 7. Wire Claude Code via MCP

`/admin` → "MCP keys" → issue a new key. Then in
`~/.config/claude-code/mcp.json`:

```jsonc
{
  "mcpServers": {
    "quad": {
      "command": "npx",
      "args": ["-y", "@quad/mcp"],
      "env": {
        "QUAD_API_KEY": "qd_mcp_...",
        "QUAD_ENDPOINT": "https://your-quad.up.railway.app"
      }
    }
  }
}
```

Now Claude Code can `quad_pick_task`, get the full Task Brief + key frames +
timeline + signed video URL, and push back `quad_update_task(status=pr_open, pr_url=…)`.

## 8. Updates

`git push` to your fork's main branch — Railway redeploys. Migrations run
on every boot (idempotent thanks to drizzle-kit's `__drizzle_migrations`
table).
