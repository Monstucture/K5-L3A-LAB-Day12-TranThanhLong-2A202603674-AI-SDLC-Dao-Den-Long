#!/usr/bin/env bash
# Run the GUI version (Three.js in the browser, served locally).
# Cross-platform: start a local static server and open the browser.
set -euo pipefail
# ./scripts/run.sh --export-leaderboard out.json  -> writes {"entries": [...]} and exits
if [ "${1:-}" = "--export-leaderboard" ]; then
  exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/leaderboard.js" --export "${2:?usage: --export-leaderboard <out.json>}"
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"

# Ensure deps are present.
if [ ! -d node_modules/three ]; then
  ./scripts/build.sh
fi

PORT="${PORT:-8080}"
URL="http://localhost:$PORT/"

node "$ROOT/src/game/server.js" "$PORT" &
SERVER_PID=$!

# Best-effort browser open.
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
elif command -v open >/dev/null 2>&1; then
  (sleep 1; open "$URL" >/dev/null 2>&1) &
elif command -v start >/dev/null 2>&1; then
  (sleep 1; start "$URL") &
else
  echo "Open this URL in your browser: $URL"
fi

echo "Game running at $URL  (press Ctrl+C to stop)"
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM
wait "$SERVER_PID"
