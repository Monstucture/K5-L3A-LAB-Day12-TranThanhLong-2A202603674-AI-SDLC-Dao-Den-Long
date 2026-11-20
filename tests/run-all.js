/**
 * Test Contract v1.0 acceptance tests (HC-01 … HC-23) + regression.
 * Run with:  node tests/run-all.js   (or  npm test)
 */
import assert from 'node:assert';
import { runHeadless } from '../src/cli.js';
import { Simulation } from '../src/core/simulation.js';
import { TUNING } from '../src/core/tuning.js';

const FAILURES = [];
let count = 0;
function test(name, fn) {
  count++;
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    FAILURES.push(name);
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

function run(opts) {
  const res = runHeadless({ seed: 1, night: '1', ticks: 100, snapshotEvery: 10, ...opts });
  res.objs = res.lines.map(JSON.parse);
  return res;
}
const events = (objs) => objs.filter((o) => o.type !== 'snapshot' && o.type !== 'end');
const snapshots = (objs) => objs.filter((o) => o.type === 'snapshot');
const countEvents = (objs, t) => events(objs).filter((o) => o.type === t).length;
const approx = (a, b, e) => assert.ok(Math.abs(a - b) <= (e === undefined ? 1e-6 : e), `${a} != ${b}`);

const NO_WORLD = {
  random_motes: false,
  random_shades: false,
  motes: [],
  shades: [],
};

console.log('\n=== Contract v1.0 tests ===');

// ---------------------------------------------------------------- HC-01
test('HC-01 same seed twice → byte-identical output', () => {
  const a = run({ seed: 7, ticks: 1200, scenarioRaw: null, inputsRaw: null, out: 'evidence/headless/hc01_a.jsonl' });
  const b = run({ seed: 7, ticks: 1200, scenarioRaw: null, inputsRaw: null, out: 'evidence/headless/hc01_b.jsonl' });
  assert.strictEqual(a.exitCode, 0);
  assert.strictEqual(a.lines.length, b.lines.length);
  for (let i = 0; i < a.lines.length; i++) assert.strictEqual(a.lines[i], b.lines[i]);
});

// ---------------------------------------------------------------- HC-02
test('HC-02 --ticks N (no end) → end.ticks == N, state playing', () => {
  const r = run({ seed: 3, ticks: 600, scenarioRaw: NO_WORLD });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.ticks, 600);
  assert.strictEqual(r.objs.at(-1).state, 'playing');
  assert.strictEqual(r.objs.at(-1).ticks, 600);
});

// ---------------------------------------------------------------- HC-03
test('HC-03 snapshot cadence (tick 0 + every 10)', () => {
  const r = run({ seed: 3, ticks: 50, snapshotEvery: 10, scenarioRaw: NO_WORLD });
  const ticks = snapshots(r.objs).map((s) => s.sim_tick);
  assert.deepStrictEqual(ticks, [0, 10, 20, 30, 40, 50]);
});

// ---------------------------------------------------------------- HC-04
test('HC-04 mote in pickup radius → picked, carried+1, mote_picked, +10', () => {
  const r = run({
    ticks: 5,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 0 }, ...NO_WORLD, motes: [[1, 0, 0]] },
  });
  const s5 = snapshots(r.objs).find((s) => s.tick === 5);
  assert.strictEqual(s5.player.carried, 1);
  assert.strictEqual(s5.motes_active, 0);
  assert.strictEqual(s5.score, 10);
  assert.strictEqual(countEvents(r.objs, 'mote_picked'), 1);
});

// ---------------------------------------------------------------- HC-05
test('HC-05 carried full → mote not picked, no score', () => {
  const r = run({
    ticks: 5,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: TUNING.carry_capacity }, ...NO_WORLD, motes: [[0.5, 0, 0]] },
  });
  const s5 = snapshots(r.objs).find((s) => s.tick === 5);
  assert.strictEqual(s5.player.carried, TUNING.carry_capacity);
  assert.strictEqual(s5.motes_active, 1);
  assert.strictEqual(s5.score, 0);
  assert.strictEqual(countEvents(r.objs, 'mote_picked'), 0);
});

// ---------------------------------------------------------------- HC-06
test('HC-06 move with cam_yaw 0 preserves +X/+Z, speed == player_speed', () => {
  const fwd = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 0 }] } });
  const p = snapshots(fwd.objs).find((s) => s.tick === 60).player.pos;
  approx(p[0], 6, 0.01);
  assert.strictEqual(p[2], 0);
  const strafe = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 0 }] } });
  const q = snapshots(strafe.objs).find((s) => s.tick === 60).player.pos;
  assert.strictEqual(q[0], 0);
  approx(q[2], 6, 0.01);
});

// ---------------------------------------------------------------- HC-07
test('HC-07 move vector length > 1 → normalized (speed stays player_speed)', () => {
  const r = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 0 }] } });
  const p = snapshots(r.objs).find((s) => s.tick === 60).player.pos;
  approx(Math.hypot(p[0], p[2]), TUNING.player_speed, 0.01); // 6, not 8.49
});

// ---------------------------------------------------------------- HC-08
test('HC-08 jump edge false→true jumps; holding true does not re-jump', () => {
  const sim = new Simulation(TUNING, 1, NO_WORLD);
  sim.input.jump = true;
  let maxY = 0;
  let lastAir = -1;
  for (let i = 0; i < 300; i++) {
    sim.step();
    if (sim.player.pos[1] > 0.01) lastAir = i;
    maxY = Math.max(maxY, sim.player.pos[1]);
  }
  assert.ok(maxY > 0.5, `expected a jump, maxY=${maxY}`);
  // After the single jump's landing, holding true must not re-jump.
  assert.ok(lastAir >= 0, 'should have been airborne');
  for (let j = lastAir + 1; j < 300; j++) {
    assert.strictEqual(sim.player.grounded, true);
    assert.strictEqual(sim.player.pos[1], 0);
  }
});

// ---------------------------------------------------------------- HC-09 / HC-11
test('HC-09/11 deposit in radius lights lantern once (+100, one lantern_lit)', () => {
  const r = run({
    ticks: 3,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 20], carried: 5 }, ...NO_WORLD },
    inputsRaw: { frames: [{ tick: 0, interact: true }] },
  });
  const dep = events(r.objs).find((o) => o.type === 'deposit');
  assert.ok(dep, 'expected deposit event');
  assert.strictEqual(dep.data.lantern_id, 'L1');
  assert.strictEqual(dep.data.amount, 5);
  assert.strictEqual(dep.data.deposited, 5);
  assert.strictEqual(countEvents(r.objs, 'lantern_lit'), 1);
  const s = snapshots(r.objs).find((x) => x.tick === 1);
  assert.strictEqual(s.player.carried, 0);
  assert.ok(s.lanterns.find((l) => l.id === 'L1').lit);
  assert.ok(s.score >= 100);
});

// ---------------------------------------------------------------- HC-10
test('HC-10 interact outside radius / no light → no deposit, no cost', () => {
  const far = run({ ticks: 3, snapshotEvery: 1, scenarioRaw: { player: { pos: [0, 0, 0], carried: 5 }, ...NO_WORLD }, inputsRaw: { frames: [{ tick: 0, interact: true }] } });
  assert.strictEqual(countEvents(far.objs, 'deposit'), 0);
  assert.strictEqual(snapshots(far.objs).find((s) => s.tick === 1).player.carried, 5);
  const empty = run({ ticks: 3, snapshotEvery: 1, scenarioRaw: { player: { pos: [0, 0, 20], carried: 0 }, ...NO_WORLD }, inputsRaw: { frames: [{ tick: 0, interact: true }] } });
  assert.strictEqual(countEvents(empty.objs, 'deposit'), 0);
  assert.strictEqual(snapshots(empty.objs).find((s) => s.tick === 1).player.carried, 0);
});

// ---------------------------------------------------------------- HC-12
test('HC-12 pulse with enough light → costs 2, stuns+pushes shade, event IDs, +20', () => {
  const r = run({
    ticks: 3,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 5 }, ...NO_WORLD, shades: [{ id: 'S1', pos: [2, 0, 0] }] },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  const pulse = events(r.objs).find((o) => o.type === 'pulse');
  assert.ok(pulse, 'expected pulse event');
  assert.deepStrictEqual(pulse.data.stunned_ids, ['S1']);
  const s = snapshots(r.objs).find((x) => x.tick === 1);
  assert.strictEqual(s.player.carried, 3);
  assert.strictEqual(s.shades[0].state, 'stunned');
  assert.ok(s.shades[0].pos[0] > 2, 'shade should be pushed outward');
  assert.ok(s.score >= 20);
});

// ---------------------------------------------------------------- HC-13
test('HC-13 pulse no light / on cooldown → no cost, no pulse event', () => {
  const poor = run({ ticks: 3, snapshotEvery: 1, scenarioRaw: { player: { pos: [0, 0, 0], carried: 0 }, ...NO_WORLD }, inputsRaw: { frames: [{ tick: 0, pulse: true }] } });
  assert.strictEqual(countEvents(poor.objs, 'pulse'), 0);
  assert.strictEqual(snapshots(poor.objs).find((s) => s.tick === 1).player.carried, 0);
  const cd = run({
    ticks: 5,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 9 }, ...NO_WORLD },
    inputsRaw: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }] },
  });
  assert.strictEqual(countEvents(cd.objs, 'pulse'), 1); // only first pulse (2 ticks < 1s cooldown)
  assert.strictEqual(snapshots(cd.objs).find((s) => s.tick === 3).player.carried, 7);
});

// ---------------------------------------------------------------- HC-14 / HC-16
test('HC-14/16 shade in hit radius → -1 flame, dropped=0, invuln stops multi-hit', () => {
  const r = run({
    ticks: 50,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 3 }, ...NO_WORLD, shades: [{ id: 'S1', pos: [0.9, 0, 0] }, { id: 'S2', pos: [0.9, 0, 0.9] }] },
  });
  const hits = events(r.objs).filter((o) => o.type === 'player_hit');
  assert.strictEqual(hits.length, 1, 'expected exactly one hit during invuln window');
  assert.strictEqual(hits[0].data.by, 'shade');
  assert.strictEqual(hits[0].data.flames, 2);
  assert.strictEqual(hits[0].data.dropped, 0);
});

// ---------------------------------------------------------------- HC-15
test('HC-15 standing in safe radius → shade gives no hit & does not enter', () => {
  const r = run({
    ticks: 50,
    scenarioRaw: {
      player: { pos: [0, 0, 21] },
      ...NO_WORLD,
      lanterns: [{ id: 'L1', pos: [0, 0, 22], lit: true }],
      shades: [{ id: 'S1', pos: [0, 5, 0] }],
    },
  });
  assert.strictEqual(countEvents(r.objs, 'player_hit'), 0);
  const last = snapshots(r.objs).at(-1);
  const shadeDist = Math.hypot(last.shades[0].pos[0] - 0, last.shades[0].pos[2] - 22);
  assert.ok(shadeDist >= TUNING.safe_radius - 0.01, `shade entered safe zone (dist ${shadeDist})`);
});

// ---------------------------------------------------------------- HC-17
test('HC-17 flames 0 → lost / no_flames, exactly one game_over', () => {
  const r = run({
    ticks: 200,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 0, flames: 1 }, ...NO_WORLD, shades: [{ id: 'S1', pos: [0.5, 0, 0] }] },
  });
  const gos = events(r.objs).filter((o) => o.type === 'game_over');
  assert.strictEqual(gos.length, 1);
  assert.deepStrictEqual(gos[0].data, { result: 'lost', reason: 'no_flames' });
  assert.strictEqual(r.objs.at(-1).state, 'lost');
});

// ---------------------------------------------------------------- HC-18
test('HC-18 time out → lost / dawn', () => {
  const r = run({ ticks: 60, scenarioRaw: { ...NO_WORLD, time_left_s: 0.05 } });
  const gos = events(r.objs).filter((o) => o.type === 'game_over');
  assert.strictEqual(gos.length, 1);
  assert.deepStrictEqual(gos[0].data, { result: 'lost', reason: 'dawn' });
});

// ---------------------------------------------------------------- HC-19
test('HC-19 light 5th lantern → won / all_lit (+win bonus)', () => {
  const r = run({
    ticks: 10,
    scenarioRaw: {
      player: { pos: [-20.9, 0, 6.8], carried: 5 },
      ...NO_WORLD,
      lanterns: [
        { id: 'L1', pos: [0, 0, 22], lit: true },
        { id: 'L2', pos: [20.9, 0, 6.8], lit: true },
        { id: 'L3', pos: [12.9, 0, -17.8], lit: true },
        { id: 'L4', pos: [-12.9, 0, -17.8], lit: true },
      ],
    },
    inputsRaw: { frames: [{ tick: 0, interact: true }] },
  });
  const last = r.objs.at(-1);
  assert.strictEqual(last.state, 'won');
  assert.strictEqual(countEvents(r.objs, 'game_over'), 1);
  assert.deepStrictEqual(events(r.objs).find((o) => o.type === 'game_over').data, { result: 'won', reason: 'all_lit' });
  // 100 (L5 lit) + floor(300 - 1/60)*2 + 3*50 = 848
  assert.strictEqual(last.score, 848);
});

// ---------------------------------------------------------------- HC-20
test('HC-20 scenario pre-lit lantern → no lantern_lit, no score at setup', () => {
  const r = run({ ticks: 50, scenarioRaw: { ...NO_WORLD, lanterns: [{ id: 'L1', pos: [0, 0, 22], lit: true }] } });
  assert.strictEqual(countEvents(r.objs, 'lantern_lit'), 0);
  assert.strictEqual(snapshots(r.objs)[0].score, 0);
});

// ---------------------------------------------------------------- HC-21
test('HC-21 invalid scenario/inputs → exit code 2, error, no valid output', () => {
  const badPos = run({ scenarioRaw: { player: { pos: [0, 0] } } });
  assert.strictEqual(badPos.exitCode, 2);
  assert.ok(badPos.error);
  assert.strictEqual(badPos.lines.length, 0);
  const badInputs = run({ inputsRaw: { frames: [{ tick: 0, move: [5, 0] }] } });
  assert.strictEqual(badInputs.exitCode, 2);
});

// ---------------------------------------------------------------- HC-22
test('HC-22 random_shades=false & empty shades → no auto spawn', () => {
  const r = run({ ticks: 650, scenarioRaw: { ...NO_WORLD, random_shades: false, shades: [] } });
  assert.strictEqual(countEvents(r.objs, 'shade_spawned'), 0);
  assert.deepStrictEqual(snapshots(r.objs).at(-1).shades, []);
});

// ---------------------------------------------------------------- REGRESSION
test('REGRESSION dash input field is ignored safely (exit 0)', () => {
  const dashR = run({ ticks: 5, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 0], dash: true }] } });
  assert.strictEqual(dashR.exitCode, 0);
  assert.strictEqual(countEvents(dashR.objs, 'dash'), 0);
});

test('REGRESSION empty config {} (GUI path) → sensible defaults (40 motes, 3 flames, random shades)', () => {
  const sim = new Simulation(TUNING, 42, {});
  assert.strictEqual(sim.player.carried, 0);
  assert.strictEqual(sim.player.flames, 3);
  assert.strictEqual(sim.motes.length, 40);
  assert.strictEqual(sim.randomShades, true);
  assert.strictEqual(sim.timeLeft(), TUNING.night1_duration_s);
});

// ---------------------------------------------------------------- HC-23 body (cosmetic)
test('HC-23 cosmetic VFX → no extra entities in headless output', () => {
  const r = run({
    ticks: 30,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 3 }, ...NO_WORLD, motes: [[1, 0, 0]] },
  });
  const types = new Set(events(r.objs).map((o) => o.type));
  const allowed = new Set(['mote_picked', 'deposit', 'lantern_lit', 'pulse', 'player_hit', 'shade_spawned', 'game_over']);
  for (const t of types) assert.ok(allowed.has(t), `unexpected event type ${t} (decorative entity leaking into headless)`);
});

// ---------------------------------------------------------------- regression: tuning sync
test('REGRESSION game.contract.json tuning matches core TUNING', async () => {
  const { loadContractTuning } = await import('../src/cli.js');
  const fs = (await import('node:fs')).default;
  const contract = JSON.parse(fs.readFileSync('./game.contract.json', 'utf8'));
  assert.deepStrictEqual(contract.tuning, loadContractTuning());
  assert.strictEqual(contract.contract_version, '1.0');
});

console.log(`\n${count - FAILURES.length}/${count} passed${FAILURES.length ? ` (FAILED: ${FAILURES.join(', ')})` : ''}`);
process.exitCode = FAILURES.length ? 1 : 0;
