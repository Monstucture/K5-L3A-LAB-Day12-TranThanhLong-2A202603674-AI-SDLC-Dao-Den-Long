#!/usr/bin/env bash
# Headless mode — forwards all arguments to the Simulation Core CLI.
# Usage: ./scripts/headless.sh --seed 1 --night 1 --ticks 600 --out evidence/headless/out.jsonl
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
exec node "$ROOT/src/cli.js" "$@"
