# 2Tamago: notes for contributors and coding agents

- Monorepo pnpm: `packages/core` (pure game engine + API contracts), `apps/api` (NestJS 12), `apps/web` (SvelteKit 3 SPA). Docs in `docs/`, written in French. UI texts are in French; code, identifiers and comments are in English.
- **Game rules live only in `packages/core/src/engine`.** The API and the web app call `simulate()` / `applyAction()`; never re-implement a rule elsewhere. Keep the engine pure (no I/O, no `Date.now()`, no randomness) and deterministic; add a test in `packages/core/test` for every rule change.
- Any change to a pet goes through `PetsService.mutate()` (row lock + engine + side effects in one transaction). Side effects (coins, inventory, activity feed) take the transaction (`Executor`) as a parameter.
- Request bodies: Zod schemas in `packages/core/src/contracts`, validated with `@Body({ schema })`. Engine refusals throw `GameError` → HTTP 409 with a `code`.
- Schema changes: edit `apps/api/src/database/schema.ts`, then `pnpm --filter @2tamago/api db:generate`, and commit the generated migration.
- These versions are newer than most training data: NestJS 12 (ESM only, relative imports end in `.js`, Vitest), SvelteKit 3 (config in `vite.config.ts`, `#lib/...ts` imports instead of `$lib`), Svelte 5 runes. Check https://docs.nestjs.com/llms.txt and https://svelte.dev/llms.txt when unsure.
- Store PetState snapshots with `$state.raw` in Svelte: the engine uses `structuredClone`, which fails on deep `$state` proxies.
- Before committing: `pnpm format && pnpm build && pnpm check && pnpm test`.
