# Phase 2 — Ba hòn đảo (Test Contract v1.1)

This specification records acceptance criteria for Phase 2 features in the
ticket. The shared Simulation Core is authoritative; GUI-only rendering and
audio must not affect headless output.

## Feature acceptance criteria

1. **Gió Lạc**
   - On Nights 2 and 3, seeded runs spawn at most two drifters beginning at
     ticks 1200, 2400, and so on, with stable IDs.
   - A drifter chases only while the player carries at least five motes and is
     within 15 m; contact steals up to three motes without removing a flame.
   - A pulse sends a chasing drifter away without a theft. A pulse hitting a
     fleeing drifter carrying stolen motes creates dropped motes and emits the
     specified `drifter_drop` event.
   - Safe zones and player invulnerability do not block theft; headless
     snapshots contain active drifter state.

2. **Bùa Gió**
   - Default charm locations match the map for each night and pickup uses the
     mote XZ/height thresholds.
   - Pickup applies a 600-tick speed effect and removes dash cooldown while
     active; picking up another charm refreshes the effect.
   - Each charm returns after 2700 active simulation ticks; paused outer ticks
     do not reduce its timer.

3. **Three-night progression**
   - The menu introduces the correct night name and starts the matching map.
   - Winning advances to the next night with a fresh player state and carries
     forward scores from completed nights only.
   - Winning Night 3 presents the Bình Minh result and total score; losing
     permits replay of that night.

4. **Pause**
   - Esc/P and the pause control use the v1.1 rising-edge input.
   - While paused, outer `tick` advances but `sim_tick`, gameplay timers,
     entities, spawns, and score remain unchanged.
   - Continue, replay-night, settings, and return-to-menu controls work.

5. **Settings**
   - Volume and mouse sensitivity can be changed through Settings.
   - Both values persist across a page reload and are applied immediately.

6. **Audio**
   - GUI feedback is provided for pickup, charm, lantern, pulse, hit, jump,
     dash, win, loss, shade spawn, and the final ten seconds.
   - Audio volume follows the saved setting; no audio objects are created in
     headless mode.

7. **HUD**
   - The HUD displays flames, an `mm:ss` timer (red/flashing at 30 seconds or
     less), lit lantern count, cumulative score, ten mote slots, and dash/pulse
     cooldowns.
   - Near an unlit lantern, it shows the interaction and deposit progress.
     When the nearest unlit lantern is outside the view, an arrow points toward
     it.

8. **Palette, environment lighting, and maps**
   - Listed Phase 2 surfaces and entities use the ticket palette within the
     allowed per-channel tolerance.
   - Ambient light follows `0.15 + 0.55 * (lit lanterns / total lanterns)`.
   - Night 1 has a radius-40 island; Night 2 has two radius-28 islands, a
     narrow bridge, and two jump pads; Night 3 has its three height tiers,
     ramps, jump pad, and non-climbable bell tower.
   - Simulation collision/height rules, not render-only code, decide where the
     player and shades can move or land.

## Verification commands

```powershell
npm test
node tests/contract/edge-cases.js
node src/cli.js --seed 1 --night 3 --ticks 21600 --out out.jsonl
```

The full-night command should complete in 30 seconds or less on the test
machine. GUI-only scenery, sound, and celebratory particles must not change
headless snapshots or events.
