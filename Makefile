# Common tasks, meant to be run from the devcontainer (Node.js, pnpm and the
# Docker CLI are available there). `make` alone lists the targets.

COMPOSE      := docker compose
COMPOSE_PROD := docker compose -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help install dev build test check format format-check ci db-generate \
	db-up db-down up down logs ps images prod-pull prod-up prod-down clean

help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ---- Development (without Docker) ----

install: ## Install the dependencies
	pnpm install

dev: install ## Run engine (watch), API (:3000) and web (:4321, proxies /api)
	pnpm dev

build: ## Build every package
	pnpm build

test: ## Run every test suite (engine, API with e2e, web)
	pnpm test

check: ## Type-check every package
	pnpm check

format: ## Format the code with Prettier
	pnpm format

format-check: ## Check the formatting
	pnpm format:check

ci: format-check build check test ## What the CI runs

db-generate: ## Generate a SQL migration after editing api/src/database/schema.ts
	pnpm --filter @2tamago/api db:generate

# ---- Local Docker stack (docker-compose.yml) ----

db-up: ## Start only PostgreSQL (reachable from the devcontainer as db:5432)
	$(COMPOSE) up -d db

db-down: ## Stop PostgreSQL
	$(COMPOSE) stop db

up: ## Build and start the full stack on http://localhost:8080
	$(COMPOSE) up -d --build

down: ## Stop the full stack (keeps the data)
	$(COMPOSE) down

logs: ## Follow the logs of the stack
	$(COMPOSE) logs -f

ps: ## Show the containers of the stack
	$(COMPOSE) ps

images: ## Build the API and web images
	$(COMPOSE) build

# ---- Production / staging (docker-compose.prod.yml, run on the server) ----

prod-pull: ## Pull the published images
	$(COMPOSE_PROD) pull

prod-up: ## Start or update the production stack
	$(COMPOSE_PROD) up -d

prod-down: ## Stop the production stack (keeps the data)
	$(COMPOSE_PROD) down

# ---- Housekeeping ----

clean: ## Remove build outputs (keeps node_modules and local data)
	rm -rf shared/core/dist api/dist web/build web/.svelte-kit
	find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
