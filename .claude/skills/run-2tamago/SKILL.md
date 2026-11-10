---
name: run-2tamago
description: Build, run, start, test and screenshot 2Tamago (NestJS API + SvelteKit web app). Use when asked to run the app, see a UI or sprite change working, or take a screenshot of the pet, the adoption form or any page.
---

2Tamago is a virtual-pet game: a NestJS API (in-memory PGlite DB) and a SvelteKit SPA. Agents drive it
headless: `serve.sh` starts both services, `driver.mjs` (Playwright + the Chromium already in
`~/.cache/ms-playwright`) signs in, adopts a pet and takes screenshots. There is no `chromium-cli` here.

All paths are relative to the repository root.

## Prerequisites

```bash
pnpm install
pnpm build   # the API runs from api/dist; serve.sh builds it if missing, so rebuild after API changes
```

## Run (agent path)

```bash
.claude/skills/run-2tamago/serve.sh start          # API :3100, web :4322 (Vite dev, hot reload)
mkdir -p /tmp/shots
node .claude/skills/run-2tamago/driver.mjs Kame /tmp/shots   # species label as shown in the form
.claude/skills/run-2tamago/serve.sh stop
```

The driver writes `adopt.png` (adoption form with the species selected) and `pet.png` (pet page, after
hatching) in the given folder, and prints page errors. **Look at the screenshots.** To see something
else, copy the driver and add steps after the hatch (Playwright `page` API; texts are French:
`locale: 'fr-FR'`). Svelte edits show up without restarting; engine (`shared/core`) or API edits need
`pnpm build` and a restart.

## Run (human path)

`make dev` runs the engine (watch), the API on :3000 and the web app on :4321, with a real login flow.
It never returns, so it is of no use headless.

## Test

`make format ci` (format check, lint, build, type check, all tests). Browser tests: `make test-e2e`.

## Gotchas

- `AUTH_DEV_LOGIN=true` is what makes the `/login` page accept a bare nickname; `serve.sh` sets it.
- `GAME_TIME_SCALE=120` makes the clock 120x faster: an egg hatches in ~3 s, a night comes quickly (the
  pet may be asleep with the lights-off banner in screenshots) and stats move while you look.
- One living pet per player: the driver uses a new nickname each run. The DB is in memory, so a
  restart wipes everything.
- `lsof`, `ss` and `chromium-cli` are not installed; `serve.sh stop` walks `/proc` instead.
  Do not `pkill -f` a broad pattern: it can match your own shell and kill the session.
- Sprite tails use the CSS class `.tail` (`transform-box: fill-box`, origin left): a `transform=` rotation
  attribute on such an element pivots from the wrong point and moves it sideways. Check any new
  animated sprite part visually.

## Troubleshooting

- Driver times out on "Adopter un compagnon": that nickname already has a pet (fixed names only).
- `serve.sh start` hangs: read `/tmp/2tamago-run/api.log` and `web.log`; a busy port means a previous
  run was not stopped (`serve.sh stop`).
- A full `make ci` may kill one API e2e worker with SIGKILL (memory pressure); re-run that file alone with
  `pnpm --filter @2tamago/api exec vitest run --config ./vitest.config.e2e.ts <file>`.
