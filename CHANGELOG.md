# Changelog

## [1.0.0] — Phase 4 · Bình minh (Contract v1.3)
- Benchmark mode (`./scripts/bench.sh`), soak test (`./scripts/soak.sh`), local leaderboard with CLI export (`./scripts/run.sh --export-leaderboard`).
- Accessibility: rebindable keys with conflict detection and defaults reset, captions + edge arrows for shade spawn / wind / last 10 s / low fuel, reduced motion, large text (×1.25), 18 px minimum UI text.
- Fix: the Dawn screen no longer flickers back to the Night 3 result; the result screen shows won-nights score only after a loss.
- `contract_version` 1.3, `game.contract.json` gains `bench_cmd` and `soak_cmd`. Simulation rules are unchanged; new `bench` option exists only for the benchmark scene.
- Docs: README (install, controls, tests, headless, bench, soak), CREDITS, LICENSE, retro.

## Phase 3 — Đèn cạn dầu (Contract v1.2)
Breaking: lantern fuel, relight for 5 motes, shade drain, dawn win (≥ 60 % lanterns lit), new scoring, rising capacity, night durations 240/270/300 s, colour-blind palette. See [docs/phase3-changelog.md](docs/phase3-changelog.md) and [ADR-003](docs/adr-003-lantern-fuel-and-dawn-win.md).
GUI: high follow camera, fog of war, HD-2D look, procedural BGM/SFX, foliage/paths/cliffs, light trail, pointer-lock mouse look.

## Phase 2 — Ba hòn đảo (Contract v1.1)
Three nights (Đảo Bến, Đảo Cau, Đảo Chuông), dash, Bùa Gió charm, Gió Lạc drifters, jump pads, ramps/tiers, wind, pause, settings, standard tuning numbers, shade schedule (2 at tick 300 on every night), palette. See [docs/phase2-spec.md](docs/phase2-spec.md).

## Phase 1 — Đêm 1 (Contract v1.0)
Deterministic Simulation Core shared by the Three.js GUI and the Node headless CLI; Night 1 map, motes, lanterns, pulse, Bóng Mực, scenarios, JSONL output.
