---
name: phase2-simulation
description: Use when changing or validating the shared three-night simulation, contract, or headless behavior.
---

# Phase 2 Simulation Workflow

## Architecture

- `src/core/simulation.js` is authoritative for both the browser and CLI. Keep
  gameplay, collision, timers, spawns, scoring, and random choices there.
- `src/game/` may present core state, but must not reproduce gameplay rules.
  GUI-only audio, particles, and scenery must not create headless entities or
  alter deterministic output.
- Treat `docs/phase2-spec.md`, the attached Phase 2 ticket, and
  `game.contract.json` as the contract sources. Keep baseline values in
  `src/core/tuning.js` synchronized with the JSON contract.

## Safe change procedure

1. Read the affected core, contract parser, CLI, GUI callers, and tests before
   editing.
2. Keep map-specific data in `NIGHT_MAPS`; pass the selected night into scenario
   validation so lantern IDs are validated against the correct map.
3. Keep `tick` (outer input/snapshot time) distinct from `sim_tick` (active
   gameplay time). A paused input advances only `tick`; timers, movement,
   spawns, and score remain frozen.
4. Use the seeded PRNG for every core random choice and process entities in
   stable ID order. Do not use wall-clock time or `Math.random()` in core code.
5. Add a focused headless scenario or regression for each changed mechanic,
   including boundary/edge behavior where relevant.
6. Run both test commands and measure the full-night headless budget:

   ```powershell
   npm test
   node tests/contract/edge-cases.js
   node src/cli.js --seed 1 --night 3 --ticks 21600 --out out.jsonl
   ```

## Useful examples

- A night-specific scenario check should receive the selected night:

  ```js
  const flags = parseScenario(scenarioRaw, tuning, opts.night);
  ```

- When adding a visual-only feature, render a snapshot field or event from the
  shared core; do not make a GUI-only copy of its state machine.
- For pause tests, assert both counters: outer `tick` advances while
  `sim_tick` and `time_left_s` remain unchanged.
