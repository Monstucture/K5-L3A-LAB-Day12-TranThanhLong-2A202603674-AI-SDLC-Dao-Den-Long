# ADR-003: Lantern fuel and dawn-survival victory

- Status: Accepted
- Date: 2026-11-20
- Contract: v1.2

## Context

Playtests showed that lighting every lantern ended a night too early. Phase 3
changes the goal to keeping enough lanterns lit until dawn, which requires
lanterns to consume and accept fuel and allows Bóng Mực to drain weak lights.

## Decisions

1. A lantern stores fuel as integer 1/60-unit ticks (`fuelTicks`). One active
   simulation tick removes one unit; each draining shade removes five. Fuel is
   converted and rounded to one decimal only at the snapshot/event boundary.
2. `lit` is derived from positive fuel during play. Extinguishing sets fuel and
   `deposited` to zero but preserves `ever_lit`; the next successful lighting
   costs five motes and increments `relit_count`.
3. Only wander shades select lantern targets. They prefer the nearest lit
   lantern below 30 fuel, then the nearest unlit lantern. Drain states retain
   their target; fuel loss, pulse handling, and safe-zone transitions remain in
   the shared Simulation Core so GUI and headless behavior stay identical.
4. A night ends only at zero remaining time, after that tick's gameplay and
   fuel updates. No flames takes precedence; otherwise, at least
   `ceil(0.6 × lantern count)` lit lanterns wins with `dawn_survived`.
5. Capacity is derived from successful in-night lights (including relights),
   not scenario-prelit lanterns, and is capped at 20.

## Consequences

- Contract v1.2 snapshots add lantern fuel/history and player capacity; the
  scenario accepts fuel/history and shade target IDs.
- Early all-lit victory and time-left scoring are removed. A lit lantern may
  extinguish, lose its safe zone, and be restored by refueling or relighting.
- Contract/regression tests that asserted pickup points, immediate all-lit
  wins, or the Phase 2 win bonus were updated to assert the replacement rules.
  Phase 1–2 mechanics not replaced by this ticket remain covered.
- `game.contract.json`, runtime tuning, README, and headless tests must remain
  synchronized at v1.2.
