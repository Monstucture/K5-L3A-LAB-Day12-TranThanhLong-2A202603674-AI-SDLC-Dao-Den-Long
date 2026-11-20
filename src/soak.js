/**
 * Soak test (Ticket-04 §2): N consecutive headless Nights in one process with
 * seeded random input. Usage: node src/soak.js --seed 7 --nights 10 --out soak.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from './core/simulation.js';
import { createRng } from './core/random.js';
import { TUNING } from './core/tuning.js';

import v8 from 'node:v8';
import vm from 'node:vm';
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
// RSS is sampled after a forced collection so allocator noise is not mistaken for a leak.
const mb = () => { gc(); return rssMb(); };
const rssMb = () => Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;

/** Part of "loading": JIT-compile the hot loop so RSS is sampled at steady state, not mid-warm-up. */
function warmUp() {
  const sim = new Simulation(TUNING, 0, {}, { night: 1 });
  for (let i = 0; i < 1800; i++) sim.step();
}

export function runSoak({ seed, nights }) {
  warmUp();
  const started = Date.now();
  const results = [];
  let crashes = 0;
  let memStart = null;
  for (let i = 1; i <= nights; i++) {
    const night = ((i - 1) % 3) + 1;
    try {
      const sim = new Simulation(TUNING, seed + i, {}, { night });
      if (memStart === null) memStart = mb();
      const rng = createRng(seed + i);
      let dir = [0, 0];
      const limit = Math.ceil(sim.timeLeft() * 60) + 60;
      for (let tick = 0; tick < limit && !sim.isOver(); tick++) {
        if (tick % 30 === 0) {
          const a = rng.next() * Math.PI * 2;
          dir = rng.next() < 0.1 ? [0, 0] : [Math.cos(a), Math.sin(a)];
        }
        sim.input.move = dir.slice();
        sim.input.jump = rng.next() < 0.05;
        sim.input.dash = rng.next() < 0.03;
        sim.input.pulse = rng.next() < 0.02;
        sim.input.interact = rng.next() < 0.1;
        sim.step();
        if (sim.allEvents.length > 5000) sim.allEvents.length = 0; // soak never reads the cumulative log
      }
      results.push(sim.isOver() ? sim.gameState : 'timeout');
    } catch (err) {
      crashes += 1;
      results.push('crash');
      process.stderr.write(`night ${i} crashed: ${err.stack}\n`);
    }
  }
  return {
    nights,
    crashes,
    results,
    mem_start_mb: memStart ?? mb(),
    mem_end_mb: mb(),
    duration_s: Math.round(((Date.now() - started) / 1000) * 10) / 10,
  };
}

function main(argv) {
  const opt = { seed: 7, nights: 10, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') opt.seed = Number(argv[++i]);
    else if (argv[i] === '--nights') opt.nights = Number(argv[++i]);
    else if (argv[i] === '--out') opt.out = argv[++i];
    else { process.stderr.write(`unknown arg ${argv[i]}\n`); process.exit(2); }
  }
  if (!Number.isInteger(opt.seed) || !Number.isInteger(opt.nights) || opt.nights < 1 || !opt.out) {
    process.stderr.write('usage: node src/soak.js --seed <int> --nights <int> --out <file.json>\n');
    process.exit(2);
  }
  const report = runSoak(opt);
  fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
  fs.writeFileSync(opt.out, JSON.stringify(report) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(report.crashes === 0 && report.mem_end_mb <= 1.2 * report.mem_start_mb ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
