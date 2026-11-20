/**
 * Extra contract edge-case regressions (beyond HC-01…HC-23).
 * Run from the repo root:  node tests/contract/edge-cases.js
 *
 * These cover behaviours that are easy to get subtly wrong and that the
 * official hidden tests may probe: pulse push direction, safe-zone escape,
 * overlapping zones, duplicate IDs, missing --night, pre-lit wins, stun
 * scoring, pickup ordering and time/clock semantics.
 */
import assert from 'node:assert';
import { runHeadless, parseArgs, UsageError } from '../../src/cli.js';
import { TUNING } from '../../src/core/tuning.js';

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

const NO_WORLD = { random_motes: false, random_shades: false, motes: [], shades: [] };
function run(opts) {
  const res = runHeadless({ seed: 1, night: '1', ticks: 100, snapshotEvery: 10, ...opts });
  res.objs = res.lines.map(JSON.parse);
  return res;
}
const events = (objs) => objs.filter((o) => o.type !== 'snapshot' && o.type !== 'end');
const snapshots = (objs) => objs.filter((o) => o.type === 'snapshot');
const countEvents = (objs, t) => events(objs).filter((o) => o.type === t).length;
const snapAt = (objs, tick) => snapshots(objs).find((s) => s.sim_tick === tick);
const xz = (p, c) => Math.hypot(p[0] - c[0], p[2] - c[2]);

console.log('\n=== Extra contract edge-case tests ===');

test('E-01 pulse pushes an already-far shade outward over 15 ticks', () => {
  const r = run({
    ticks: TUNING.pulse_push_ticks,
    snapshotEvery: TUNING.pulse_push_ticks,
    scenarioRaw: { ...NO_WORLD, player: { pos: [0, 0, 0], carried: 5 }, shades: [{ id: 'S1', pos: [4.9, 0, 0] }] },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  const s = snapAt(r.objs, TUNING.pulse_push_ticks);
  assert.strictEqual(s.shades[0].state, 'stunned');
  // The target starts within the 3D radius; push remains incremental for 15 ticks.
  assert.strictEqual(s.shades[0].pos[0], 8.9);
});

test('E-02 shade placed inside a safe zone is pushed out and can chase again', () => {
  const r = run({
    ticks: 40,
    snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 29] },
      lanterns: [{ id: 'L1', pos: [0, 0, 22], lit: true }],
      shades: [{ id: 'S1', pos: [0, 0, 22] }],
    },
  });
  const s1 = snapAt(r.objs, 1);
  const d1 = xz(s1.shades[0].pos, [0, 0, 22]);
  assert.ok(d1 > TUNING.safe_radius, `shade still inside zone after 1 tick (d=${d1})`);
  // It must not be frozen exactly on the boundary: it should chase the player.
  const s40 = snapAt(r.objs, 40);
  assert.ok(
    Math.abs(s40.shades[0].pos[0] - s1.shades[0].pos[0]) > 0.1 ||
      Math.abs(s40.shades[0].pos[2] - s1.shades[0].pos[2]) > 0.1,
    'shade appears stuck on the safe-zone boundary'
  );
});

test('E-03 overlapping safe zones: shade is pushed outside both', () => {
  const r = run({
    ticks: 10,
    snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0] },
      lanterns: [
        { id: 'L1', pos: [0, 0, 0], lit: true },
        { id: 'L2', pos: [3, 0, 0], lit: true },
      ],
      shades: [{ id: 'S1', pos: [1.5, 0, 0] }],
    },
  });
  const p = snapAt(r.objs, 10).shades[0].pos;
  assert.ok(xz(p, [0, 0, 0]) > TUNING.safe_radius, `inside L1 (d=${xz(p, [0, 0, 0])})`);
  assert.ok(xz(p, [3, 0, 0]) > TUNING.safe_radius, `inside L2 (d=${xz(p, [3, 0, 0])})`);
});

test('E-04 duplicate lantern id → exit 2', () => {
  const r = run({
    scenarioRaw: { ...NO_WORLD, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, { id: 'L1', pos: [0, 0, 2] }] },
  });
  assert.strictEqual(r.exitCode, 2);
  assert.ok(/duplicate lantern/i.test(r.error));
  assert.strictEqual(r.lines.length, 0);
});

test('E-05 duplicate shade id → exit 2', () => {
  const r = run({
    scenarioRaw: { ...NO_WORLD, shades: [{ id: 'S1', pos: [1, 0, 0] }, { id: 'S1', pos: [2, 0, 0] }] },
  });
  assert.strictEqual(r.exitCode, 2);
  assert.ok(/duplicate shade/i.test(r.error));
});

test('E-06 --night is required and accepts all three nights', () => {
  assert.throws(() => parseArgs(['--seed', '1', '--ticks', '5', '--out', 'x.jsonl']), UsageError);
  assert.throws(() => parseArgs(['--seed', '1', '--night', '4', '--ticks', '5', '--out', 'x.jsonl']), UsageError);
  const ok = parseArgs(['--seed', '1', '--night', '1', '--ticks', '5', '--out', 'x.jsonl']);
  assert.strictEqual(ok.night, 1);
  assert.strictEqual(parseArgs(['--seed', '1', '--night', '3', '--ticks', '5', '--out', 'x.jsonl']).night, 3);
});

test('E-07 all pre-lit lanterns do not end early; dawn awards fuel and flame bonus', () => {
  const r = run({
    ticks: 5,
    snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      time_left_s: 1 / 60,
      lanterns: [
        { id: 'L1', lit: true },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true },
      ],
    },
  });
  const last = r.objs.at(-1);
  assert.strictEqual(last.state, 'won');
  assert.strictEqual(countEvents(r.objs, 'lantern_lit'), 0);
  assert.deepStrictEqual(events(r.objs).find((event) => event.type === 'game_over').data, {
    result: 'won', reason: 'dawn_survived',
  });
  assert.strictEqual(last.score, 895);
  assert.strictEqual(snapAt(r.objs, 1).state, 'won');
});

test('E-08 lit:true without deposited normalises deposited to lantern_cost', () => {
  const r = run({ ticks: 1, snapshotEvery: 1, scenarioRaw: { ...NO_WORLD, lanterns: [{ id: 'L1', lit: true }] } });
  const s = snapAt(r.objs, 1);
  assert.strictEqual(s.lanterns[0].deposited, TUNING.lantern_cost);
  assert.strictEqual(s.lanterns[0].lit, true);
  assert.strictEqual(s.score, 0);
});

test('E-09 pulse with no shades still costs light and emits empty stunned_ids', () => {
  const r = run({
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: { ...NO_WORLD, player: { pos: [0, 0, 0], carried: 3 } },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  const pulse = events(r.objs).find((o) => o.type === 'pulse');
  assert.ok(pulse);
  assert.deepStrictEqual(pulse.data.stunned_ids, []);
  assert.strictEqual(snapAt(r.objs, 1).player.carried, 3 - TUNING.pulse_cost);
});

test('E-10 stunned shade cannot hit the player', () => {
  const r = run({
    ticks: 30,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0] },
      shades: [{ id: 'S1', pos: [0.5, 0, 0], state: 'stunned' }],
    },
  });
  // Scenario stun has zero duration, so it becomes chase and may hit later;
  // instead assert a pulse-stunned shade overlapping the player deals no hit.
  const r2 = run({
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: { ...NO_WORLD, player: { pos: [0, 0, 0], carried: 5 }, shades: [{ id: 'S1', pos: [0.5, 0, 0] }] },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  assert.strictEqual(countEvents(r2.objs, 'player_hit'), 0);
  assert.strictEqual(r2.objs.at(-1).state, 'playing');
});

test('E-11 each pulse awards per_stun score, including an already-stunned shade', () => {
  const r = run({
    ticks: 200,
    snapshotEvery: 1,
    scenarioRaw: { ...NO_WORLD, player: { pos: [0, 0, 0], carried: 10 }, shades: [{ id: 'S1', pos: [3, 0, 0] }] },
    inputsRaw: {
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
        { tick: 180, pulse: false },
        { tick: 181, pulse: true },
        { tick: 182, pulse: false },
      ],
    },
  });
  assert.strictEqual(countEvents(r.objs, 'pulse'), 2);
  const s = r.objs.at(-1);
  assert.strictEqual(s.score, 2 * TUNING.score.per_stun);
});

test('E-12 multiple motes in radius are collected in ascending id order', () => {
  const r = run({
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0], carried: 0 },
      motes: [[0.5, 0, 0], [-0.5, 0, 0], [0, 0, 0.5]],
    },
  });
  const picked = events(r.objs).filter((o) => o.type === 'mote_picked');
  assert.strictEqual(picked.length, 3);
  assert.deepStrictEqual(picked.map((e) => e.data.carried), [1, 2, 3]);
  assert.strictEqual(snapAt(r.objs, 1).score, 0);
});

test('E-13 time_left_s follows initial - sim_tick/60', () => {
  const r = run({ ticks: 120, snapshotEvery: 30, scenarioRaw: { ...NO_WORLD, time_left_s: 100 } });
  for (const s of snapshots(r.objs)) {
    assert.ok(Math.abs(s.time_left_s - (100 - s.sim_tick / 60)) < 0.0015, `tick ${s.sim_tick}: ${s.time_left_s}`);
  }
});

test('E-14 end record is always the last line and has the required shape', () => {
  for (const ticks of [0, 7, 120]) {
    const r = run({ ticks, scenarioRaw: NO_WORLD });
    const last = r.objs.at(-1);
    assert.strictEqual(last.type, 'end');
    assert.strictEqual(last.ticks, ticks);
    assert.ok(['playing', 'won', 'lost'].includes(last.state));
    assert.strictEqual(typeof last.score, 'number');
  }
});

test('E-15 explicit motes win over random_motes:true', () => {
  const r = run({
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: { ...NO_WORLD, random_motes: true, motes: [[10, 0, 10]] },
  });
  assert.strictEqual(snapshots(r.objs)[0].motes_active, 1);
});

test('E-16 cam_yaw_deg persists between frames (absent fields keep value)', () => {
  const r = run({
    ticks: 60,
    snapshotEvery: 60,
    scenarioRaw: NO_WORLD,
    inputsRaw: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 90 }] },
  });
  const p = snapAt(r.objs, 60).player.pos;
  // yaw 90°: input +x maps to +z (x' = x*cos+z*sin = 0, z' = -x*sin+z*cos = -x).
  assert.ok(Math.abs(p[0]) < 0.01, `x should stay ~0, got ${p[0]}`);
  assert.ok(Math.abs(p[2] + 5.75) < 0.02, `z should be ~-5.75 after acceleration, got ${p[2]}`);
});

test('E-17 dash input field still triggers the existing dash action', () => {
  const r = run({
    ticks: 2,
    scenarioRaw: NO_WORLD,
    inputsRaw: { frames: [{ tick: 0, move: [1, 0], dash: true }] },
  });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(countEvents(r.objs, 'dash'), 1);
});

test('E-18 v1.2 scenario validates fuel bounds, shade targets, and dynamic capacity', () => {
  const badFuel = run({ scenarioRaw: { ...NO_WORLD, lanterns: [{ id: 'L1', lit: true, fuel: 101 }] } });
  assert.strictEqual(badFuel.exitCode, 2);
  const badTarget = run({
    scenarioRaw: { ...NO_WORLD, shades: [{ id: 'S1', pos: [1, 0, 0], target_lantern_id: 'L9' }] },
  });
  assert.strictEqual(badTarget.exitCode, 2);
  const capacity = run({
    ticks: 0,
    scenarioRaw: { ...NO_WORLD, player: { successful_lights: 5, carried: 20 } },
  });
  assert.strictEqual(capacity.exitCode, 0);
  assert.strictEqual(snapAt(capacity.objs, 0).player.capacity, 20);
});

console.log(`\n${count - FAILURES.length}/${count} passed${FAILURES.length ? ` (FAILED: ${FAILURES.join(', ')})` : ''}`);
process.exitCode = FAILURES.length ? 1 : 0;
