# Self-host via Docker Compose (Linux / macOS / Windows)

Bundle: Postgres + MinIO (S3-compatible) + the Quad app, all on one host.

## Prereqs

- Docker + Docker Compose v2 (Docker Desktop on macOS / Windows)
- 1 GB RAM + 5 GB disk free for the base bundle (videos add more)
- `ffmpeg` is built into the app image (no need to install on the host)

## 1. Clone + configure

**macOS / Linux**

```bash
git clone https://github.com/Conscience-Technology/Quad.git
cd Quad
cp .env.example .env
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/Conscience-Technology/Quad.git
cd Quad
Copy-Item .env.example .env
```

Edit `.env`:

```ini
SESSION_SECRET=...                 # see below
SUPER_ADMIN_EMAIL=you@example.com  # promotes this email to Super Admin
API_URL=http://localhost:3010      # or your reverse-proxied URL
OPENAI_API_KEY=                    # optional, enables Whisper STT
```

Generate a 48-byte `SESSION_SECRET`:

```bash
# macOS / Linux
openssl rand -base64 48
```

```powershell
# Windows PowerShell (no openssl required)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

> If you'd rather skip the manual steps, `./scripts/quickstart.sh`
> (macOS / Linux) or `pwsh ./scripts/quickstart.ps1` (Windows) does
> everything in step 1 + 2 for you.

## 2. Bring it up

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

(Same command on every OS — Docker Compose v2 ships in Docker Desktop on
macOS and Windows.)

This starts:

- `postgres` — :5432
- `minio` — :9000 (S3 API), :9001 (console, `minioadmin` / `minioadmin`)
- `minio-init` — creates the `quad` bucket on first boot
- `app` — :3010

Open http://localhost:3010 → sign up with `SUPER_ADMIN_EMAIL` → you're Super
Admin.

## 3. Behind a reverse proxy (Caddy / Nginx / Cloudflare Tunnel)

The app listens on `:3010`. Front it with TLS. Two env updates required:

```ini
API_URL=https://quad.yourdomain.com
NODE_ENV=production
```

If you use an external object store (R2, S3, Backblaze) instead of MinIO,
just point the `BUCKET_*` variables at it. Quad uses presigned POST/GET so
the server never proxies large bytes.

## 4. Backups

- Postgres data → docker volume `quad_quad-pg`. Use `pg_dump` or your
  preferred Postgres backup tool.
- Object storage → either snapshot the `quad_quad-minio` volume or, in
  production, point at managed object storage with versioning.

## 5. Updates

```bash
git pull
docker compose --env-file .env -f docker/docker-compose.yml build app
docker compose --env-file .env -f docker/docker-compose.yml up -d app
```

Migrations apply on every boot via `apps/web/src/db/migrate.ts` (run it
manually if you skip the bundled startup: `pnpm db:migrate`).

## 6. Troubleshooting

- **`fail-fast` on missing env**: app refuses to boot if `SESSION_SECRET`,
  `SUPER_ADMIN_EMAIL`, `DATABASE_URL`, or `BUCKET_*` are missing.
- **STT not working**: `OPENAI_API_KEY` empty → expected, transcripts are
  skipped. Set the key + restart.
- **Browser refuses video**: the MinIO endpoint must be reachable from the
  reporter's browser (or use signed URLs to a public R2/S3 bucket). Set
  `BUCKET_PUBLIC_URL` to the public-facing URL of the bucket.
