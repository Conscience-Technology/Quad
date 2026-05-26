# Quad — common operations. Run `make help` for the list.
.DEFAULT_GOAL := help

ENV_FILE := .env
COMPOSE  := docker compose --env-file $(ENV_FILE) -f docker/docker-compose.yml

.PHONY: help quickstart up down logs migrate dev build test typecheck clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

quickstart: ## One-shot: generate .env, boot everything via docker compose
	@./scripts/quickstart.sh

up: ## Boot Postgres + MinIO + app
	@$(COMPOSE) up -d

down: ## Stop and remove containers (keeps volumes)
	@$(COMPOSE) down

logs: ## Tail the app logs
	@$(COMPOSE) logs -f app

migrate: ## Apply Drizzle migrations against $(DATABASE_URL)
	@pnpm --filter @quad/web db:migrate

dev: ## Run the Next.js app locally (assumes Postgres + MinIO are up)
	@set -a && . ./$(ENV_FILE) && set +a && pnpm --filter @quad/web dev

build: ## Build all packages
	@pnpm -r build

typecheck: ## Typecheck all packages
	@pnpm -r typecheck

test: ## Run all tests (placeholder — community PRs welcome)
	@echo "No test suite yet. PRs welcome."

clean: ## Stop everything and remove volumes
	@$(COMPOSE) down -v
	@rm -rf apps/web/.next apps/web/node_modules/.cache
