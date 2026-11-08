# 2Tamago: notes for contributors and coding agents

- Services at the root, each with its Dockerfile: `api/` (NestJS 12), `web/` (SvelteKit 3 SPA, served by Caddy); shared code in `shared/` (`shared/core`: pure game engine + API contracts). The pnpm workspace lists them explicitly, so non-Node services can live alongside. `make` lists the common tasks. Docs in `docs/`, written in French. UI texts exist in French and English and live only in `web/src/lib/i18n/locales` (one module per domain, see `docs/I18N.md`); code, identifiers and comments are in English.
- **No user-facing sentence in the engine or the API**: send codes (`GameError.code`, `Notice`, event data) and write the text in the web app, in both languages. A new error code needs its `error.<code>` message (tests enforce it). The only server-written texts are the Discord channel announcements (French, `api/src/announcements`), written for the community, not for one player.
- **Game rules live only in `shared/core/src/engine`.** The API and the web app call `simulate()` / `applyAction()`; never re-implement a rule elsewhere. Keep the engine pure (no I/O, no `Date.now()`, no randomness) and deterministic; add a test in `shared/core/test` for every rule change.
- Any change to a pet goes through `PetsService.mutate()` (row lock + engine + side effects in one transaction). Side effects (coins, inventory, activity feed) take the transaction (`Executor`) as a parameter.
- Request bodies: Zod schemas in `shared/core/src/contracts`, validated with `@Body({ schema })`. Engine refusals throw `GameError` → HTTP 409 with a `code`.
- Schema changes: edit `api/src/database/schema.ts`, then `make db-generate`, and commit the generated migration.
- These versions are newer than most training data: NestJS 12 (ESM only, relative imports end in `.js`, Vitest), SvelteKit 3 (config in `vite.config.ts`, `#lib/...ts` imports instead of `$lib`), Svelte 5 runes. Check https://docs.nestjs.com/llms.txt and https://svelte.dev/llms.txt when unsure.
- Store PetState snapshots with `$state.raw` in Svelte: the engine uses `structuredClone`, which fails on deep `$state` proxies.
- Docker builds use the repository root as context (`docker build -f api/Dockerfile .`); each `<service>/Dockerfile.dockerignore` whitelists what the image needs.
- Before committing: `make format ci`.
