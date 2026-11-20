/**
 * Simulation Core — the single authoritative, deterministic game state.
 * Both the headless CLI (Node) and the browser GUI (Three.js) run exactly this
 * code, satisfying the "same Simulation Core" contract rule (PRD §14.1).
 *
 * Determinism: a seeded PRNG (xorshift32) drives all randomness; entities are
 * always processed in stable ID order; no Date/Math.random.
 */
import { createRng } from './random.js';
import {
  TUNING,
  TICKS_PER_SEC,
  DT,
  JUMP_VELOCITY,
  GRAVITY,
  DEFAULT_MOTE_COUNT,
  NIGHT_MAPS,
} from './tuning.js';
import { resolveScenarioFlags } from '../contract/scenario.js';

function hypotXZ(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}
function rndSeconds(ticks) {
  return Math.round((ticks / TICKS_PER_SEC) * 1000) / 1000;
}
function rnd3(v) {
  return [
    Math.round(v[0] * 1000) / 1000,
    Math.round(v[1] * 1000) / 1000,
    Math.round(v[2] * 1000) / 1000,
  ];
}
const FUEL_TICKS_PER_UNIT = TICKS_PER_SEC;
const fuelValue = (fuelTicks) => Math.round((fuelTicks / FUEL_TICKS_PER_UNIT) * 10) / 10;

export class Simulation {
  constructor(tuning, seed, scenarioConfig, extra = {}) {
    this.night = Number(extra.night ?? 1);
    this.map = NIGHT_MAPS[this.night];
    this.tuning = { ...TUNING, ...tuning };
    this.score = { ...TUNING.score, ...(tuning.score || {}) };
    this.seed = seed;
    this.rng = createRng(seed);
    this.depositShrineRng = createRng(((Number(seed) | 0) ^ 0x9e3779b9) >>> 0);
    this.tick = 0;
    this.gameState = 'playing';
    this.gameOverReason = null;
    this.events = []; // per-step event buffer
    this.allEvents = []; // cumulative (used by tests / GUI logs)
    this.simTick = 0;
    this.extra = extra; // e.g. { randomJiggle: false }

    // Input state (persisted between frames; absent fields keep previous value).
    this.input = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
    this.prevInput = { ...this.input };

    const flags = resolveScenarioFlags(scenarioConfig, this.tuning);
    if (scenarioConfig?.playerPos == null && scenarioConfig?.player?.pos == null) {
      flags.playerPos = this.map.startPos.slice();
    }
    this._buildWorld(flags);
    this.events.push({ name: 'night_start', data: { night: this.night } });
    this.allEvents.push(...this.events);
  }

  _buildWorld(flags) {
    const t = this.tuning;
    const initialGround = this._groundHeightAt(flags.playerPos[0], flags.playerPos[2]);

    // Player
    this.player = {
      pos: flags.playerPos.slice(),
      startPos: this.map.startPos.slice(),
      flames: flags.flames,
      carried: flags.carried,
      successfulLights: flags.successfulLights,
      capacity: Math.min(t.capacity_max, t.carry_capacity + 2 * flags.successfulLights),
      grounded: initialGround !== null && Math.abs(flags.playerPos[1] - initialGround) <= 0.05,
      vy: 0,
      vel: [0, 0, 0],
      invulnTicks: flags.invulnTicks,
      dashCooldown: flags.dashCdTicks,
      dashTicks: 0,
      pulseCooldown: flags.pulseCdTicks,
      charmTicks: flags.charmTicks,
      recoveryTicks: 0,
      knockedBackTicks: 0,
      facingYawDeg: 0,
      padVelocity: null,
    };

    // Lanterns
    this.lanterns = [];
    for (const id of Object.keys(this.map.lanterns)) {
      const pos = this.map.lanterns[id].slice();
      let deposited = 0;
      let lit = false;
      let fuelTicks = 0;
      let everLit = false;
      let relitCount = 0;
      const ov = (flags.lanterns || []).find((l) => l.id === id);
      if (ov) {
        if (ov.pos) pos.splice(0, 3, ...ov.pos);
        if (ov.deposited !== undefined) deposited = ov.deposited;
        if (ov.lit !== undefined) lit = ov.lit;
        fuelTicks = Math.round((ov.fuel ?? (lit ? t.fuel_max : 0)) * FUEL_TICKS_PER_UNIT);
        everLit = ov.everLit ?? lit;
      }
      this.lanterns.push({ id, pos, lit: fuelTicks > 0, fuelTicks, everLit, relitCount, deposited });
    }
    this.depositShrine = { pos: this._generateDepositShrinePosition() };

    // Motes
    const motesCfg = flags.motes;
    if (motesCfg !== null) {
      this.motes = motesCfg.map((p, i) => ({ id: `M${i + 1}`, pos: p.slice(), kind: 'random', ttlTicks: null }));
    } else if (flags.randomMotes) {
      this.motes = this._generateMotes(this.tuning.mote_initial_count);
    } else {
      this.motes = [];
    }
    this.nextMoteSpawnTick = this.tuning.mote_spawn_interval_ticks;
    this.nextMoteId = this.motes.reduce((max, mote) => {
      const value = Number(mote.id.slice(1));
      return Number.isInteger(value) ? Math.max(max, value + 1) : max;
    }, 1);

    // Shades (initial). Schedule spawns later if randomShades.
    this.randomShades = flags.randomShades;
    const taken = new Set();
    this.shades = [];
    let n = 1;
    for (const s of flags.shades) {
      let id = s.id;
      if (id === undefined) {
        while (taken.has(`S${n}`)) n++;
        id = `S${n}`;
        n++;
      }
      taken.add(id);
      const state = s.state ?? 'wander';
      this.shades.push({
        id,
        pos: s.pos.slice(),
        state,
        stateTicksLeft: s.stateTicksLeft ?? 0,
        stunTicksLeft: state === 'stunned' ? (s.stateTicksLeft ?? 0) : 0,
        targetLanternId: s.targetLanternId ?? null,
        drainTicks: 0,
        pushTicks: 0,
        pushVector: [0, 0],
      });
    }
    // Sort shades by ID (stable ordering).
    this.shades.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.spawnedShadeCount = this.shades.length;
    this.nextShadeId = 1;
    while (this.shades.some((shade) => shade.id === `S${this.nextShadeId}`)) this.nextShadeId += 1;

    this.randomDrifters = flags.randomDrifters && this.night > 1;
    this.drifters = (flags.drifters ?? []).map((drifter) => ({
      ...drifter,
      pos: drifter.pos.slice(),
      timer: 0,
    }));
    this.nextDrifterId = 1;
    while (this.drifters.some((drifter) => drifter.id === `D${this.nextDrifterId}`)) this.nextDrifterId += 1;
    const defaultCharmPoints = this.map.charmPoints;
    this.charms = (flags.charms ?? defaultCharmPoints.map((pos, i) => ({
      id: `C${i + 1}`, pos: pos.slice(), available: true, respawnTicks: 0,
    }))).map((charm, i) => ({
      ...charm,
      pos: charm.pos?.slice() ?? defaultCharmPoints[i]?.slice() ?? [0, 0, 0],
    }));
    this.windEnabled = flags.windEnabled ?? this.map.wind;
    this.wind = { active: false, dirDeg: 0, ticksLeft: 0, nextTick: 30 * TICKS_PER_SEC, warningTicks: 0 };

    // Clock & score
    this.initialTimeLeftS = flags.timeLeftS ?? this.map.duration_s;
    this.scoreValue = 0;
    this.litCount = this.lanterns.filter((l) => l.lit).length;
  }

  _generateMotes(count) {
    const out = [];
    const points = this.map.motePoints.map((pos) => pos.slice());
    for (let i = 0; i < count && points.length > 0; i++) {
      const pointIndex = this.rng.nextInt(points.length);
      out.push({ id: `M${i + 1}`, pos: points.splice(pointIndex, 1)[0], kind: 'random', ttlTicks: null });
    }
    return out;
  }

  _generateDepositShrinePosition(previousPos) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const island = this.map.islands[this.depositShrineRng.nextInt(this.map.islands.length)];
      const radius = 4 + this.depositShrineRng.next() * (island.radius - 8);
      const angle = this.depositShrineRng.next() * Math.PI * 2;
      const pos = [island.center[0] + radius * Math.cos(angle), island.height, island.center[1] + radius * Math.sin(angle)];
      if (hypotXZ(pos, this.player.pos) < 7) continue;
      if (previousPos && hypotXZ(pos, previousPos) < 8) continue;
      if (this.lanterns.some((lantern) => hypotXZ(pos, lantern.pos) < 3.5)) continue;
      return pos;
    }

    const island = this.map.islands[0];
    const angle = Math.atan2(this.player.pos[2] - island.center[1], this.player.pos[0] - island.center[0]) + Math.PI;
    const radius = island.radius - 4;
    return [island.center[0] + radius * Math.cos(angle), island.height, island.center[1] + radius * Math.sin(angle)];
  }

  _moveDepositShrine() {
    this.depositShrine.pos = this._generateDepositShrinePosition(this.depositShrine.pos);
  }

  _dropMotes(amount, center) {
    for (let i = 0; i < amount; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = this.tuning.drop_mote_min_radius +
        this.rng.next() * (this.tuning.drop_mote_max_radius - this.tuning.drop_mote_min_radius);
      let x = center[0] + Math.cos(angle) * radius;
      let z = center[2] + Math.sin(angle) * radius;
      const [clampedX, clampedZ] = this._clampToIsland(x, z);
      x = clampedX;
      z = clampedZ;
      const ground = this._groundHeightAt(x, z);
      this.motes.push({
        id: `M${this.nextMoteId++}`,
        pos: [x, ground ?? center[1], z],
        kind: 'dropped',
        ttlTicks: this.tuning.mote_ttl_ticks,
      });
    }
  }

  depositShrineTarget() {
    let target = null;
    let targetDistance = Infinity;
    for (const lantern of this.lanterns) {
      if (lantern.lit) continue;
      const distance = hypotXZ(this.depositShrine.pos, lantern.pos);
      if (
        distance < targetDistance - 1e-9 ||
        (Math.abs(distance - targetDistance) <= 1e-9 && (!target || lantern.id < target.id))
      ) {
        target = lantern;
        targetDistance = distance;
      }
    }
    return target;
  }

  // ------------------------------------------------------------------ helpers
  timeLeft() {
    return this.initialTimeLeftS - this.simTick / TICKS_PER_SEC;
  }

  _litLanternCenters() {
    const threshold = this.tuning.low_fuel_threshold * FUEL_TICKS_PER_UNIT;
    return this.lanterns.filter((l) => l.lit && l.fuelTicks >= threshold).map((l) => l.pos);
  }

  _playerInAnySafeZone() {
    const sr = this.tuning.safe_radius;
    for (const l of this.lanterns) {
      if (l.lit && l.fuelTicks >= this.tuning.low_fuel_threshold * FUEL_TICKS_PER_UNIT &&
        hypotXZ(this.player.pos, l.pos) <= sr) return true;
    }
    return false;
  }

  _shadeLanternTarget(shade) {
    const weak = this.lanterns
      .filter((lantern) => lantern.lit &&
        lantern.fuelTicks < this.tuning.low_fuel_threshold * FUEL_TICKS_PER_UNIT)
      .sort((a, b) => hypotXZ(shade.pos, a.pos) - hypotXZ(shade.pos, b.pos) || a.id.localeCompare(b.id));
    if (weak.length > 0) return weak[0];
    return this.lanterns
      .filter((lantern) => !lantern.lit)
      .sort((a, b) => hypotXZ(shade.pos, a.pos) - hypotXZ(shade.pos, b.pos) || a.id.localeCompare(b.id))[0] ?? null;
  }

  /**
   * Repel a point (px,pz) outward from every lit safe-zone circle.
   * Pushes to just *outside* the boundary (not exactly onto it, which would
   * still count as "inside" under the <= r rule and freeze the shade there).
   * Several passes handle overlapping safe zones (PRD §6.4).
   */
  _repelSafeZones(px, pz) {
    const sr = this.tuning.safe_radius;
    const EPS = 0.001; // keep the point strictly outside the zone
    const centers = this._litLanternCenters();
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const c of centers) {
        const dx = px - c[0];
        const dz = pz - c[2];
        const d = Math.hypot(dx, dz);
        if (d <= sr) {
          changed = true;
          if (d < 1e-9) {
            // Point exactly on centre: push along +X.
            px = c[0] + sr + EPS;
            pz = c[2];
          } else {
            const nx = dx / d;
            const nz = dz / d;
            px = c[0] + nx * (sr + EPS);
            pz = c[2] + nz * (sr + EPS);
          }
        }
      }
      if (!changed) break;
    }
    return [px, pz];
  }

  _groundHeightAt(x, z) {
    let height = null;
    for (const island of this.map.islands) {
      if (Math.hypot(x - island.center[0], z - island.center[1]) <= island.radius) {
        height = Math.max(height ?? -Infinity, island.height);
      }
    }
    for (const bridge of this.map.bridges) {
      if (x >= bridge.minX && x <= bridge.maxX && z >= bridge.minZ && z <= bridge.maxZ) {
        height = Math.max(height ?? -Infinity, bridge.height);
      }
    }
    for (const platform of this.map.platforms) {
      const distance = Math.hypot(x - platform.center[0], z - platform.center[1]);
      const inside = platform.kind === 'disk'
        ? distance <= platform.radius
        : distance >= platform.innerRadius && distance <= platform.outerRadius && z > platform.minZ;
      if (inside) height = Math.max(height ?? -Infinity, platform.y);
    }
    for (const ramp of this.map.ramps) {
      const dx = x;
      const dz = z;
      const radius = Math.hypot(dx, dz);
      let angle = (Math.atan2(dz, dx) * 180) / Math.PI;
      let delta = Math.abs(angle - ramp.angleDeg) % 360;
      if (delta > 180) delta = 360 - delta;
      if (radius >= ramp.innerRadius && radius <= ramp.outerRadius && delta <= ramp.width / (2 * radius) * (180 / Math.PI)) {
        const rampHeight = ((ramp.outerRadius - radius) / (ramp.outerRadius - ramp.innerRadius)) * (ramp.highY - ramp.lowY) + ramp.lowY;
        height = Math.max(height ?? -Infinity, rampHeight);
      }
    }
    return height;
  }

  _blockedByTower(x, z, y, bodyHeight = 1) {
    return this.map.towers.some((tower) =>
      Math.hypot(x - tower.pos[0], z - tower.pos[2]) < tower.radius + 0.4 &&
      y < tower.pos[1] + tower.height && y + bodyHeight > tower.pos[1]);
  }

  _clampToIsland(x, z) {
    const surface = this._groundHeightAt(x, z);
    if (surface !== null) return [x, z];
    let nearest = null;
    let bestDistance = Infinity;
    for (const island of this.map.islands) {
      const dx = x - island.center[0];
      const dz = z - island.center[1];
      const distance = Math.hypot(dx, dz);
      if (distance < bestDistance) {
        bestDistance = distance;
        const ratio = distance > island.radius ? island.radius / distance : 1;
        nearest = [island.center[0] + dx * ratio, island.center[1] + dz * ratio];
      }
    }
    if (nearest) [x, z] = nearest;
    return [x, z];
  }

  _spawnShade(id) {
    const t = this.tuning;
    const centers = this._litLanternCenters();
    const points = this.map.shadeSpawnPoints;
    const start = this.rng.nextInt(points.length);
    const yaw = (this.input.camYawDeg * Math.PI) / 180;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    for (let offset = 0; offset < points.length; offset++) {
      const point = points[(start + offset) % points.length];
      const dx = point[0] - this.player.pos[0];
      const dz = point[2] - this.player.pos[2];
      const distance = Math.hypot(dx, dz);
      if (distance < 15 || dx * forwardX + dz * forwardZ > -distance * 0.15) continue;
      if (centers.some((center) => hypotXZ(point, center) <= t.safe_radius)) continue;
      if (this.shades.some((shade) => hypotXZ(point, shade.pos) < 3)) continue;
      const pos = point.slice();
      while (this.shades.some((shade) => shade.id === `S${this.nextShadeId}`)) this.nextShadeId += 1;
      const spawnId = id ?? `S${this.nextShadeId}`;
      this.shades.push({
        id: spawnId,
        pos,
        state: 'spawning',
        stateTicksLeft: 30,
        stunUntil: -Infinity,
        pushTicks: 0,
        pushVector: [0, 0],
        recoilTicks: 0,
        targetLanternId: null,
        drainTicks: 0,
      });
      this.shades.sort((a, b) => a.id.localeCompare(b.id));
      this.spawnedShadeCount += 1;
      this.nextShadeId += 1;
      this.events.push({ name: 'shade_spawned', data: { id: spawnId } });
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Public API used by GUI and tests.
  // -------------------------------------------------------------------------
  isOver() {
    return this.gameState === 'won' || this.gameState === 'lost';
  }

  /** Write the current tick-0 snapshot line (before any step). */
  snapshotObject() {
    const t = this.timeLeft();
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.gameState,
      time_left_s: Math.round(t * 1000) / 1000,
      score: this.scoreValue,
      player: this.snapshotPlayer(),
      lanterns: this.snapshotLanterns(),
      shades: this.snapshotShades(),
      drifters: this.drifters
        .filter((d) => d.state !== 'removed')
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => ({ id: d.id, pos: rnd3(d.pos), state: d.state, stolen: d.stolen })),
      charms: this.charms
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => ({ id: c.id, available: c.available, respawn_s: rndSeconds(c.respawnTicks) })),
      wind: { active: this.wind.active, dir_deg: this.wind.dirDeg },
      motes_active: this.activeMotes().length,
      motes: this.activeMotes().map((m) => ({
        id: m.id,
        pos: rnd3(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : rndSeconds(m.ttlTicks),
      })),
    };
  }
  snapshotPlayer() {
    return {
      pos: rnd3(this.player.pos),
      vel: rnd3([this.player.vel[0], this.player.vy, this.player.vel[2]]),
      flames: this.player.flames,
      carried: this.player.carried,
      grounded: this.player.grounded,
      invuln: this.player.invulnTicks > 0,
      dash_cd_s: rndSeconds(this.player.dashCooldown),
      pulse_cd_s: rndSeconds(this.player.pulseCooldown),
      charm_s: rndSeconds(this.player.charmTicks),
      capacity: this.player.capacity,
    };
  }
  snapshotLanterns() {
    return this.lanterns
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((l) => ({
        id: l.id,
        pos: rnd3(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: fuelValue(l.fuelTicks),
        ever_lit: l.everLit,
        relit_count: l.relitCount,
      }));
  }
  snapshotShades() {
    return this.shades
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => ({ id: s.id, pos: rnd3(s.pos), state: s.state, target_lantern_id: s.targetLanternId }));
  }
  activeMotes() {
    return this.motes.slice().sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Apply an incoming input frame (tick already handled by caller). */
  applyInputFrame(frame) {
    if (frame.move) this.input.move = [frame.move[0], frame.move[1]];
    if (frame.camYawDeg !== undefined) this.input.camYawDeg = frame.camYawDeg;
    if (frame.jump !== undefined) this.input.jump = frame.jump;
    if (frame.interact !== undefined) this.input.interact = frame.interact;
    if (frame.pulse !== undefined) this.input.pulse = frame.pulse;
    if (frame.dash !== undefined) this.input.dash = frame.dash;
    if (frame.pause !== undefined) this.input.pause = frame.pause;
  }

  // -------------------------------------------------------------------------
  // One simulation step (tick). PRD §14.3 order.
  // -------------------------------------------------------------------------
  step() {
    if (this.isOver()) {
      this.events = [];
      return this.events;
    }
    this.tick += 1;
    const e = this.events = [];
    const pressPause = this.input.pause && !this.prevInput.pause;
    const pressJump = this.input.jump && !this.prevInput.jump;
    const pressInteract = this.input.interact && !this.prevInput.interact;
    const pressPulse = this.input.pulse && !this.prevInput.pulse;
    const pressDash = this.input.dash && !this.prevInput.dash;
    this.prevInput = { ...this.input };

    if (this.gameState === 'paused') {
      if (pressPause) {
        this.gameState = 'playing';
        e.push({ name: 'resumed', data: {} });
      }
      this.allEvents.push(...e);
      return e;
    }
    if (pressPause) {
      this.gameState = 'paused';
      e.push({ name: 'paused', data: {} });
      this.allEvents.push(...e);
      return e;
    }

    const t = this.tuning;
    const player = this.player;
    const recoveringAtStart = player.recoveryTicks > 0;

    // Timers advance only while active.
    for (const field of ['invulnTicks', 'dashCooldown', 'pulseCooldown', 'charmTicks']) {
      player[field] = Math.max(0, player[field] - 1);
    }
    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks -= 1;
        if (charm.respawnTicks === 0) charm.available = true;
      }
    }
    for (const mote of this.motes) {
      if (mote.ttlTicks !== null && mote.ttlTicks > 0) mote.ttlTicks -= 1;
    }
    const fuelThreshold = t.low_fuel_threshold * FUEL_TICKS_PER_UNIT;
    const drainEvents = [];
    for (const shade of this.shades.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (shade.state !== 'drain') continue;
      const target = this.lanterns.find((lantern) => lantern.id === shade.targetLanternId);
      if (!target || !target.lit || target.fuelTicks >= fuelThreshold || hypotXZ(shade.pos, target.pos) > 2) {
        shade.state = 'wander';
        shade.targetLanternId = null;
        shade.drainTicks = 0;
        continue;
      }
      target.fuelTicks = Math.max(0, target.fuelTicks - t.drain_per_s);
      shade.drainTicks += 1;
      if (shade.drainTicks % TICKS_PER_SEC === 0) {
        drainEvents.push({ lantern: target, shadeId: shade.id });
      }
    }
    for (const lantern of this.lanterns) {
      if (lantern.lit) lantern.fuelTicks = Math.max(0, lantern.fuelTicks - t.fuel_decay_per_s);
    }
    for (const { lantern, shadeId } of drainEvents) {
      e.push({ name: 'fuel_drain', data: { lantern_id: lantern.id, shade_id: shadeId, fuel: fuelValue(lantern.fuelTicks) } });
    }
    for (const lantern of this.lanterns) {
      if (!lantern.lit || lantern.fuelTicks > 0) continue;
      lantern.lit = false;
      lantern.fuelTicks = 0;
      lantern.deposited = 0;
      lantern.everLit = true;
      this.litCount -= 1;
      e.push({ name: 'lantern_out', data: { lantern_id: lantern.id } });
    }
    for (const drifter of this.drifters) {
      if (drifter.state === 'flee' && drifter.timer > 0) drifter.timer -= 1;
    }
    let windActiveForMovement = this.wind.active;
    let windJustStarted = false;
    if (this.windEnabled) {
      if (this.wind.active) {
        this.wind.warningTicks = 0;
      } else if (this.wind.nextTick - this.simTick <= 1) {
        this.wind.active = true;
        this.wind.dirDeg = this.rng.next() * 360;
        this.wind.ticksLeft = 300;
        this.wind.warningTicks = 0;
        this.wind.nextTick += 1800;
        windActiveForMovement = true;
        windJustStarted = true;
      } else if (this.wind.nextTick - this.simTick <= 120) {
        this.wind.warningTicks = Math.max(0, this.wind.nextTick - this.simTick);
      }
    }

    let fellThisTick = false;
    if (recoveringAtStart) {
      player.recoveryTicks -= 1;
      if (player.recoveryTicks === 0) {
        player.pos = player.startPos.slice();
        player.vel = [0, 0, 0];
        player.vy = 0;
        player.grounded = this._groundHeightAt(player.pos[0], player.pos[2]) !== null;
        player.invulnTicks = t.invuln_ticks;
        player.padVelocity = null;
      }
    } else {
      const moveLength = Math.hypot(this.input.move[0], this.input.move[1]);
      let moveX = this.input.move[0];
      let moveZ = this.input.move[1];
      if (moveLength > 1) {
        moveX /= moveLength;
        moveZ /= moveLength;
      }
      const yaw = (this.input.camYawDeg * Math.PI) / 180;
      const desiredX = moveX * Math.cos(yaw) + moveZ * Math.sin(yaw);
      const desiredZ = -moveX * Math.sin(yaw) + moveZ * Math.cos(yaw);
      if (Math.hypot(desiredX, desiredZ) > 1e-9) {
        player.facingYawDeg = (Math.atan2(desiredX, desiredZ) * 180) / Math.PI;
      }

      if (pressDash && player.dashTicks === 0 && (player.dashCooldown === 0 || player.charmTicks > 0)) {
        const facing = (player.facingYawDeg * Math.PI) / 180;
        const dashX = moveLength > 1e-9 ? desiredX : Math.sin(facing);
        const dashZ = moveLength > 1e-9 ? desiredZ : Math.cos(facing);
        const dashLength = Math.hypot(dashX, dashZ) || 1;
        player.dashVector = [dashX / dashLength, dashZ / dashLength];
        player.dashTicks = t.dash_duration_ticks;
        player.dashSavedVy = player.vy;
        player.vy = 0;
        player.dashCooldown = player.charmTicks > 0 ? 0 : t.dash_cooldown_ticks;
        e.push({ name: 'dash', data: {} });
      }

      const maxSpeed = player.charmTicks > 0 ? 7.2 : t.player_speed;
      if (player.dashTicks > 0) {
        player.vel[0] = player.dashVector[0] * t.dash_speed;
        player.vel[2] = player.dashVector[1] * t.dash_speed;
      } else if (player.padVelocity) {
        player.vel[0] = player.padVelocity[0];
        player.vel[2] = player.padVelocity[1];
      } else {
        const targetX = desiredX * maxSpeed;
        const targetZ = desiredZ * maxSpeed;
        const accelerationPerTick = maxSpeed / 6;
        const approach = (value, target) => value + Math.max(-accelerationPerTick, Math.min(accelerationPerTick, target - value));
        player.vel[0] = approach(player.vel[0], targetX);
        player.vel[2] = approach(player.vel[2], targetZ);
        const speed = Math.hypot(player.vel[0], player.vel[2]);
        if (speed > maxSpeed) {
          player.vel[0] *= maxSpeed / speed;
          player.vel[2] *= maxSpeed / speed;
        }
      }

      if (pressJump && player.grounded && player.dashTicks === 0) {
        player.grounded = false;
        player.vy = JUMP_VELOCITY;
      }

      const windRadians = (this.wind.dirDeg * Math.PI) / 180;
      const windX = this.windEnabled && this.wind.active ? Math.cos(windRadians) * 2 : 0;
      const windZ = this.windEnabled && this.wind.active ? Math.sin(windRadians) * 2 : 0;
      const oldX = player.pos[0];
      const oldY = player.pos[1];
      const oldZ = player.pos[2];
      let nextX = oldX + (player.vel[0] + windX) * DT;
      let nextZ = oldZ + (player.vel[2] + windZ) * DT;

      const targetGround = this._groundHeightAt(nextX, nextZ);
      const towerBlocked = this._blockedByTower(nextX, nextZ, oldY, 1.8);
      if (
        towerBlocked ||
        (targetGround !== null && targetGround > oldY + 0.25)
      ) {
        nextX = oldX;
        nextZ = oldZ;
      }

      const touchingPad = this.map.jumpPads.find((pad) =>
        Math.hypot(nextX - pad.pos[0], nextZ - pad.pos[2]) <= pad.radius &&
        Math.abs(oldY - pad.pos[1]) <= 0.25 && player.grounded);
      if (touchingPad && player.dashTicks === 0) {
        player.pos[1] = touchingPad.pos[1];
        player.grounded = false;
        player.vy = touchingPad.velocityY;
        player.padVelocity = [touchingPad.velocityX, touchingPad.velocityZ];
      }

      player.pos[0] = nextX;
      player.pos[2] = nextZ;
      const ground = this._groundHeightAt(nextX, nextZ);
      const dashingThisTick = player.dashTicks > 0;

      if (dashingThisTick) {
        player.dashTicks -= 1;
        if (player.dashTicks === 0) {
          player.vy = player.dashSavedVy;
          player.dashSavedVy = 0;
        }
      } else if (player.grounded && ground === null) {
        player.grounded = false;
        player.vy = 0;
      } else if (player.grounded && ground !== null && oldY - ground > 0.1) {
        player.grounded = false;
      }

      if (!player.grounded && !dashingThisTick) {
        player.pos[1] += player.vy * DT;
        player.vy -= GRAVITY * DT;
        if (ground !== null && oldY >= ground && player.pos[1] <= ground && player.vy <= 0) {
          player.pos[1] = ground;
          player.grounded = true;
          player.vy = 0;
          player.padVelocity = null;
        }
      } else if (player.grounded && ground !== null) {
        player.pos[1] = ground;
      }

      if (player.pos[1] < -10) {
        fellThisTick = true;
        const lost = player.carried;
        player.carried = 0;
        player.flames -= 1;
        player.recoveryTicks = player.flames > 0 ? t.fall_recover_ticks : 0;
        player.vel = [0, 0, 0];
        player.vy = 0;
        player.padVelocity = null;
        e.push({ name: 'player_hit', data: { by: 'fall', flames: player.flames, lost } });
      }
    }
    if (windActiveForMovement && !windJustStarted) {
      this.wind.ticksLeft -= 1;
      if (this.wind.ticksLeft <= 0) this.wind.active = false;
    }

    // Pickups are resolved before expiring dropped motes are removed.
    if (!recoveringAtStart && !fellThisTick && player.recoveryTicks === 0) {
      for (const mote of this.activeMotes()) {
        if (player.carried >= player.capacity) break;
        if (
          hypotXZ(player.pos, mote.pos) <= t.pickup_radius &&
          Math.abs(player.pos[1] - mote.pos[1]) <= t.pickup_height
        ) {
          this.motes = this.motes.filter((entry) => entry.id !== mote.id);
          player.carried += 1;
          e.push({ name: 'mote_picked', data: { carried: player.carried } });
        }
      }
      for (const charm of this.charms.slice().sort((a, b) => a.id.localeCompare(b.id))) {
        if (
          charm.available &&
          hypotXZ(player.pos, charm.pos) <= t.pickup_radius &&
          Math.abs(player.pos[1] - charm.pos[1]) <= t.pickup_height
        ) {
          charm.available = false;
          charm.respawnTicks = t.charm_respawn_ticks;
          player.charmTicks = t.charm_duration_ticks;
          e.push({ name: 'charm_picked', data: { charm_id: charm.id, charm_ticks: player.charmTicks } });
        }
      }
    }
    this.motes = this.motes.filter((mote) => mote.ttlTicks === null || mote.ttlTicks > 0);

    // Choose the nearest lantern that can accept light, then the lowest ID.
    if (pressInteract && !recoveringAtStart) {
      const candidates = this.lanterns
        .filter((lantern) =>
          (!lantern.lit || lantern.fuelTicks < t.fuel_max * FUEL_TICKS_PER_UNIT) &&
          hypotXZ(player.pos, lantern.pos) <= t.interact_radius)
        .map((lantern) => ({ lantern, distance: hypotXZ(player.pos, lantern.pos) }))
        .sort((a, b) => a.distance - b.distance || a.lantern.id.localeCompare(b.lantern.id));
      let target = candidates[0]?.lantern ?? null;
      if (!target && hypotXZ(player.pos, this.depositShrine.pos) <= t.interact_radius) {
        target = this.depositShrineTarget();
      }
      if (target) {
        if (target.lit) {
          const used = Math.min(
            player.carried,
            Math.ceil((t.fuel_max * FUEL_TICKS_PER_UNIT - target.fuelTicks) /
              (t.fuel_per_mote * FUEL_TICKS_PER_UNIT)),
          );
          if (used > 0) {
            player.carried -= used;
            target.fuelTicks = Math.min(
              t.fuel_max * FUEL_TICKS_PER_UNIT,
              target.fuelTicks + used * t.fuel_per_mote * FUEL_TICKS_PER_UNIT,
            );
            this.scoreValue += used * this.score.per_mote;
            e.push({ name: 'refuel', data: { lantern_id: target.id, amount: used, fuel: fuelValue(target.fuelTicks) } });
          }
        } else {
          const need = (target.everLit ? t.relight_cost : t.lantern_cost) - target.deposited;
          const amount = Math.min(player.carried, need);
          if (amount > 0) {
            player.carried -= amount;
            target.deposited += amount;
            this.scoreValue += amount * this.score.per_mote;
            this._moveDepositShrine();
            e.push({ name: 'deposit', data: { lantern_id: target.id, amount, deposited: target.deposited } });
            const lightCost = target.everLit ? t.relight_cost : t.lantern_cost;
            if (target.deposited >= lightCost) {
              const relight = target.everLit;
              target.lit = true;
              target.fuelTicks = t.fuel_max * FUEL_TICKS_PER_UNIT;
              target.everLit = true;
              target.deposited = t.lantern_cost;
              if (relight) target.relitCount += 1;
              this.litCount += 1;
              player.successfulLights += 1;
              player.capacity = Math.min(t.capacity_max, t.carry_capacity + 2 * player.successfulLights);
              this.scoreValue += relight ? this.score.per_relight : this.score.per_lantern;
              e.push({ name: 'lantern_lit', data: { lantern_id: target.id, relight } });
            }
          }
        }
      }
    }

    // A newly lit safe zone immediately ejects shades and prevents contact for 30 ticks.
    const zones = this._litLanternCenters();
    for (const shade of this.shades) {
      if (zones.some((center) => hypotXZ(shade.pos, center) <= t.safe_radius)) {
        const [x, z] = this._repelSafeZones(shade.pos[0], shade.pos[2]);
        shade.pos[0] = x;
        shade.pos[2] = z;
        shade.state = 'recoil';
        shade.stateTicksLeft = Math.max(shade.stateTicksLeft, 30);
        shade.safeZoneTicks = 30;
      }
    }

    // Pulse targets are fixed at activation; both enemy types use the 3D radius.
    if (pressPulse && !recoveringAtStart && player.pulseCooldown === 0 && player.carried >= t.pulse_cost) {
      player.carried -= t.pulse_cost;
      player.pulseCooldown = t.pulse_cooldown_ticks;
      const center = [player.pos[0], player.pos[1] + 0.8, player.pos[2]];
      const stunnedIds = [];
      for (const shade of this.shades.slice().sort((a, b) => a.id.localeCompare(b.id))) {
        const dx = shade.pos[0] - center[0];
        const dy = shade.pos[1] - center[1];
        const dz = shade.pos[2] - center[2];
        if (Math.hypot(dx, dy, dz) > t.pulse_radius) continue;
        let length = Math.hypot(shade.pos[0] - player.pos[0], shade.pos[2] - player.pos[2]);
        let px = length > 1e-9 ? (shade.pos[0] - player.pos[0]) / length : 1;
        let pz = length > 1e-9 ? (shade.pos[2] - player.pos[2]) / length : 0;
        px *= t.pulse_push_m / t.pulse_push_ticks;
        pz *= t.pulse_push_m / t.pulse_push_ticks;
        const wasDraining = shade.state === 'drain';
        shade.pushTicks = t.pulse_push_ticks;
        shade.pushVector = [px, pz];
        shade.state = 'stunned';
        shade.stunTicksLeft = t.pulse_stun_ticks;
        shade.safeZoneTicks = 0;
        this.scoreValue += wasDraining ? this.score.per_drain_stun : this.score.per_stun;
        shade.targetLanternId = null;
        shade.drainTicks = 0;
        stunnedIds.push(shade.id);
      }
      for (const drifter of this.drifters.slice().sort((a, b) => a.id.localeCompare(b.id))) {
        if (drifter.state === 'removed') continue;
        const distance = Math.hypot(
          drifter.pos[0] - center[0],
          drifter.pos[1] - center[1],
          drifter.pos[2] - center[2],
        );
        if (distance > t.pulse_radius) continue;
        if (drifter.state === 'chase') {
          drifter.state = 'flee';
          drifter.timer = 240;
        } else if (drifter.state === 'flee' && drifter.stolen > 0) {
          const amount = drifter.stolen;
          this._dropMotes(amount, drifter.pos);
          drifter.stolen = 0;
          drifter.state = 'flee';
          drifter.timer = 120;
          drifter.dropEventPending = amount;
        }
      }
      e.push({ name: 'pulse', data: { stunned_ids: stunnedIds } });
    }

    // Move shades in ID order.
    const playerSafe = this._playerInAnySafeZone();
    for (const shade of this.shades.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (shade.state === 'stunned') {
        if (shade.pushTicks > 0) {
          let nx = shade.pos[0] + shade.pushVector[0];
          let nz = shade.pos[2] + shade.pushVector[1];
          if (this._blockedByTower(nx, nz, shade.pos[1])) {
            shade.pushTicks = 0;
            continue;
          }
          [nx, nz] = this._repelSafeZones(nx, nz);
          [nx, nz] = this._clampToIsland(nx, nz);
          shade.pos[0] = nx;
          shade.pos[2] = nz;
          shade.pushTicks -= 1;
        }
        shade.stunTicksLeft = Math.max(0, shade.stunTicksLeft - 1);
        if (shade.stunTicksLeft === 0) {
          shade.state = 'wander';
          shade.targetLanternId = null;
        }
        continue;
      }
      if (shade.state === 'spawning') {
        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft <= 0) shade.state = 'wander';
        continue;
      }
      if (shade.safeZoneTicks > 0) {
        shade.safeZoneTicks -= 1;
        shade.stateTicksLeft = Math.max(0, shade.stateTicksLeft - 1);
        if (shade.safeZoneTicks === 0) shade.state = 'wander';
        continue;
      }
      if (shade.state === 'recoil') {
        const dx = shade.recoilVector?.[0] ?? 0;
        const dz = shade.recoilVector?.[1] ?? 0;
        let nx = shade.pos[0] + dx;
        let nz = shade.pos[2] + dz;
        [nx, nz] = this._repelSafeZones(nx, nz);
        [nx, nz] = this._clampToIsland(nx, nz);
        shade.pos[0] = nx;
        shade.pos[2] = nz;
        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft <= 0) shade.state = 'wander';
        continue;
      }
      const distance = hypotXZ(shade.pos, player.pos);
      if (shade.state === 'drain') {
        const target = this.lanterns.find((lantern) => lantern.id === shade.targetLanternId);
        if (distance <= 6) {
          shade.state = 'chase';
        } else if (!target || !target.lit || target.fuelTicks >= fuelThreshold || hypotXZ(shade.pos, target.pos) > 2) {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else {
          continue;
        }
      }
      if (shade.state === 'chase' && distance > t.shade_lose_radius) {
        shade.state = 'wander';
        shade.targetLanternId = null;
      }
      if (shade.state === 'wander' && distance <= t.shade_detect_radius && !playerSafe) {
        shade.state = 'chase';
        shade.targetLanternId = null;
      }
      if (shade.state === 'chase' && !playerSafe) {
        const dx = player.pos[0] - shade.pos[0];
        const dz = player.pos[2] - shade.pos[2];
        const length = Math.hypot(dx, dz);
        if (length <= 1e-9) continue;
        let nx = shade.pos[0] + (dx / length) * (this.map.shadeSpeed * DT);
        let nz = shade.pos[2] + (dz / length) * (this.map.shadeSpeed * DT);
        if (this._blockedByTower(nx, nz, shade.pos[1])) continue;
        const shadeGround = this._groundHeightAt(nx, nz);
        if (shadeGround !== null && shadeGround > shade.pos[1] + 0.25) continue;
        [nx, nz] = this._repelSafeZones(nx, nz);
        [nx, nz] = this._clampToIsland(nx, nz);
        shade.pos[0] = nx;
        shade.pos[2] = nz;
        shade.pos[1] = this._groundHeightAt(nx, nz) ?? shade.pos[1];
        continue;
      }
      if (shade.state !== 'wander') continue;
      const target = this._shadeLanternTarget(shade);
      shade.targetLanternId = target?.id ?? null;
      if (!target) continue;
      const targetDistance = hypotXZ(shade.pos, target.pos);
      if (targetDistance <= 2) {
        if (target.lit && target.fuelTicks < fuelThreshold) {
          shade.state = 'drain';
          shade.drainTicks = 0;
        }
        continue;
      }
      const dx = target.pos[0] - shade.pos[0];
      const dz = target.pos[2] - shade.pos[2];
      const length = Math.hypot(dx, dz);
      if (length <= 1e-9) continue;
      let nx = shade.pos[0] + (dx / length) * (this.map.shadeSpeed * DT);
      let nz = shade.pos[2] + (dz / length) * (this.map.shadeSpeed * DT);
      if (this._blockedByTower(nx, nz, shade.pos[1])) continue;
      const shadeGround = this._groundHeightAt(nx, nz);
      if (shadeGround !== null && shadeGround > shade.pos[1] + 0.25) continue;
      [nx, nz] = this._repelSafeZones(nx, nz);
      [nx, nz] = this._clampToIsland(nx, nz);
      shade.pos[0] = nx;
      shade.pos[2] = nz;
      shade.pos[1] = this._groundHeightAt(nx, nz) ?? shade.pos[1];
    }

    // Move Gió Lạc; it ignores safe zones and invulnerability.
    for (const drifter of this.drifters.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (drifter.state === 'removed') continue;
      if (drifter.dropEventPending) {
        e.push({ name: 'drifter_drop', data: { drifter_id: drifter.id, amount: drifter.dropEventPending } });
        drifter.dropEventPending = 0;
      }
      if (drifter.state === 'flee' && drifter.timer <= 0) {
        drifter.state = 'removed';
        continue;
      }
      const distance = hypotXZ(drifter.pos, player.pos);
      if (drifter.state === 'idle') {
        if (player.carried >= 5 && distance <= 15) drifter.state = 'chase';
        else {
          const phase = ((Number(drifter.id.replace(/^D/, '')) || 1) * 2.399963229728653 + this.simTick * DT * 0.5);
          drifter.pos[0] += Math.cos(phase) * 2 * DT;
          drifter.pos[2] += Math.sin(phase) * 2 * DT;
        }
      }
      if (drifter.state === 'chase' && (player.carried < 5 || distance > 15)) drifter.state = 'idle';
      let dx = 0;
      let dz = 0;
      let speed = 0;
      if (drifter.state === 'chase') {
        dx = player.pos[0] - drifter.pos[0];
        dz = player.pos[2] - drifter.pos[2];
        speed = 7;
      } else if (drifter.state === 'flee') {
        dx = drifter.pos[0] - player.pos[0];
        dz = drifter.pos[2] - player.pos[2];
        speed = 7;
      }
      const length = Math.hypot(dx, dz);
      if (length > 1e-9 && speed > 0) {
        drifter.pos[0] += (dx / length) * speed * DT;
        drifter.pos[2] += (dz / length) * speed * DT;
      }
    }

    // Contact resolution: Gió Lạc steals before Bóng Mực can hit.
    if (!recoveringAtStart && player.recoveryTicks === 0) {
      for (const drifter of this.drifters.slice().sort((a, b) => a.id.localeCompare(b.id))) {
        if (drifter.state !== 'chase' || hypotXZ(player.pos, drifter.pos) > 1.2) continue;
        const amount = Math.min(3, player.carried);
        player.carried -= amount;
        drifter.stolen = amount;
        drifter.state = 'flee';
        drifter.timer = 240;
        e.push({ name: 'drifter_steal', data: { drifter_id: drifter.id, amount, carried: player.carried } });
        break;
      }
      if (player.invulnTicks === 0 && !this._playerInAnySafeZone()) {
        for (const shade of this.shades.slice().sort((a, b) => a.id.localeCompare(b.id))) {
          if (shade.state === 'stunned' || shade.state === 'spawning') continue;
          if (
            hypotXZ(player.pos, shade.pos) > t.shade_hit_radius ||
            Math.abs(player.pos[1] - shade.pos[1]) > t.shade_hit_height
          ) continue;
          const dropped = Math.floor(player.carried / 2);
          player.carried -= dropped;
          if (dropped > 0) this._dropMotes(dropped, player.pos);
          player.flames -= 1;
          player.invulnTicks = t.invuln_ticks;
          const dx = shade.pos[0] - player.pos[0];
          const dz = shade.pos[2] - player.pos[2];
          const length = Math.hypot(dx, dz);
          shade.recoilVector = length > 1e-9
            ? [(dx / length) * (2 / 60), (dz / length) * (2 / 60)]
            : [2 / 60, 0];
          shade.state = 'recoil';
          shade.stateTicksLeft = 60;
          e.push({ name: 'player_hit', data: { by: 'shade', flames: player.flames, dropped } });
          break;
        }
      }
    }

    // Spawn on the new sim tick; new entities cannot act until the next tick.
    this.simTick += 1;
    const newSimTick = this.simTick;
    if (newSimTick >= this.nextMoteSpawnTick) {
      if (this.motes.length < t.mote_max_count) {
        const occupied = this.motes.map((mote) => mote.pos);
        const free = this.map.motePoints.filter((point) =>
          occupied.every((position) => hypotXZ(position, point) > 1));
        if (free.length > 0) {
          const point = free[this.rng.nextInt(free.length)].slice();
          this.motes.push({ id: `M${this.nextMoteId++}`, pos: point, kind: 'random', ttlTicks: null });
        }
      }
      this.nextMoteSpawnTick += t.mote_spawn_interval_ticks;
    }
    if (this.randomShades) {
      const firstTick = this.map.shadeStartTick;
      if (newSimTick === firstTick) {
        for (let i = 0; i < this.map.shadeInitialCount && this.shades.length < this.map.maxShades; i++) {
          this._spawnShade();
        }
      } else if (
        newSimTick > firstTick &&
        (newSimTick - firstTick) % this.map.shadeIntervalTicks === 0 &&
        this.shades.length < this.map.maxShades
      ) {
        this._spawnShade();
      }
    }
    if (this.randomDrifters && newSimTick % 1200 === 0 && this.drifters.filter((d) => d.state !== 'removed').length < 2) {
      const points = this.map.motePoints.filter((point) => hypotXZ(point, player.pos) >= 10);
      if (points.length > 0) {
        const pos = points[this.rng.nextInt(points.length)].slice();
        while (this.drifters.some((drifter) => drifter.id === `D${this.nextDrifterId}`)) this.nextDrifterId += 1;
        const id = `D${this.nextDrifterId++}`;
        this.drifters.push({ id, pos, state: 'idle', stolen: 0, timer: 0 });
      }
    }
    // End-condition precedence is intentional: no flames always loses first.
    if (player.flames <= 0) {
      this.gameState = 'lost';
      this.gameOverReason = 'no_flames';
    } else if (this.timeLeft() <= 0) {
      const requiredLit = Math.ceil(this.tuning.win_ratio * this.lanterns.length);
      if (this.lanterns.filter((lantern) => lantern.lit).length >= requiredLit) {
        this.gameState = 'won';
        this.gameOverReason = 'dawn_survived';
        this.scoreValue += this.lanterns
          .filter((lantern) => lantern.lit)
          .reduce((sum, lantern) => sum + this.score.per_dawn_lantern +
            Math.floor(lantern.fuelTicks / FUEL_TICKS_PER_UNIT), 0) +
          player.flames * this.score.per_flame_left;
      } else {
        this.gameState = 'lost';
        this.gameOverReason = 'dawn';
      }
    }
    if (this.isOver()) {
      e.push({ name: 'game_over', data: { result: this.gameState, reason: this.gameOverReason } });
    }

    this.allEvents.push(...e);
    return e;
  }
}

export { DEFAULT_MOTE_COUNT };
