/**
 * Test Contract v1.2 acceptance tests (HC-01 … HC-23) + regression.
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

console.log('\n=== Contract v1.2 tests ===');

// ---------------------------------------------------------------- HC-01
test('HC-01 same seed twice → byte-identical output', () => {
  const a = run({ seed: 7, ticks: 1200, scenarioRaw: null, inputsRaw: null });
  const b = run({ seed: 7, ticks: 1200, scenarioRaw: null, inputsRaw: null });
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
test('HC-04 mote in pickup radius → picked and carried+1; pickup does not score', () => {
  const r = run({
    ticks: 5,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 0 }, ...NO_WORLD, motes: [[1, 0, 0]] },
  });
  const s5 = snapshots(r.objs).find((s) => s.tick === 5);
  assert.strictEqual(s5.player.carried, 1);
  assert.strictEqual(s5.motes_active, 0);
  assert.strictEqual(s5.score, 0);
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
test('HC-06 movement follows camera yaw at player_speed', () => {
  const fwd = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 0 }] } });
  const p = snapshots(fwd.objs).find((s) => s.tick === 60).player.pos;
  approx(p[0], 5.75, 0.01);
  assert.strictEqual(p[2], 0);
  const strafe = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 0 }] } });
  const q = snapshots(strafe.objs).find((s) => s.tick === 60).player.pos;
  assert.strictEqual(q[0], 0);
  approx(q[2], 5.75, 0.01);

  const turnedForward = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] } });
  const r = snapshots(turnedForward.objs).find((s) => s.tick === 60).player.pos;
  approx(r[0], 5.75, 0.01);
  assert.ok(Math.abs(r[2]) < 0.01);
  const turnedRight = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 90 }] } });
  const s = snapshots(turnedRight.objs).find((x) => x.tick === 60).player.pos;
  assert.ok(Math.abs(s[0]) < 0.01);
  approx(s[2], -5.75, 0.01);
});

// ---------------------------------------------------------------- HC-07
test('HC-07 move vector length > 1 → normalized (speed stays player_speed)', () => {
  const r = run({ ticks: 60, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 0 }] } });
  const p = snapshots(r.objs).find((s) => s.tick === 60).player.pos;
  assert.ok(Math.hypot(p[0], p[2]) <= TUNING.player_speed);
  assert.ok(Math.hypot(p[0], p[2]) > 5.5);
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
test('HC-09/11 deposit lights lantern and awards deposit and first-light points', () => {
  const r = run({
    ticks: 3,
    snapshotEvery: 1,
    scenarioRaw: { player: { pos: [0, 0, 23], carried: 10 }, ...NO_WORLD },
    inputsRaw: { frames: [{ tick: 0, interact: true }] },
  });
  const dep = events(r.objs).find((o) => o.type === 'deposit');
  assert.ok(dep, 'expected deposit event');
  assert.strictEqual(dep.data.lantern_id, 'L1');
  assert.strictEqual(dep.data.amount, 10);
  assert.strictEqual(dep.data.deposited, 10);
  assert.strictEqual(countEvents(r.objs, 'lantern_lit'), 1);
  assert.deepStrictEqual(events(r.objs).find((o) => o.type === 'lantern_lit').data, { lantern_id: 'L1', relight: false });
  const s = snapshots(r.objs).find((x) => x.tick === 1);
  assert.strictEqual(s.player.carried, 0);
  assert.ok(s.lanterns.find((l) => l.id === 'L1').lit);
  assert.strictEqual(s.player.capacity, 12);
  assert.strictEqual(s.score, 150);
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
test('HC-12 pulse costs 3, stuns+pushes shade, event IDs, +5', () => {
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
  assert.strictEqual(s.player.carried, 2);
  assert.strictEqual(s.shades[0].state, 'stunned');
  assert.ok(s.shades[0].pos[0] > 2, 'shade should be pushed outward');
  assert.ok(s.score >= 5);
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
  assert.strictEqual(snapshots(cd.objs).find((s) => s.tick === 3).player.carried, 6);
});

// ---------------------------------------------------------------- HC-14 / HC-16
test('HC-14/16 shade hit drops half the light and invulnerability stops multi-hit', () => {
  const r = run({
    ticks: 50,
    scenarioRaw: { player: { pos: [0, 0, 0], carried: 3 }, ...NO_WORLD, shades: [{ id: 'S1', pos: [0.9, 0, 0] }, { id: 'S2', pos: [0.9, 0, 0.9] }] },
  });
  const hits = events(r.objs).filter((o) => o.type === 'player_hit');
  assert.strictEqual(hits.length, 1, 'expected exactly one hit during invuln window');
  assert.strictEqual(hits[0].data.by, 'shade');
  assert.strictEqual(hits[0].data.flames, 2);
  assert.strictEqual(hits[0].data.dropped, 1);
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
test('HC-19 lighting every lantern does not end early; dawn survival awards the new bonus', () => {
  const r = run({
    ticks: 10,
    scenarioRaw: {
      player: { pos: [-23.8, 0, 7.7], carried: 10 },
      time_left_s: 1 / 60,
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
  assert.deepStrictEqual(events(r.objs).find((o) => o.type === 'game_over').data, { result: 'won', reason: 'dawn_survived' });
  assert.strictEqual(last.score, 1046);
});

// ---------------------------------------------------------------- HC-20
test('HC-20 scenario pre-lit lantern → no lantern_lit, no score at setup', () => {
  const r = run({ ticks: 50, scenarioRaw: { ...NO_WORLD, lanterns: [{ id: 'L1', pos: [0, 0, 22], lit: true }] } });
  assert.strictEqual(countEvents(r.objs, 'lantern_lit'), 0);
  assert.strictEqual(snapshots(r.objs)[0].score, 0);
});

test('v1.2 lit lantern fuel decays exactly one internal 1/60 unit per tick and extinguishes cleanly', () => {
  const sim = new Simulation(TUNING, 1, {
    playerPos: [0, 0, 0],
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 1, everLit: true }],
  });
  sim.step();
  assert.strictEqual(sim.lanterns[0].fuelTicks, 59);
  for (let i = 1; i < 60; i++) sim.step();
  assert.deepStrictEqual(sim.events.filter((event) => event.name === 'lantern_out').map((event) => event.data), [
    { lantern_id: 'L1' },
  ]);
  const lantern = sim.snapshotLanterns().find((entry) => entry.id === 'L1');
  assert.deepStrictEqual([lantern.lit, lantern.fuel, lantern.ever_lit, lantern.deposited], [false, 0, true, 0]);
});

test('v1.2 refueling rounds required motes up, awards five per mote, and caps fuel', () => {
  const r = run({
    ticks: 1, snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 25], carried: 1 },
      lanterns: [{ id: 'L1', lit: true, ever_lit: true, fuel: 95 }],
    },
    inputsRaw: { frames: [{ tick: 0, interact: true }] },
  });
  assert.deepStrictEqual(events(r.objs).find((event) => event.type === 'refuel').data, {
    lantern_id: 'L1', amount: 1, fuel: 100,
  });
  const snapshot = snapshots(r.objs).find((entry) => entry.tick === 1);
  assert.strictEqual(snapshot.player.carried, 0);
  assert.strictEqual(snapshot.score, 5);
  assert.strictEqual(snapshot.lanterns.find((entry) => entry.id === 'L1').fuel, 100);
});

test('v1.2 fuel below thirty loses its safe zone; refueling back above thirty repels shades', () => {
  const sim = new Simulation(TUNING, 1, {
    playerPos: [0, 0, 0],
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], drifters: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 29, everLit: true }],
    shades: [{ id: 'S1', pos: [0, 0, 24], state: 'drain', targetLanternId: 'L1' }],
  });
  assert.strictEqual(sim._playerInAnySafeZone(), false);
  sim.player.pos = [0, 0, 25];
  sim.player.carried = 1;
  sim.input.interact = true;
  sim.step();
  assert.ok(Math.hypot(sim.shades[0].pos[0], sim.shades[0].pos[2] - 25) > TUNING.safe_radius);
  assert.strictEqual(sim.shades[0].state, 'recoil');
  assert.strictEqual(sim._playerInAnySafeZone(), true);
});

test('v1.2 a full lantern is not selected for refueling', () => {
  const tuning = { ...TUNING, fuel_decay_per_s: 0 };
  const sim = new Simulation(tuning, 1, {
    playerPos: [0, 0, 25], carried: 1,
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 100, everLit: true }],
  });
  sim.input.interact = true;
  assert.strictEqual(sim.step().some((event) => event.name === 'refuel'), false);
  assert.strictEqual(sim.player.carried, 1);
});

test('v1.2 relighting costs five motes, counts capacity, and awards relight points', () => {
  const r = run({
    ticks: 1, snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 25], carried: 5 },
      lanterns: [{ id: 'L1', lit: false, fuel: 0, ever_lit: true }],
    },
    inputsRaw: { frames: [{ tick: 0, interact: true }] },
  });
  const lit = events(r.objs).find((event) => event.type === 'lantern_lit');
  assert.deepStrictEqual(lit.data, { lantern_id: 'L1', relight: true });
  const snapshot = snapshots(r.objs).find((entry) => entry.tick === 1);
  const lantern = snapshot.lanterns.find((entry) => entry.id === 'L1');
  assert.deepStrictEqual([lantern.lit, lantern.fuel, lantern.ever_lit, lantern.relit_count], [true, 100, true, 1]);
  assert.deepStrictEqual([snapshot.player.carried, snapshot.player.capacity, snapshot.score], [0, 12, 65]);
});

test('v1.2 capacity scales only with successful lights, capped at twenty', () => {
  const sim = new Simulation(TUNING, 1, {
    playerPos: [0, 0, 0],
    successfulLights: 6,
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 100, everLit: true }],
  });
  assert.strictEqual(sim.snapshotPlayer().capacity, 20);
  const prelit = new Simulation(TUNING, 1, {
    playerPos: [0, 0, 0],
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 100, everLit: true }],
  });
  assert.strictEqual(prelit.snapshotPlayer().capacity, 10);
});

test('v1.2 wander shades prioritize the nearest weak lit lantern over unlit lanterns', () => {
  const r = run({
    ticks: 1, snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0] },
      lanterns: [
        { id: 'L1', pos: [0, 0, 25], lit: true, ever_lit: true, fuel: 20 },
        { id: 'L2', pos: [21, 0, 25], lit: false, fuel: 0 },
      ],
      shades: [{ id: 'S1', pos: [20, 0, 25] }],
    },
  });
  assert.strictEqual(snapshots(r.objs).find((entry) => entry.tick === 1).shades[0].target_lantern_id, 'L1');
});

test('v1.2 draining shades stack five fuel units per second and emit 60-tick events', () => {
  const r = run({
    ticks: 60, snapshotEvery: 60,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0] },
      lanterns: [{ id: 'L1', lit: true, ever_lit: true, fuel: 20 }],
      shades: [
        { id: 'S1', pos: [0, 0, 24], state: 'drain', target_lantern_id: 'L1' },
        { id: 'S2', pos: [0.5, 0, 24], state: 'drain', target_lantern_id: 'L1' },
      ],
    },
  });
  const drains = events(r.objs).filter((event) => event.type === 'fuel_drain');
  assert.deepStrictEqual(drains.map((event) => event.data), [
    { lantern_id: 'L1', shade_id: 'S1', fuel: 9 },
    { lantern_id: 'L1', shade_id: 'S2', fuel: 9 },
  ]);
  assert.strictEqual(snapshots(r.objs).find((entry) => entry.tick === 60).lanterns.find((entry) => entry.id === 'L1').fuel, 9);
});

test('v1.2 pulsing a draining shade awards 15 points', () => {
  const r = run({
    ticks: 1, snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD,
      player: { pos: [0, 0, 0], carried: 3 },
      lanterns: [{ id: 'L1', pos: [0, 0, 5], lit: true, ever_lit: true, fuel: 20 }],
      shades: [{ id: 'S1', pos: [0, 0, 4], state: 'drain', target_lantern_id: 'L1' }],
    },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  assert.strictEqual(snapshots(r.objs).find((entry) => entry.tick === 1).score, 15);
});

test('v1.2 sunrise threshold wins only at dawn; below threshold loses and no-flames wins priority', () => {
  const survive = run({
    ticks: 1, snapshotEvery: 1,
    scenarioRaw: {
      ...NO_WORLD, time_left_s: 1 / 60,
      lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }],
    },
  });
  assert.deepStrictEqual([survive.objs.at(-1).state, events(survive.objs).find((event) => event.type === 'game_over').data.reason], ['won', 'dawn_survived']);

  const short = run({
    ticks: 1,
    scenarioRaw: { ...NO_WORLD, time_left_s: 1 / 60, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }] },
  });
  assert.deepStrictEqual([short.objs.at(-1).state, events(short.objs).find((event) => event.type === 'game_over').data.reason], ['lost', 'dawn']);

  const noFlames = run({
    ticks: 3,
    scenarioRaw: {
      ...NO_WORLD, time_left_s: 1 / 60,
      player: { pos: [0, 0, 0], flames: 1 },
      shades: [{ id: 'S1', pos: [0.5, 0, 0], state: 'chase' }],
    },
  });
  assert.deepStrictEqual([noFlames.objs.at(-1).state, events(noFlames.objs).find((event) => event.type === 'game_over').data.reason], ['lost', 'no_flames']);
});

test('v1.2 Night 2 and Night 3 apply their own dawn lamp thresholds and durations', () => {
  const night2Win = run({
    night: '2', ticks: 1,
    scenarioRaw: {
      ...NO_WORLD, time_left_s: 1 / 60,
      lanterns: ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true })),
    },
  });
  assert.strictEqual(night2Win.objs.at(-1).state, 'won');
  const night2Default = new Simulation(TUNING, 1, {}, { night: 2 });
  assert.strictEqual(night2Default.timeLeft(), 270);

  const night3Win = run({
    night: '3', ticks: 1,
    scenarioRaw: {
      ...NO_WORLD, time_left_s: 1 / 60,
      lanterns: ['L1', 'L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true })),
    },
  });
  assert.strictEqual(night3Win.objs.at(-1).state, 'won');
  const night3Default = new Simulation(TUNING, 1, {}, { night: 3 });
  assert.strictEqual(night3Default.timeLeft(), 300);
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

test('REGRESSION deposit shrine accepts light and relocates deterministically', () => {
  const config = {
    playerPos: [0, 0, 0],
    carried: 5,
    randomMotes: false,
    randomShades: false,
    motes: [],
    shades: [],
  };
  const first = new Simulation(TUNING, 17, config);
  const second = new Simulation(TUNING, 17, config);
  assert.deepStrictEqual(first.depositShrine.pos, second.depositShrine.pos);

  const oldPos = first.depositShrine.pos.slice();
  first.player.pos = oldPos.slice();
  first.input.interact = true;
  second.player.pos = oldPos.slice();
  second.input.interact = true;
  const [deposit] = first.step().filter((event) => event.name === 'deposit');
  second.step();

  assert.ok(deposit, 'interacting at the shrine should deposit carried light');
  assert.ok(Math.hypot(first.depositShrine.pos[0] - oldPos[0], first.depositShrine.pos[2] - oldPos[2]) >= 8);
  assert.deepStrictEqual(first.depositShrine.pos, second.depositShrine.pos);

  const poor = new Simulation(TUNING, 17, { ...config, carried: 0 });
  const stationaryPos = poor.depositShrine.pos.slice();
  poor.player.pos = stationaryPos.slice();
  poor.input.interact = true;
  assert.strictEqual(poor.step().some((event) => event.name === 'deposit'), false);
  assert.deepStrictEqual(poor.depositShrine.pos, stationaryPos);
});

test('REGRESSION scheduled shades spawn at least 15m away on map points', () => {
  const sim = new Simulation(TUNING, 7, { ...NO_WORLD, random_shades: true });
  for (let tick = 0; tick < 10 * 60; tick++) sim.step();

  const shade = sim.shades.find((entry) => entry.id === 'S1');
  assert.ok(shade, 'the scheduled shade should spawn');
  const dx = shade.pos[0] - sim.player.pos[0];
  const dz = shade.pos[2] - sim.player.pos[2];
  assert.ok(Math.hypot(dx, dz) >= 15, 'shade should spawn at least 15m away');
});

test('REGRESSION every Night spawns 2 shades at tick 300 (Phase 2 schedule)', () => {
  for (const night of [1, 2, 3]) {
    const sim = new Simulation(TUNING, 3, { ...NO_WORLD, random_shades: true }, { night });
    for (let tick = 0; tick < 299; tick++) sim.step();
    assert.strictEqual(sim.shades.length, 0, `night ${night}: none before tick 300`);
    sim.step();
    assert.strictEqual(sim.shades.length, 2, `night ${night}: two shades at tick 300`);
  }
});

// ---------------------------------------------------------------- REGRESSION
test('REGRESSION dash is triggered by its rising input edge', () => {
  const dashR = run({ ticks: 5, scenarioRaw: NO_WORLD, inputsRaw: { frames: [{ tick: 0, move: [1, 0], dash: true }] } });
  assert.strictEqual(dashR.exitCode, 0);
  assert.strictEqual(countEvents(dashR.objs, 'dash'), 1);
});

test('REGRESSION empty config {} (GUI path) → sensible Phase 3 defaults', () => {
  const sim = new Simulation(TUNING, 42, {});
  assert.strictEqual(sim.player.carried, 0);
  assert.strictEqual(sim.player.flames, 3);
  assert.strictEqual(sim.motes.length, 20);
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
  const allowed = new Set([
    'night_start', 'mote_picked', 'deposit', 'refuel', 'lantern_lit', 'lantern_out',
    'fuel_drain', 'pulse', 'player_hit', 'shade_spawned', 'game_over',
  ]);
  for (const t of types) assert.ok(allowed.has(t), `unexpected event type ${t} (decorative entity leaking into headless)`);
});

test('pause advances outer ticks only and resumes on a fresh input edge', () => {
  const r = run({
    ticks: 4,
    snapshotEvery: 1,
    scenarioRaw: NO_WORLD,
    inputsRaw: { frames: [
      { tick: 0, pause: true },
      { tick: 1, pause: false },
      { tick: 2, pause: true },
    ] },
  });
  assert.strictEqual(countEvents(r.objs, 'paused'), 1);
  assert.strictEqual(countEvents(r.objs, 'resumed'), 1);
  const s1 = snapshots(r.objs).find((s) => s.tick === 1);
  const s3 = snapshots(r.objs).find((s) => s.tick === 3);
  const s4 = snapshots(r.objs).find((s) => s.tick === 4);
  assert.deepStrictEqual([s1.state, s1.sim_tick], ['paused', 0]);
  assert.deepStrictEqual([s3.state, s3.sim_tick], ['playing', 0]);
  assert.deepStrictEqual([s4.state, s4.sim_tick], ['playing', 1]);
});

test('dash uses the configured duration and cooldown', () => {
  const r = run({
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: NO_WORLD,
    inputsRaw: { frames: [{ tick: 0, dash: true, move: [1, 0] }] },
  });
  assert.strictEqual(countEvents(r.objs, 'dash'), 1);
  const state = snapshots(r.objs).find((s) => s.tick === 1);
  approx(state.player.vel[0], TUNING.dash_speed);
  assert.strictEqual(state.player.dash_cd_s, TUNING.dash_cooldown_s);
});

test('airborne dash holds height for its full duration', () => {
  const sim = new Simulation(TUNING, 8, {
    playerPos: [0, 3, 0],
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
  });
  sim.input.dash = true;
  for (let i = 0; i < TUNING.dash_duration_ticks; i++) sim.step();
  assert.strictEqual(sim.player.pos[1], 3);
  assert.strictEqual(sim.player.dashTicks, 0);
});

test('fall damage reports all lost light and starts recovery', () => {
  const r = run({
    night: '2',
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: {
      player: { pos: [0, -10.1, 0], carried: 7 },
      random_motes: false, random_shades: false, random_drifters: false,
      motes: [], shades: [], drifters: [],
    },
  });
  const hit = events(r.objs).find((o) => o.type === 'player_hit');
  assert.deepStrictEqual(hit.data, { by: 'fall', flames: 2, lost: 7 });
  assert.strictEqual(snapshots(r.objs).find((s) => s.tick === 1).player.carried, 0);
});

test('walking off an island causes a single fall recovery', () => {
  const r = run({
    ticks: 150,
    snapshotEvery: 10,
    scenarioRaw: {
      player: { pos: [39.99, 0, 0], carried: 4 },
      random_motes: false, random_shades: false, motes: [], shades: [],
    },
    inputsRaw: { frames: [{ tick: 0, move: [1, 0] }] },
  });
  assert.strictEqual(events(r.objs).filter((event) => event.type === 'player_hit' && event.data.by === 'fall').length, 1);
  const state = snapshots(r.objs).at(-1);
  assert.strictEqual(state.player.flames, 2);
  assert.ok(state.player.invuln);
});

test('Night 2 supports charm pickup and Gió Lạc stealing', () => {
  const charm = run({
    night: '2',
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: {
      player: { pos: [0, 0, 0], carried: 5 },
      random_motes: false, random_shades: false, random_drifters: false,
      motes: [], shades: [],
      charms: [{ id: 'C1', pos: [0, 0, 0] }],
    },
  });
  assert.deepStrictEqual(events(charm.objs).find((o) => o.type === 'charm_picked').data, {
    charm_id: 'C1', charm_ticks: TUNING.charm_duration_ticks,
  });
  assert.strictEqual(snapshots(charm.objs).find((s) => s.tick === 1).player.charm_s, 10);

  const steal = run({
    night: '2',
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: {
      player: { pos: [0, 0, 0], carried: 5 },
      random_motes: false, random_shades: false, random_drifters: false,
      motes: [], shades: [],
      drifters: [{ id: 'D1', pos: [1, 0, 0], state: 'chase', stolen: 0 }],
    },
  });
  assert.deepStrictEqual(events(steal.objs).find((o) => o.type === 'drifter_steal').data, {
    drifter_id: 'D1', amount: 3, carried: 2,
  });
});

test('pulse makes a carrying Gió Lạc drop its stolen motes', () => {
  const r = run({
    night: '2',
    ticks: 1,
    snapshotEvery: 1,
    scenarioRaw: {
      player: { pos: [0, 0, 0], carried: 3 },
      random_motes: false, random_shades: false, random_drifters: false,
      motes: [], shades: [],
      drifters: [{ id: 'D1', pos: [2, 0, 0], state: 'flee', stolen: 2 }],
    },
    inputsRaw: { frames: [{ tick: 0, pulse: true }] },
  });
  assert.deepStrictEqual(events(r.objs).find((o) => o.type === 'drifter_drop').data, {
    drifter_id: 'D1', amount: 2,
  });
  const state = snapshots(r.objs).find((s) => s.tick === 1);
  assert.strictEqual(state.motes.filter((mote) => mote.kind === 'dropped').length, 2);
  assert.strictEqual(state.drifters[0].stolen, 0);
});

test('motes replenish at scheduled ticks on unoccupied points', () => {
  const sim = new Simulation(TUNING, 13, {
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
  });
  for (let i = 0; i < 239; i++) sim.step();
  assert.strictEqual(sim.motes.length, 0);
  sim.step();
  assert.strictEqual(sim.motes.length, 1);
  assert.ok(sim.map.motePoints.some((point) => point.every((value, i) => value === sim.motes[0].pos[i])));
  const defaultMotes = new Simulation(TUNING, 13, {});
  assert.strictEqual(defaultMotes.motes.length, 20);
  assert.strictEqual(new Set(defaultMotes.motes.map((mote) => mote.pos.join(','))).size, 20);
});

test('Night 2 jump pad preserves its launch velocity until landing', () => {
  const sim = new Simulation(TUNING, 15, {
    playerPos: [19.9, 0, 18],
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
  }, { night: 2 });
  for (let i = 0; i < 90; i++) sim.step();
  assert.ok(sim.player.pos[0] > 50, `expected to cross to island B, x=${sim.player.pos[0]}`);
  assert.strictEqual(sim.player.grounded, true);
});

test('Night 3 starts on its upper tier and runs timed wind', () => {
  const sim = new Simulation(TUNING, 9, {
    randomMotes: false, randomShades: false, randomDrifters: false,
    motes: [], shades: [], drifters: [],
  }, { night: 3 });
  assert.deepStrictEqual(sim.player.pos, [0, 6, 0]);
  assert.strictEqual(sim.snapshotObject().night, 3);
  for (let i = 0; i < 1800; i++) sim.step();
  assert.strictEqual(sim.wind.active, true);
  for (let i = 0; i < 300; i++) sim.step();
  assert.strictEqual(sim.wind.active, false);
});

// ---------------------------------------------------------------- regression: tuning sync
test('REGRESSION game.contract.json tuning matches core TUNING', async () => {
  const { loadContractTuning } = await import('../src/cli.js');
  const fs = (await import('node:fs')).default;
  const contract = JSON.parse(fs.readFileSync('./game.contract.json', 'utf8'));
  assert.deepStrictEqual(contract.tuning, loadContractTuning());
  assert.strictEqual(contract.contract_version, '1.2');
});

console.log(`\n${count - FAILURES.length}/${count} passed${FAILURES.length ? ` (FAILED: ${FAILURES.join(', ')})` : ''}`);
process.exitCode = FAILURES.length ? 1 : 0;
