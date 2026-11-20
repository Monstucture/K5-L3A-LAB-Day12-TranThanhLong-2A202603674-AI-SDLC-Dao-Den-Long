/**
 * Headless mode CLI — Test Contract v1.0 entry point.
 *
 * Usage:
 *   node src/cli.js --seed <int> --night 1 [--scenario <file.json>]
 *     [--inputs <file.json>] --ticks <int> --out <file.jsonl>
 *     [--snapshot-every <int>]
 *
 * Exit codes: 0 ok · 2 invalid scenario/inputs/args · 1 runtime error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from './core/simulation.js';
import { TUNING } from './core/tuning.js';
import { parseScenario, ScenarioError } from './contract/scenario.js';
import { parseInputs, InputError } from './contract/inputs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

export function loadContractTuning() {
  const p = path.join(REPO_ROOT, 'game.contract.json');
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (raw && raw.tuning) return raw.tuning;
  } catch (_) {
    /* fall back to builtin */
  }
  return TUNING;
}

/** Parse process argv into options; throws UsageError for invalid usage. */
export class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = { seed: null, night: null, ticks: null, out: null, scenario: null, inputs: null, snapshotEvery: 10 };
  const req = { '--seed': 'seed', '--night': 'night', '--ticks': 'ticks', '--out': 'out' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (req[a]) {
      const val = argv[++i];
      if (val === undefined) throw new UsageError(`${a} requires a value`);
      opts[req[a]] = val;
      continue;
    }
    if (a === '--scenario') {
      const v = argv[++i];
      if (v === undefined) throw new UsageError('--scenario requires a value');
      opts.scenario = v;
    } else if (a === '--inputs') {
      const v = argv[++i];
      if (v === undefined) throw new UsageError('--inputs requires a value');
      opts.inputs = v;
    } else if (a === '--snapshot-every') {
      const v = argv[++i];
      if (v === undefined) throw new UsageError('--snapshot-every requires a value');
      opts.snapshotEvery = v;
    } else throw new UsageError(`unknown arg: ${a}`);
  }
  // Validate
  if (opts.seed === null || !Number.isInteger(Number(opts.seed))) throw new UsageError('--seed must be an integer');
  opts.seed = Number(opts.seed);
  if (opts.night === null) throw new UsageError('--night is required');
  if (opts.night !== '1') throw new UsageError('Phase 1 only supports --night 1');
  if (opts.ticks === null || !Number.isInteger(Number(opts.ticks)) || Number(opts.ticks) < 0) {
    throw new UsageError('--ticks must be a non-negative integer');
  }
  opts.ticks = Number(opts.ticks);
  if (opts.out === null || typeof opts.out !== 'string') throw new UsageError('--out is required');
  let se = Number(opts.snapshotEvery);
  if (!Number.isInteger(se) || se <= 0) throw new UsageError('--snapshot-every must be a positive integer');
  opts.snapshotEvery = se;
  return opts;
}

function readOptional(p) {
  if (!p) return null;
  const p2 = path.resolve(REPO_ROOT, p);
  if (!fs.existsSync(p2)) throw new InputError(`input file not found: ${p}`);
  let text;
  try {
    text = fs.readFileSync(p2, 'utf8');
  } catch (e) {
    throw new InputError(`cannot read file ${p}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new InputError(`JSON parse error in ${p}: ${e.message}`);
  }
  return parsed;
}

/**
 * Run a headless simulation.
 * @returns {{exitCode:number, lines:string[], error:string|null, ticks:number}}
 */
export function runHeadless(opts) {
  const lines = [];
  try {
    const tuning = loadContractTuning();

    const scenarioRaw = opts.scenarioRaw !== undefined ? opts.scenarioRaw : readOptional(opts.scenario);
    const inputsRaw = opts.inputsRaw !== undefined ? opts.inputsRaw : readOptional(opts.inputs);
    const scenarioFlags = parseScenario(scenarioRaw, tuning);
    const frames = parseInputs(inputsRaw);

    const sim = new Simulation({ ...TUNING, ...tuning }, opts.seed, scenarioFlags);

    lines.push(JSON.stringify(sim.snapshotObject()));

    const snapshotEvery = opts.snapshotEvery;
    let frameIdx = 0;

    for (let k = 0; k < opts.ticks; k++) {
      if (sim.isOver()) break;
      // Apply input frames whose tick matches current step k.
      while (frameIdx < frames.length && frames[frameIdx].tick === k) {
        sim.applyInputFrame(frames[frameIdx]);
        frameIdx++;
      }
      sim.step();
      for (const ev of sim.events) {
        lines.push(JSON.stringify({ type: ev.name, tick: sim.simTick, data: ev.data }));
      }
      if (sim.simTick % snapshotEvery === 0) {
        lines.push(JSON.stringify(sim.snapshotObject()));
      }
    }

    const end = {
      type: 'end',
      ticks: sim.simTick,
      state: sim.gameState,
      score: sim.scoreValue,
    };
    lines.push(JSON.stringify(end));

    if (opts.out) {
      const outPath = path.resolve(REPO_ROOT, opts.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
    }
    return { exitCode: 0, lines, error: null, ticks: sim.simTick };
  } catch (e) {
    const isSchema = e instanceof ScenarioError || e instanceof InputError || e instanceof UsageError;
    return { exitCode: isSchema ? 2 : 1, lines: [], error: e.message || String(e), ticks: 0 };
  }
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(2);
  }
  const res = runHeadless(opts);
  if (res.error) {
    process.stderr.write(`error: ${res.error}\n`);
    process.exit(res.exitCode);
  }
  process.exit(0);
}

// Run when executed directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
