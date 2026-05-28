# Contributing to Quad

Thanks for considering a contribution. Quad is MIT-licensed, self-hosted,
and built to stay lean. The smallest change is welcome; the most useful
change is the one that holds the principles below.

## Principles (non-negotiable)

These are in the [spec](./spec.md) too. Worth re-reading before a PR.

1. **No-dependency bias.** The Web SDK (`@quad/sdk`) targets **zero runtime
   dependencies**. CLI and MCP each have ≤ 2 dependencies. Server adds are
   weighed against blast radius. Always justify a new dep in the PR.
2. **No server-side AI beyond Whisper STT.** Quad packages raw context
   deterministically; reasoning is the agent's job. Vision / Chat
   Completion / Embeddings calls are not permitted server-side. (Why:
   token cost, anchoring risk, scope creep.)
3. **Self-host first.** No SaaS-only assumptions. Every feature must work
   on a single-instance Docker Compose deploy.
4. **Fail silent in the SDK.** Nothing the SDK does may throw into the
   host app. If a Quad API call fails, log + drop, never propagate.
5. **PII discipline.** Never capture cookies / Authorization / form input
   values by default. `mask: [selector...]` widens the masking surface.
6. **One instance = one organization.** Don't reintroduce multi-tenant
   workspace abstractions. Larger orgs run multiple instances.

## Local setup

Prereqs: Node 20+, pnpm 9+, Docker (Docker Desktop on macOS / Windows).
CI runs on `ubuntu-latest` **and** `windows-latest` — please keep both
green.

**macOS / Linux**

```bash
git clone https://github.com/Conscience-Technology/Quad.git
cd Quad
pnpm install
cp .env.example .env
# Edit SESSION_SECRET (openssl rand -base64 48) + SUPER_ADMIN_EMAIL.

# Start Postgres + MinIO (dev mode: app runs locally on :3010):
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres minio minio-init

# Apply migrations:
DATABASE_URL=postgres://quad:quad@localhost:5432/quad pnpm --filter @quad/web db:migrate

# Run the app:
set -a && source .env && set +a
pnpm --filter @quad/web dev   # http://localhost:3010
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/Conscience-Technology/Quad.git
cd Quad
pnpm install
Copy-Item .env.example .env
# Edit SESSION_SECRET + SUPER_ADMIN_EMAIL. Generate the secret with:
#   [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))

docker compose --env-file .env -f docker/docker-compose.yml up -d postgres minio minio-init

$env:DATABASE_URL = "postgres://quad:quad@localhost:5432/quad"
pnpm --filter @quad/web db:migrate

# Load .env into the current PowerShell session, then run dev:
Get-Content .env | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $k,$v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
pnpm --filter @quad/web dev   # http://localhost:3010
```

In `NODE_ENV=development` the app auto-logs you in as Super Admin (the
email from `SUPER_ADMIN_EMAIL`). In production, this bypass is off and the
normal signup/login flow takes over.

## Repo layout

```
apps/web/        Next.js 15 + tRPC v11 + Drizzle (dashboard + API + MCP REST)
packages/sdk/    Web SDK — Shadow DOM widget, Bug Mode, Capture, event trail
packages/mcp/    MCP stdio server — talks to /api/mcp/*
packages/cli/    `quad` CLI — login / pull / status / comment / attach / sourcemap upload
docker/          Dockerfile + docker-compose.yml (Postgres + MinIO + app)
deploy/          Railway / EC2 / docker-self-host guides
spec.md          Single source of truth for the design + Phase plan
```

## Branch + PR workflow

Trunk-based with short-lived branches. See [docs/branching.md](./docs/branching.md)
for the full policy.

- `main` is the only long-lived branch and must always be deployable.
- Nobody pushes to `main` directly — it's protected. All changes land via
  PR + green CI + a code owner review.
- Branch off `main`:
  - `feature/<slug>` product or core feature work
  - `integration/<provider>` new issue tracker / workflow integration
  - `fix/<slug>` bug fix
  - `release/<version>` temporary release stabilization
  - `experimental/<slug>` intentionally unstable work
- Keep PRs small (~400 lines net change when possible). Stack large work.
- Merge strategy: **squash merge**. The PR title becomes the commit on
  `main`, so write it like a commit message: imperative, lowercase, no
  trailing period (`fix race in capture stop`).
- Rebase on `main` if there's drift before merging.

## ️ Commit style

Plain, imperative, lowercase. No emoji, no Conventional Commits prefix.

```
add sourcemap upload to the cli
fix race in capture stop
remove stale invitation token todo
```

## PR checklist

- [ ] `pnpm -r typecheck` clean (4/4 packages)
- [ ] `pnpm --filter @quad/web build` succeeds with placeholder envs
- [ ] No new runtime dep in `packages/sdk`
- [ ] No `fetch("https://api.openai.com/v1/(chat|images|embeddings|...)")`
      anywhere on the server
- [ ] If you touched a route / migration, the change applies cleanly on a
      fresh `docker compose up`
- [ ] If you added or changed an external issue tracker integration, follow
      [docs/integrations/creating-provider.md](./docs/integrations/creating-provider.md)
- [ ] Spec updated if you changed semantics (`spec.md` is the contract)
- [ ] **Deploy parity**: if you added a new `deploy/<target>.md`, also add a
      row to the **Deploy** matrix in `README.md`. If you changed env vars
      or boot steps, update **every** existing `deploy/*.md` + the
      `.env.example` + `HOWTO.md` so they stay in sync.

## Areas where help is especially welcome

- **Helm chart** under `deploy/k8s/`
- **Browser Extension** (Phase 2): glob shortcut + `chrome.desktopCapture`
  for true system-wide capture
- **Source map resolution**: today we upload via `quad sourcemap upload`;
  the actual frame-resolution + console-stack rewriting in
  `lib/preprocess` is a `TODO` waiting for hands
- **Translations**: dashboard strings live in component files inline today

## Code style

- TypeScript strict, `noUncheckedIndexedAccess` on
- No comments that just repeat what the code says — comments are for the
  *why* and the surprising
- Components are server-by-default; mark `"use client"` only when needed
- Minimal Cosmos tokens (spec §12): one accent per screen, spacing > borders

---

Maintained by [**Conscience Technology**](https://conscience.technology).
