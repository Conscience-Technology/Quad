# Quad - 60-second quickstart for Windows (PowerShell).
# Mirrors scripts/quickstart.sh: generates .env, fills SESSION_SECRET,
# prompts for the super admin email, then boots docker compose.
#
# Usage:   pwsh ./scripts/quickstart.ps1
# Or:      powershell -ExecutionPolicy Bypass -File .\scripts\quickstart.ps1
$ErrorActionPreference = "Stop"

# Move to repo root regardless of where the script was invoked from
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- 1. .env ---
if (-not (Test-Path ".env")) {
  if (-not (Test-Path ".env.example")) {
    Write-Error "error: .env.example missing - are you in the repo root?"
    exit 1
  }
  Write-Host "-> creating .env from .env.example"
  Copy-Item ".env.example" ".env"

  # SESSION_SECRET: 48 random bytes -> base64
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  (Get-Content .env) -replace '^SESSION_SECRET=.*', "SESSION_SECRET=$secret" | Set-Content .env -Encoding UTF8
  Write-Host "-> generated SESSION_SECRET"

  # Prompt for super admin email
  $current = (Get-Content .env | Select-String '^SUPER_ADMIN_EMAIL=' | ForEach-Object { $_ -replace '^SUPER_ADMIN_EMAIL=', '' })
  if (-not $current -or $current -eq "you@example.com") {
    $email = Read-Host "-> super admin email (you'll sign up with this)"
    if ($email) {
      (Get-Content .env) -replace '^SUPER_ADMIN_EMAIL=.*', "SUPER_ADMIN_EMAIL=$email" | Set-Content .env -Encoding UTF8
    }
  }
} else {
  Write-Host "-> .env already exists, leaving it alone"
}

# --- 2. Docker check ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "error: docker not found. Install Docker Desktop first: https://docker.com"
  exit 1
}
try {
  docker info | Out-Null
} catch {
  Write-Error "error: docker daemon not running. Start Docker Desktop and try again."
  exit 1
}

# --- 3. Boot ---
Write-Host "-> booting Postgres + MinIO + Quad app..."
docker compose --env-file .env -f docker/docker-compose.yml up -d

Write-Host ""
Write-Host "[OK] Done."
Write-Host "  -> open http://localhost:3010"
Write-Host "  -> sign up with the email you set in .env (SUPER_ADMIN_EMAIL)"
Write-Host "  -> that account becomes Super Admin automatically"
Write-Host ""
Write-Host "  logs:  docker compose --env-file .env -f docker/docker-compose.yml logs -f app"
Write-Host "  stop:  docker compose --env-file .env -f docker/docker-compose.yml down"
