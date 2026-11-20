/**
 * Runtime tuning and physical/gameplay constants.
 *
 * IMPORTANT: The `TUNING` object below MUST exactly match the `tuning`
 * section of `game.contract.json`. The headless CLI loads `game.contract.json`
 * as the authoritative source and overrides these defaults at runtime, so they
 * are kept in sync. A regression test asserts the equality.
 */

export const TUNING = {
  player_speed: 6.0,
  carry_capacity: 10,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1.2,
  interact_radius: 2.0,
  pulse_cost: 2,
  pulse_radius: 6.0,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.0,
  pulse_stun_s: 2.5,
  pulse_push_m: 4.0,
  pulse_cooldown_s: 1.0,
  safe_radius: 6.0,
  shade_speed: 2.5,
  shade_hit_radius: 1.0,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 20,
    per_second_left: 2,
    per_flame_left: 50,
  },
};

// Fixed simulation cadence.
export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;

// Gameplay-only constants (not part of Test Contract tuning v1.0) — PRD §5.3.
export const JUMP_VELOCITY = 7.0; // m/s
export const GRAVITY = 20.0; // m/s^2

// Island / layout constants.
export const ISLAND_RADIUS = 30; // playable radius metres
export const LANTERN_POSITIONS = {
  L1: [0, 0, 22],
  L2: [20.9, 0, 6.8],
  L3: [12.9, 0, -17.8],
  L4: [-12.9, 0, -17.8],
  L5: [-20.9, 0, 6.8],
};
export const DEFAULT_MOTE_COUNT = 40;

// Default shade spawn schedule (random_shades = true), in sim ticks. PRD §8.3.
export const SHADE_SCHEDULE = [
  { id: 'S1', tick: 10 * TICKS_PER_SEC }, // 10s
  { id: 'S2', tick: 45 * TICKS_PER_SEC }, // 45s
  { id: 'S3', tick: 90 * TICKS_PER_SEC }, // 90s
];
