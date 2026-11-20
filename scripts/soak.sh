#!/usr/bin/env bash
# Soak test (Ticket-04): ./scripts/soak.sh --seed 7 --nights 10 --out soak.json
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec node src/soak.js "$@"
