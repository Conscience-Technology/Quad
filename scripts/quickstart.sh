#!/bin/sh
# Quad — 60-second quickstart.
# Generates a .env from .env.example with a fresh SESSION_SECRET, prompts for
# the super admin email if not set, and starts docker compose.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- 1. .env ---
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "error: .env.example missing — are you in the repo root?" >&2
    exit 1
  fi
  echo "→ creating .env from .env.example"
  cp .env.example .env

  # Fill SESSION_SECRET if it's still the placeholder.
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -base64 48 | tr -d '\n')
    # macOS sed needs ''
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
    else
      sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
    fi
    echo "→ generated SESSION_SECRET"
  else
    echo "  ! openssl not found — set SESSION_SECRET in .env manually" >&2
  fi

  # Prompt for super admin email.
  CURRENT_EMAIL=$(grep '^SUPER_ADMIN_EMAIL=' .env | cut -d= -f2-)
  if [ -z "$CURRENT_EMAIL" ] || [ "$CURRENT_EMAIL" = "you@example.com" ]; then
    printf "→ super admin email (you'll sign up with this): "
    read EMAIL
    if [ -n "$EMAIL" ]; then
      if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s|^SUPER_ADMIN_EMAIL=.*|SUPER_ADMIN_EMAIL=${EMAIL}|" .env
      else
        sed -i "s|^SUPER_ADMIN_EMAIL=.*|SUPER_ADMIN_EMAIL=${EMAIL}|" .env
      fi
    fi
  fi
else
  echo "→ .env already exists, leaving it alone"
fi

# --- 2. Docker check ---
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found. Install Docker Desktop first: https://docker.com" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "error: docker daemon not running. Start Docker Desktop and try again." >&2
  exit 1
fi

# --- 3. Boot ---
echo "→ booting Postgres + MinIO + Quad app..."
docker compose --env-file .env -f docker/docker-compose.yml up -d

echo ""
echo "✓ Done."
echo "  → open http://localhost:3010"
echo "  → sign up with the email you set in .env (SUPER_ADMIN_EMAIL)"
echo "  → that account becomes Super Admin automatically"
echo ""
echo "  logs:  docker compose --env-file .env -f docker/docker-compose.yml logs -f app"
echo "  stop:  docker compose --env-file .env -f docker/docker-compose.yml down"
