#!/usr/bin/env bash
# Benchmark (Ticket-04): ./scripts/bench.sh --seed 42 --duration 30 --out bench.json
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -d node_modules/three ] || ./scripts/build.sh
exec node src/bench.js "$@"
