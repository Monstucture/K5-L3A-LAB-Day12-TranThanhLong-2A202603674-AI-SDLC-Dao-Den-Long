/**
 * Runtime tuning and fixed maps shared by the GUI and headless simulation.
 * The TUNING object must match game.contract.json.
 */
export const TUNING = {
  player_speed: 6.0,
  carry_capacity: 10,
  capacity_max: 20,
  lantern_cost: 10,
  fuel_max: 100,
  fuel_decay_per_s: 1.0,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  pickup_radius: 1.0,
  pickup_height: 1.5,
  interact_radius: 2.0,
  pulse_cost: 3,
  pulse_radius: 5.0,
  night1_duration_s: 240,
  night2_duration_s: 270,
  night3_duration_s: 300,
  flames: 3,
  invuln_ticks: 90,
  hit_drop_ratio: 0.5,
  pulse_stun_ticks: 120,
  pulse_push_m: 4.0,
  pulse_push_ticks: 15,
  pulse_cooldown_ticks: 180,
  safe_radius: 6.0,
  shade_speed: 4.0,
  night3_shade_speed: 4.5,
  shade_detect_radius: 12.0,
  shade_lose_radius: 18.0,
  shade_hit_radius: 1.0,
  shade_hit_height: 1.5,
  dash_speed: 14.0,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  dash_duration_ticks: 12,
  dash_cooldown_ticks: 90,
  mote_initial_count: 20,
  mote_max_count: 30,
  mote_spawn_interval_ticks: 240,
  mote_ttl_ticks: 480,
  drop_mote_min_radius: 1.5,
  drop_mote_max_radius: 2.5,
  fall_recover_ticks: 60,
  charm_duration_ticks: 600,
  charm_respawn_ticks: 2700,
  score: {
    per_mote: 5,
    per_lantern: 100,
    per_relight: 40,
    per_stun: 5,
    per_drain_stun: 15,
    per_dawn_lantern: 50,
    per_flame_left: 50,
  },
};

export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;

const radians = (degrees) => (degrees * Math.PI) / 180;
const ring = (radius, count, startDeg = 0, stepDeg = 360 / count, y = 0) =>
  Array.from({ length: count }, (_, i) => {
    const angle = radians(startDeg + i * stepDeg);
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });
const pointsAround = (center, points) => points.map(([x, y, z]) => [center[0] + x, y, center[1] + z]);

const NIGHT1_LANTERNS = {
  L1: [0, 0, 25],
  L2: [23.8, 0, 7.7],
  L3: [14.7, 0, -20.2],
  L4: [-14.7, 0, -20.2],
  L5: [-23.8, 0, 7.7],
};
const NIGHT2_LANTERNS = {
  L1: [0, 0, 20],
  L2: [17, 0, -10],
  L3: [-17, 0, -10],
  L4: [70, 0, 20],
  L5: [87, 0, -10],
  L6: [53, 0, -10],
};
const NIGHT3_LANTERNS = {
  L1: [0, 6, 6],
  L2: [18, 3, 10],
  L3: [-18, 3, 10],
  L4: [35, 0, -10],
  L5: [-35, 0, -10],
  L6: [20, 0, -35],
  L7: [-20, 0, -35],
};

export const NIGHT_MAPS = {
  1: {
    name: 'Đảo Bến',
    duration_s: TUNING.night1_duration_s,
    startPos: [0, 0, 0],
    lanterns: NIGHT1_LANTERNS,
    islands: [{ center: [0, 0], radius: 40, height: 0 }],
    bridges: [],
    ramps: [],
    platforms: [],
    towers: [],
    jumpPads: [],
    motePoints: [...ring(12, 8, 0, 45), ...ring(33, 16, 0, 22.5)].map((p) => p),
    shadeSpawnPoints: ring(37, 12, 15, 30),
    shadeStartTick: 300,
    shadeIntervalTicks: 480,
    maxShades: 6,
    shadeInitialCount: 2,
    shadeSpeed: TUNING.shade_speed,
    charmPoints: [],
    wind: false,
  },
  2: {
    name: 'Đảo Cau',
    duration_s: TUNING.night2_duration_s,
    startPos: [0, 0, 0],
    lanterns: NIGHT2_LANTERNS,
    islands: [{ center: [0, 0], radius: 28, height: 0 }, { center: [70, 0], radius: 28, height: 0 }],
    bridges: [{ minX: 26, maxX: 44, minZ: -2, maxZ: 2, height: 0 }],
    ramps: [],
    platforms: [],
    towers: [],
    jumpPads: [
      { pos: [20, 0, 18], radius: 1, velocityY: 14, velocityX: 24, velocityZ: 0 },
      { pos: [50, 0, -18], radius: 1, velocityY: 14, velocityX: -24, velocityZ: 0 },
    ],
    motePoints: [
      ...pointsAround([0, 0], [...ring(10, 4, 0, 90), ...ring(22, 8, 0, 45)]),
      ...pointsAround([70, 0], [...ring(10, 4, 0, 90), ...ring(22, 8, 0, 45)]),
    ],
    shadeSpawnPoints: [
      ...pointsAround([0, 0], ring(26, 8, 22.5, 45)),
      ...pointsAround([70, 0], ring(26, 8, 22.5, 45)),
    ],
    shadeStartTick: 300,
    shadeIntervalTicks: 420,
    maxShades: 8,
    shadeInitialCount: 2,
    shadeSpeed: TUNING.shade_speed,
    charmPoints: [[35, 0, 0]],
    wind: false,
  },
  3: {
    name: 'Đảo Chuông',
    duration_s: TUNING.night3_duration_s,
    startPos: [0, 6, 0],
    lanterns: NIGHT3_LANTERNS,
    islands: [{ center: [0, 0], radius: 45, height: 0 }],
    bridges: [],
    ramps: [
      { angleDeg: 30, width: 3, innerRadius: 24, outerRadius: 30, lowY: 0, highY: 3 },
      { angleDeg: 150, width: 3, innerRadius: 24, outerRadius: 30, lowY: 0, highY: 3 },
    ],
    platforms: [
      { kind: 'ring', center: [0, 0], innerRadius: 12, outerRadius: 24, minZ: 0, y: 3 },
      { kind: 'disk', center: [0, 0], radius: 8, y: 6 },
    ],
    towers: [{ pos: [0, 6, 0], radius: 2, height: 8 }],
    jumpPads: [{ pos: [0, 3, 13], radius: 1, velocityY: 12, velocityX: 0, velocityZ: -8 }],
    motePoints: [
      ...ring(34, 18, 0, 20),
      ...ring(18, 8, 20, 20, 3),
      ...ring(5, 4, 45, 90, 6),
    ],
    shadeSpawnPoints: ring(43, 16, 0, 22.5),
    shadeStartTick: 300,
    shadeIntervalTicks: 360,
    maxShades: 10,
    shadeInitialCount: 2,
    shadeSpeed: TUNING.night3_shade_speed,
    charmPoints: [[30, 0, 25], [-30, 0, 25]],
    wind: true,
  },
};

export const LANTERN_POSITIONS = NIGHT_MAPS[1].lanterns;
export const ISLAND_RADIUS = NIGHT_MAPS[1].islands[0].radius;
export const DEFAULT_MOTE_COUNT = TUNING.mote_initial_count;
export const MOTE_POINTS = NIGHT_MAPS[1].motePoints;
export const SHADE_SCHEDULE = [
  { id: 'S1', tick: 300 },
  { id: 'S2', tick: 300 },
];
