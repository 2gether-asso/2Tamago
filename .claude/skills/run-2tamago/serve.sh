#!/usr/bin/env bash
# Starts/stops the built API (in-memory DB, fast clock) and the Vite dev server for the web app.
# Usage: serve.sh start | stop   (run from the repository root)
set -euo pipefail
API_PORT=3100
WEB_PORT=4322
RUN=${TMPDIR:-/tmp}/2tamago-run
mkdir -p "$RUN"

case "${1:-}" in
  start)
    [ -f api/dist/main.js ] || pnpm build
    (cd api && PORT=$API_PORT DATABASE_URL=memory:// AUTH_SECRET=e2e-secret-e2e-secret-e2e-secret-e2e \
      AUTH_DEV_LOGIN=true GAME_TIME_SCALE=120 GAME_DEPARTURE=false \
      nohup node dist/main.js >"$RUN/api.log" 2>&1 & echo $! >"$RUN/api.pid")
    (cd web && API_URL=http://localhost:$API_PORT \
      nohup pnpm exec vite dev --port $WEB_PORT --strictPort >"$RUN/web.log" 2>&1 & echo $! >"$RUN/web.pid")
    timeout 90 bash -c "until curl -sf http://localhost:$API_PORT/api/health >/dev/null; do sleep 1; done"
    timeout 90 bash -c "until curl -sf http://localhost:$WEB_PORT >/dev/null; do sleep 1; done"
    echo "up: web http://localhost:$WEB_PORT, api http://localhost:$API_PORT (logs in $RUN)"
    ;;
  stop)
    # The pid files hold the `pnpm`/`node` wrappers; walk /proc to also stop their children.
    for f in "$RUN"/api.pid "$RUN"/web.pid; do
      [ -f "$f" ] || continue
      root=$(cat "$f")
      for p in /proc/[0-9]*; do
        pid=${p#/proc/}
        [ "$(awk '{print $4}' "$p/stat" 2>/dev/null)" = "$root" ] && kill "$pid" 2>/dev/null || true
      done
      kill "$root" 2>/dev/null || true
      rm -f "$f"
    done
    echo stopped
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
