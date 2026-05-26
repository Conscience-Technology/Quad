# Deploy to EC2 + RDS + S3

For when you want full AWS, not Railway. This is essentially the Docker
self-host guide with managed Postgres + S3 swapped in.

## 1. Provision

- **EC2** — t3.small is enough for personal use. Ubuntu 22.04 + Docker.
- **RDS Postgres 16** — db.t4g.micro is fine. Create database `quad`.
- **S3 bucket** — private. Generate an IAM user with `s3:PutObject /
  GetObject / DeleteObject / ListBucket` on that bucket.

## 2. Setup the host

SSH in and install Docker:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

Clone:

```bash
git clone https://github.com/<you>/quad.git
cd quad
cp .env.example .env
```

`.env` (replace placeholders):

```ini
SESSION_SECRET=...
SUPER_ADMIN_EMAIL=you@example.com
APP_URL=https://quad.yourdomain.com
NODE_ENV=production
INSTANCE_SIGNUP_OPEN=false

DATABASE_URL=postgres://USER:PASS@your-rds-host:5432/quad

BUCKET_NAME=your-bucket-name
BUCKET_ENDPOINT=https://s3.us-east-1.amazonaws.com
BUCKET_ACCESS_KEY_ID=AKIA...
BUCKET_SECRET_KEY=...
BUCKET_REGION=us-east-1
# Optional: set if you front the bucket with CloudFront
# BUCKET_PUBLIC_URL=https://cdn.yourdomain.com

OPENAI_API_KEY=
EMAIL_PROVIDER=none
```

## 3. Run only the app container

You don't need the docker-compose `postgres` + `minio` services. Build + run
the app alone:

```bash
docker build -f docker/Dockerfile -t quad:latest .
docker run -d --restart unless-stopped \
  --name quad \
  --env-file .env \
  -p 3010:3010 \
  quad:latest
```

## 4. TLS via Caddy (simplest)

```Caddyfile
quad.yourdomain.com {
    reverse_proxy localhost:3010
}
```

```bash
sudo apt-get install caddy
sudo systemctl reload caddy
```

## 5. Backups

- RDS: enable automated daily backups (point-in-time recovery).
- S3: enable versioning + lifecycle rules. Quad's data retention defaults
  (30 days for video, 90 for screenshots) operate on the storage_key prefix
  `bugs/<id>/` — a lifecycle rule on that prefix is the cheapest way to
  enforce retention server-side as a backstop.

## 6. Updates

```bash
git pull
docker build -f docker/Dockerfile -t quad:latest .
docker stop quad && docker rm quad
docker run -d --restart unless-stopped --name quad --env-file .env -p 3010:3010 quad:latest
```

Migrations are applied on container startup (see `apps/web/src/db/migrate.ts`).
