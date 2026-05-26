# How to use Quad — from zero to first PR

A 15-minute walkthrough: deploy Quad on Railway, drop the SDK into your
Next.js host app, connect Claude Code via MCP, and watch the first bug
report turn into a PR.

---

## 0. Prerequisites

- GitHub account (for Railway login)
- An existing Next.js (App Router) app you can install the SDK into
- *(Optional)* OpenAI API key — enables Whisper STT. Without it, audio/video
  is stored but transcripts are skipped. Nothing else uses LLMs.

---

## 1. Deploy Quad to Railway (5 minutes)

### 1-1. Fork

Fork this repo to your GitHub.

### 1-2. New Railway project

<https://railway.app> → **New Project → Deploy from GitHub repo** → pick
your fork. Railway reads `railway.json` and builds with Nixpacks.

### 1-3. Add Postgres

`+` → **Database → Postgres**. `DATABASE_URL` auto-injects.

### 1-4. Add a Storage Bucket

`+` → **Storage Bucket**. Five `BUCKET_*` variables auto-inject.

### 1-5. Set the required variables

In Railway → **Variables**:

| Key | Value | Notes |
|---|---|---|
| `SESSION_SECRET` | output of `openssl rand -base64 48` (or on Windows: `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))`) | **required** |
| `SUPER_ADMIN_EMAIL` | your email | Sign up with this address to become super admin (auto-activated). Anyone else who signs up lands in `pending` until you approve them at `/admin/users`. |
| `APP_URL` | your Railway public URL | e.g. `https://quad-production-xxxx.up.railway.app` |
| `OPENAI_API_KEY` | *(optional)* | enables Whisper STT |

### 1-6. Health check

Deploy. Once `/api/health` returns 200, you're live.

---

## 2. Sign up as Super Admin (1 minute)

Open the Railway URL → **Create account** → use the email you set as
`SUPER_ADMIN_EMAIL`. The account is auto-promoted to super admin and
lands on `/admin`.

---

## 3. Create your first project (1 minute)

Top right → **Projects** → **+ New project** → name it (e.g. `acme-web`).
You land in the project dashboard.

---

## 4. Issue an SDK key and install in your host app (3 minutes)

### 4-1. Issue the key

Project sidebar → **Settings → API keys → + Issue new SDK key**. The
plaintext `qd_sdk_…` is shown **once**. Copy it.

### 4-2. Restrict origins (recommended)

**Settings → General → Allowed origins** — one URL per line. Empty list =
allow any origin (dev convenience).

```
https://app.acme.com
https://staging.acme.com
http://localhost:3000
```

### 4-3. Install in your Next.js host app

```bash
cd /your/host/app
npm i @quad/sdk
```

`.env.local`:

```ini
NEXT_PUBLIC_QUAD_KEY=qd_sdk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_QUAD_ENABLED=true
```

`app/layout.tsx`:

```tsx
import { QuadProvider } from "@quad/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_QUAD_ENABLED === "true";

  return (
    <html>
      <body>
        {enabled && process.env.NEXT_PUBLIC_QUAD_KEY ? (
          <QuadProvider
            apiKey={process.env.NEXT_PUBLIC_QUAD_KEY}
            options={{
              video: { enabled: true },
              voice: { enabled: true },
              mask: ['[data-pii]', 'input[type="password"]'],
            }}
          >
            {children}
          </QuadProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
```

Start the host dev server. A small 4-dot toggle appears on the right edge.

---

## 5. Reporter flow — your first bug (1 minute)

In the host app:

| Shortcut (Mac / Win) | What it does |
|---|---|
| `Cmd+Shift+B` / `Ctrl+Shift+B` | Toggle Bug Mode |
| **Bug Mode ON** + `Option+Click` / `Alt+Click` | Pin that element → floating comment box |
| `Cmd+Shift+R` / `Ctrl+Shift+R` | Capture session (screen + mic + STT) |
| `Cmd+Shift+V` / `Ctrl+Shift+V` | Voice-only |
| `Cmd+Shift+Q` / `Ctrl+Shift+Q` | Open the freeform overlay |
| `Esc` | Cancel any mode |

Example:
1. `Cmd+Shift+B` (Bug Mode on)
2. `Option+Click` the broken element → *"Pay button leads to a blank screen"* → Submit
3. `Cmd+Shift+R` → choose **screen + voice** → reproduce while narrating
4. **■ Stop** → uploads automatically

---

## 6. Maintainer flow — confirm to a task (1 minute)

Back in the Quad dashboard:

1. `/projects/acme-web` → **Inbox** column has the new bug
2. Click → bug detail (video player + transcript sidebar; press `C` while
   playing to drop a timestamp comment)
3. Right panel → one-line intent (optional) → **Confirm → Task**
4. You land on `/projects/acme-web/task/<id>` — Task Brief renders inline

---

## 7. Connect Claude Code via MCP (3 minutes)

### 7-1. Issue an MCP key

Top right of `/projects` → **MCP keys** → pick projects this key can act
on → expiry (default 90 days) → **Issue new MCP key**. The plaintext
`qd_mcp_…` is shown once; the page also generates the exact Claude Code
config snippet for your endpoint.

### 7-2. Wire it up

`~/.config/claude-code/mcp.json`:

```jsonc
{
  "mcpServers": {
    "quad": {
      "command": "npx",
      "args": ["-y", "@quad/mcp"],
      "env": {
        "QUAD_API_KEY": "qd_mcp_xxxxxxxxxxxxxxxx",
        "QUAD_ENDPOINT": "https://your-quad-instance.up.railway.app"
      }
    }
  }
}
```

Restart Claude Code.

### 7-3. First fix

In your host repo:

> *"pick the next quad task and fix it"*

Internally:
1. `quad_pick_task` returns brief + base64 key frames + signed video URL + `timeline.json`
2. Claude Code reasons → edits → `gh pr create`
3. `quad_update_task(status=pr_open, pr_url=…)` posts back to the task
4. When the PR merges, mark it **done** (auto-closure via GitHub webhook
   is on the roadmap)

---

## ⌨️ 8. (Optional) CLI fallback

```bash
npx @quad/cli login \
  --endpoint https://your-quad-instance.up.railway.app \
  --key qd_mcp_xxxxxxxxxxxxxxxx

npx quad list
npx quad pull --next
npx quad pull <task-id>
# .quad/tasks/<id>/TASK_BRIEF.md + frames/ + timeline.json + manifest.json

npx quad status <task-id> --set pr_open --pr https://github.com/.../pull/123
npx quad comment <task-id> "Fix is up for review"
```

Attach an OS recording:

```bash
# Most-recent video, OS-aware default folder:
#   macOS:    ~              (Cmd+Shift+5 → desktop)
#   Windows:  %USERPROFILE%\Videos\Captures   (Win+G "Captures")
#   Linux:    ~/Videos
npx quad attach <bug-id> --latest

# Or pass any folder explicitly:
npx quad attach <bug-id> --latest ~/Movies
```

Upload sourcemaps from your host build:

```bash
npx quad sourcemap upload .next/static \
  --project acme-web \
  --release $(git rev-parse HEAD)
```

---

## 9. Pass `commitSha` from your host build *(optional)*

```js
// next.config.mjs
const nextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "",
  },
};
```

```tsx
<QuadProvider commitSha={process.env.NEXT_PUBLIC_GIT_SHA} ... />
```

---

## 🆘 10. Troubleshooting

### `getDisplayMedia` permission denied / no screen recording

Only desktop Chrome/Edge/Firefox/Safari 13+ support `getDisplayMedia`.
Mobile browsers don't — screenshots + voice still work.

### Whisper transcripts never appear

`OPENAI_API_KEY` is unset. Add it in Railway → redeploy.

### "Your account is waiting for the instance admin to approve it"

The super admin needs to visit `/admin/users` and click **Approve** on
the new sign-up. Or have a project admin invite the user via
`/projects/[slug]/members` — invite-link signups skip the pending state
and are auto-activated.

### MCP server can't connect

```bash
npx @quad/mcp
# stderr tells you which env var is missing
```

Both `QUAD_API_KEY` and `QUAD_ENDPOINT` must be set in the MCP env.

### CSS sometimes blanks in local dev

```bash
rm -rf apps/web/.next && pnpm --filter @quad/web dev
```

Production builds are unaffected — CSS hashes are stable.

---

## Loop summary

```
Reporter (host app)              Maintainer (Quad)                Builder (Claude Code)
────────────────────             ─────────────────                ─────────────────────
Cmd+Shift+B  Option+Click  →
Cmd+Shift+R  record + talk ■  →  Board · Inbox
                                       ↓ click
                                  Video + transcript + DOM trail
                                       ↓ Confirm
                                  Task created (brief frozen)     →  quad_pick_task
                                                                    brief + frames + timeline
                                                                          ↓ edit code
                                                                    gh pr create
                                  task = pr_open, PR URL  ←  quad_update_task
                                       ↓ merge
                                  done → bug = resolved
                                  Reporter thread notified ←  quad_post_comment
```

Issues, ideas, PRs welcome on [GitHub](https://github.com/YOU/quad/issues).

---

Maintained by [**Conscience Technology**](https://conscience.technology). Issues, ideas, PRs welcome on [GitHub](https://github.com/Conscience-Technology/Quad/issues).
