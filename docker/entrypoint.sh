#!/bin/sh
# Quad container entrypoint.
# 1. Wait for Postgres to be reachable
# 2. Apply Drizzle migrations (idempotent)
# 3. Hand off to `next start`
set -e

if [ -z "${DATABASE_URL}" ]; then
  echo "[entrypoint] DATABASE_URL is required" >&2
  exit 1
fi

# Crude but dependency-free Postgres wait. node-postgres handshakes via libpq
# so we just retry the connection from inside the app's runtime. We cd into
# apps/web so the `postgres` package resolves (pnpm workspaces don't hoist it
# to the repo root).
echo "[entrypoint] Waiting for Postgres at ${DATABASE_URL%%\?*}..."
i=0
until (cd /app/apps/web && node -e "
  import('postgres').then(({default: postgres}) => {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
    return sql\`select 1\`.then(() => sql.end()).then(() => process.exit(0));
  }).catch((e) => { console.error(e.message); process.exit(1); });
") >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] Postgres did not become reachable in 30 tries — giving up" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] Postgres reachable."

echo "[entrypoint] Applying migrations..."
node /app/apps/web/.next/standalone/apps/web/src/db/migrate.js 2>/dev/null \
  || (cd /app && pnpm --filter @quad/web db:migrate)

echo "[entrypoint] Starting Next.js on :${PORT:-3010}..."
exec pnpm --filter @quad/web start
