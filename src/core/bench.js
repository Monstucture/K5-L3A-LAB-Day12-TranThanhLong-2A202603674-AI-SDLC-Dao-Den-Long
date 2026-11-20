/**
 * Benchmark scene (Ticket-04 §1). Shared by the GUI benchmark page and tests.
 * Night 1, 200 wandering shades spread over the island (seeded), 100 motes,
 * L1-L3 lit at fuel 100. The Core's `bench` flag removes spawns, damage,
 * pickups, fuel loss and the end condition; shades still move by the wander rule.
 */
import { Simulation } from './simulation.js';
import { createRng } from './random.js';
import { TUNING, NIGHT_MAPS } from './tuning.js';
import { parseScenario } from '../contract/scenario.js';

export const BENCH_SHADES = 200;
export const BENCH_MOTES = 100;

function diskPoint(rng, radius) {
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next()) * radius;
  return [Math.cos(angle) * r, 0, Math.sin(angle) * r];
}

export function createBenchSim(seed = 42, tuning = TUNING) {
  const rng = createRng(seed);
  const map = NIGHT_MAPS[1];
  const raw = {
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    motes: Array.from({ length: BENCH_MOTES }, () => diskPoint(rng, 36)),
    shades: Array.from({ length: BENCH_SHADES }, (_, i) => ({
      id: `S${i + 1}`,
      pos: diskPoint(rng, 38),
      state: 'wander',
    })),
    lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, pos: map.lanterns[id], lit: true, fuel: tuning.fuel_max, ever_lit: true })),
  };
  const flags = parseScenario(raw, tuning, 1);
  flags.playerPos = [0, 0, 0];
  return new Simulation(tuning, seed, flags, { night: 1, bench: true });
}

/** Camera path: circle radius 30 at height 15, counter-clockwise from above, 15 s per lap, starts at (30,15,0). */
export function benchCamera(tSeconds) {
  const a = (tSeconds / 15) * Math.PI * 2;
  // Looking down at XZ with +X right and +Z toward the viewer's bottom, counter-clockwise goes X -> -Z.
  return [30 * Math.cos(a), 15, -30 * Math.sin(a)];
}
