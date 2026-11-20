#!/usr/bin/env bash
# Build / prepare the project (install JS deps for the web GUI).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"
if [ ! -d node_modules/three ]; then
  npm install --no-audit --no-fund >/dev/null
fi
echo "Build OK. Game deps ready."
