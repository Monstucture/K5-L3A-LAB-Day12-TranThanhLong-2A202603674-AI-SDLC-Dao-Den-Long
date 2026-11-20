# Phase 3 changelog — TICKET-03

## Breaking changes (Contract v1.2)

- `contract_version` is now `"1.2"`. Night duration is 240/270/300 seconds.
- Lantern state includes fuel, `ever_lit`, and `relit_count`. Lit lanterns
  consume fuel, can be refueled, extinguish at zero, and relight for five motes.
- Snapshots add lantern `fuel`, `ever_lit`, and `relit_count`, plus player
  `capacity`; shade state may now be `drain` and includes its target lantern ID.
- Scenarios accept lantern `fuel`/`ever_lit`, `player.successful_lights`, and
  `shades[].target_lantern_id`. A scenario lantern marked lit without explicit
  fuel starts at 100.
- New events: `refuel`, `lantern_out`, and periodic `fuel_drain`.
  `lantern_lit` now includes `relight`; `game_over.reason` uses
  `dawn_survived` instead of `all_lit`.
- Victory no longer occurs from lighting every lantern. At dawn, the player
  wins with at least 60% of the night’s lanterns lit; no flames still takes
  precedence. The Phase 2 time-left victory bonus is removed.
- Pickup no longer awards points. Deposited motes, first lights, relights,
  pulse hits, remaining lit fuel, and remaining flames use the v1.2 scoring
  table.
- Carry capacity increases by two per successful light/relight to a maximum
  of 20.

## Test updates

- HC-04 now asserts that pickup alone does not score.
- HC-19 and edge case E-07 no longer assert immediate all-lit victory; they
  advance to dawn and assert the new reason and bonus.
- The previous per-pickup score assertion in E-12 now expects zero.
- Added focused regressions for tick-accurate fuel decay, no-op full lanterns,
  refuel rounding/cap, relighting, capacity, weak-lantern targeting, stacked
  drains, drain-pulse scoring, safe-zone threshold/refuel ejection, and each
  night's dawn threshold.
- Unreplaced Phase 1–2 contract and regression tests remain enabled; none were
  skipped.
