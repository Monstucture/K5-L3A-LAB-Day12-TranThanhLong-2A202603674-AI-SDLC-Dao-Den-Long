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
  ISLAND_RADIUS,
  LANTERN_POSITIONS,
  DEFAULT_MOTE_COUNT,
  SHADE_SCHEDULE,
} from './tuning.js';
import { resolveScenarioFlags } from '../contract/scenario.js';

function hypotXZ(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}
function rnd3(v) {
  return [
    Math.round(v[0] * 1000) / 1000,
    Math.round(v[1] * 1000) / 1000,
    Math.round(v[2] * 1000) / 1000,
  ];
}

export class Simulation {
  constructor(tuning, seed, scenarioConfig, extra = {}) {
    this.tuning = { ...TUNING, ...tuning };
    this.score = { ...TUNING.score, ...(tuning.score || {}) };
    this.seed = seed;
    this.rng = createRng(seed);
    this.gameState = 'playing';
    this.gameOverReason = null;
    this.events = []; // per-step event buffer
    this.allEvents = []; // cumulative (used by tests / GUI logs)
    this.lastPulseTick = -Infinity;
    this.simTick = 0;
    this.extra = extra; // e.g. { randomJiggle: false }

    // Input state (persisted between frames; absent fields keep previous value).
    this.input = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false };
    this.prevInput = { ...this.input };

    this._buildWorld(resolveScenarioFlags(scenarioConfig, this.tuning));
  }

  _buildWorld(flags) {
    const t = this.tuning;

    // Player
    this.player = {
      pos: flags.playerPos.slice(),
      flames: flags.flames,
      carried: flags.carried,
      grounded: true,
      vy: 0,
      invulnUntil: -Infinity,
    };

    // Lanterns
    this.lanterns = [];
    for (const id of Object.keys(LANTERN_POSITIONS)) {
      const pos = LANTERN_POSITIONS[id].slice();
      let deposited = 0;
      let lit = false;
      const ov = (flags.lanterns || []).find((l) => l.id === id);
      if (ov) {
        if (ov.pos) pos.splice(0, 3, ...ov.pos);
        if (ov.deposited !== undefined) deposited = ov.deposited;
        if (ov.lit !== undefined) lit = ov.lit;
        // Scenario sets lit=true without deposited -> deposited already = lantern_cost (scenario.js)
      }
      this.lanterns.push({ id, pos, lit, deposited });
    }
    // Scenario lit flag without deposited was normalised to deposited=lantern_cost.
    for (const l of this.lanterns) {
      if (l.deposited >= t.lantern_cost) l.lit = true;
    }

    // Motes
    const motesCfg = flags.motes;
    if (motesCfg !== null) {
      this.motes = motesCfg.map((p, i) => ({ id: `M${i + 1}`, pos: p.slice() }));
    } else if (flags.randomMotes) {
      this.motes = this._generateMotes(DEFAULT_MOTE_COUNT);
    } else {
      this.motes = [];
    }

    // Shades (initial). Schedule spawns later if randomShades.
    this.randomShades = flags.randomShades;
    const reserved = this.randomShades ? new Set(SHADE_SCHEDULE.map((s) => s.id)) : new Set();
    const taken = new Set();
    this.shades = [];
    let n = 1;
    for (const s of flags.shades) {
      let id = s.id;
      if (id === undefined) {
        while (taken.has(`S${n}`) || reserved.has(`S${n}`)) n++;
        id = `S${n}`;
        n++;
      }
      taken.add(id);
      const state = s.state === 'stunned' ? 'stunned' : 'chase';
      this.shades.push({
        id,
        pos: s.pos.slice(),
        state,
        stunUntil: state === 'stunned' ? this.simTick : this.simTick,
        stunScored: false,
      });
    }
    // Sort shades by ID (stable ordering).
    this.shades.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.reservedShadeIds = reserved;

    // Clock & score
    this.initialTimeLeftS = flags.timeLeftS;
    this.scoreValue = 0;
    this.litCount = this.lanterns.filter((l) => l.lit).length;
  }

  _generateMotes(count) {
    const out = [];
    // Distribute across the island, deterministic via seeded RNG. Keep a small
    // inner margin so motes are reachable without leaving the island.
    for (let i = 0; i < count; i++) {
      const radius = Math.sqrt(this.rng.next()) * (ISLAND_RADIUS - 2);
      const angle = this.rng.next() * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      out.push({ id: `M${i + 1}`, pos: [x, 0, z] });
    }
    return out;
  }

  // ------------------------------------------------------------------ helpers
  timeLeft() {
    return this.initialTimeLeftS - this.simTick / TICKS_PER_SEC;
  }

  _litLanternCenters() {
    return this.lanterns.filter((l) => l.lit).map((l) => l.pos);
  }

  _playerInAnySafeZone() {
    const sr = this.tuning.safe_radius;
    for (const l of this.lanterns) {
      if (l.lit && hypotXZ(this.player.pos, l.pos) <= sr) return true;
    }
    return false;
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

  _clampToIsland(x, z) {
    const d = Math.hypot(x, z);
    const r = ISLAND_RADIUS;
    if (d > r) {
      if (d < 1e-9) {
        x = r;
        z = 0;
      } else {
        x = (x / d) * r;
        z = (z / d) * r;
      }
    }
    return [x, z];
  }

  _spawnShade(id) {
    const t = this.tuning;
    const centers = this._litLanternCenters();
    let attempts = 0;
    let pos;
    while (attempts < 200) {
      const radius = this.rng.next() * (ISLAND_RADIUS - 4);
      const angle = this.rng.next() * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      attempts++;
      if (hypotXZ([x, 0, z], this.player.pos) < 6) continue;
      let tooCloseToSafe = false;
      for (const c of centers) {
        if (hypotXZ([x, 0, z], c) < t.safe_radius + 1) {
          tooCloseToSafe = true;
          break;
        }
      }
      if (!tooCloseToSafe) {
        pos = [x, 0, z];
        break;
      }
    }
    if (!pos) pos = [this.rng.next() * 10 - 5, 0, this.rng.next() * 10 - 5];
    this.shades.push({ id, pos, state: 'chase', stunUntil: -Infinity, stunScored: false });
    this.shades.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.events.push({ name: 'shade_spawned', data: { id } });
  }

  // -------------------------------------------------------------------------
  // Public API used by GUI and tests.
  // -------------------------------------------------------------------------
  isOver() {
    return this.gameState !== 'playing';
  }

  /** Write the current tick-0 snapshot line (before any step). */
  snapshotObject() {
    const t = this.timeLeft();
    return {
      type: 'snapshot',
      tick: this.simTick,
      sim_tick: this.simTick,
      state: this.gameState,
      time_left_s: Math.round(t * 1000) / 1000,
      score: this.scoreValue,
      player: this.snapshotPlayer(),
      lanterns: this.snapshotLanterns(),
      shades: this.snapshotShades(),
      motes_active: this.activeMotes().length,
      motes: this.activeMotes().map((m) => ({ id: m.id, pos: rnd3(m.pos) })),
    };
  }
  snapshotPlayer() {
    return { pos: rnd3(this.player.pos), flames: this.player.flames, carried: this.player.carried };
  }
  snapshotLanterns() {
    return this.lanterns
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((l) => ({ id: l.id, pos: rnd3(l.pos), lit: l.lit, deposited: l.deposited }));
  }
  snapshotShades() {
    return this.shades
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => ({ id: s.id, pos: rnd3(s.pos), state: s.state }));
  }
  activeMotes() {
    return this.motes.slice().sort((a, b) => {
      const na = parseInt(a.id.slice(1), 10);
      const nb = parseInt(b.id.slice(1), 10);
      return na - nb;
    });
  }

  /** Apply an incoming input frame (tick already handled by caller). */
  applyInputFrame(frame) {
    if (frame.move) this.input.move = [frame.move[0], frame.move[1]];
    if (frame.camYawDeg !== undefined) this.input.camYawDeg = frame.camYawDeg;
    if (frame.jump !== undefined) this.input.jump = frame.jump;
    if (frame.interact !== undefined) this.input.interact = frame.interact;
    if (frame.pulse !== undefined) this.input.pulse = frame.pulse;
  }

  // -------------------------------------------------------------------------
  // One simulation step (tick). PRD §14.3 order.
  // -------------------------------------------------------------------------
  step() {
    if (this.isOver()) return this.events;

    const t = this.tuning;
    const e = this.events = [];
    const now = this.simTick; // state current sim_tick (state k)

    // --- 1. input edge detection -------------------------------------------------
    const pressJump = this.input.jump && !this.prevInput.jump;
    const pressInteract = this.input.interact && !this.prevInput.interact;
    const pressPulse = this.input.pulse && !this.prevInput.pulse;
    this.prevInput = { ...this.input };

    // --- 2. horizontal movement --------------------------------------------------
    let mx = this.input.move[0];
    let mz = this.input.move[1];
    let len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
      len = 1;
    }
    let vx = 0;
    let vz = 0;
    if (len > 0) {
      const th = (this.input.camYawDeg * Math.PI) / 180;
      const px = mx * Math.cos(th) + mz * Math.sin(th);
      const pz = -mx * Math.sin(th) + mz * Math.cos(th);
      vx = px * t.player_speed;
      vz = pz * t.player_speed;
      this.player.pos[0] += vx * DT;
      this.player.pos[2] += vz * DT;
    }

    // --- 3. jump/gravity + boundary ---------------------------------------------
    if (pressJump && this.player.grounded) {
      this.player.grounded = false;
      this.player.vy = JUMP_VELOCITY;
    }
    if (!this.player.grounded) {
      this.player.pos[1] += this.player.vy * DT;
      this.player.vy -= GRAVITY * DT;
      if (this.player.pos[1] <= 0) {
        this.player.pos[1] = 0;
        this.player.grounded = true;
        this.player.vy = 0;
      }
    }
    const clamped = this._clampToIsland(this.player.pos[0], this.player.pos[2]);
    this.player.pos[0] = clamped[0];
    this.player.pos[2] = clamped[1];

    // --- 4. mote collection (ID ascending) ----------------------------------------
    const activeMotes = this.activeMotes();
    for (const m of activeMotes) {
      if (this.player.carried >= t.carry_capacity) break;
      if (hypotXZ(this.player.pos, m.pos) <= t.pickup_radius) {
        this.motes = this.motes.filter((x) => x.id !== m.id);
        this.player.carried += 1;
        this.scoreValue += this.score.per_mote;
        e.push({ name: 'mote_picked', data: { carried: this.player.carried } });
      }
    }

    // --- 5. lantern interact (rising edge) ---------------------------------------
    if (pressInteract) {
      const candidates = this.lanterns
        .filter((l) => !l.lit && hypotXZ(this.player.pos, l.pos) <= t.interact_radius)
        .map((l) => ({ id: l.id, d: hypotXZ(this.player.pos, l.pos) }));
      let target = null;
      for (const c of candidates) {
        if (!target || c.d < target.d - 1e-9 || (Math.abs(c.d - target.d) <= 1e-9 && c.id < target.id)) {
          target = c;
        }
      }
      if (target) {
        const lan = this.lanterns.find((l) => l.id === target.id);
        const need = t.lantern_cost - lan.deposited;
        const amount = Math.min(this.player.carried, need);
        if (amount > 0) {
          this.player.carried -= amount;
          lan.deposited += amount;
          e.push({ name: 'deposit', data: { lantern_id: lan.id, amount, deposited: lan.deposited } });
          if (lan.deposited >= t.lantern_cost && !lan.lit) {
            lan.lit = true;
            this.litCount += 1;
            this.scoreValue += this.score.per_lantern;
            e.push({ name: 'lantern_lit', data: { lantern_id: lan.id } });
          }
        }
      }
    }

    // --- 6. pulse (rising edge) --------------------------------------------------
    if (pressPulse) {
      const cooldownTicks = Math.round(t.pulse_cooldown_s * TICKS_PER_SEC);
      const cooled = now - this.lastPulseTick >= cooldownTicks;
      if (this.player.carried >= t.pulse_cost && cooled) {
        this.player.carried -= t.pulse_cost;
        this.lastPulseTick = now;
        const stunnedIds = [];
        const centers = this._litLanternCenters();
        const sr = t.safe_radius;
        // Affect shades in radius; push outward.
        for (const s of this.shades) {
          const d = hypotXZ(this.player.pos, s.pos);
          if (d <= t.pulse_radius) {
            // Apply push only to non-stunned shades? PRD: each affected shade pushed
            // & stunned. Shades currently not stunned become stunned now.
            // Push the shade *away* from the player by pulse_push_m metres
            // (displacement, not "teleport to distance pulse_push_m" — a shade
            // already farther than pulse_push_m must not be pulled closer).
            let dx = s.pos[0] - this.player.pos[0];
            let dz = s.pos[2] - this.player.pos[2];
            const d = Math.hypot(dx, dz);
            let pushX;
            let pushZ;
            if (d > 1e-9) {
              pushX = s.pos[0] + (dx / d) * t.pulse_push_m;
              pushZ = s.pos[2] + (dz / d) * t.pulse_push_m;
            } else {
              pushX = s.pos[0] + t.pulse_push_m;
              pushZ = s.pos[2];
            }
            let [nx, nz] = [pushX, pushZ];
            // Clamp out of safe zones then to island.
            [nx, nz] = this._repelSafeZones(nx, nz);
            [nx, nz] = this._clampToIsland(nx, nz);
            s.pos[0] = nx;
            s.pos[2] = nz;
            s.pos[1] = 0;
            if (s.state !== 'stunned') {
              if (!s.stunScored) {
                this.scoreValue += this.score.per_stun;
                s.stunScored = true;
              }
              stunnedIds.push(s.id);
            }
            s.state = 'stunned';
            s.stunUntil = now + Math.round(t.pulse_stun_s * TICKS_PER_SEC);
          }
        }
        e.push({ name: 'pulse', data: { stunned_ids: stunnedIds } });
      }
    }

    // --- 7. spawn shades per schedule --------------------------------------------
    if (this.randomShades) {
      const st = now + 1; // shade_spawned event carries tick = new state tick
      for (const s of SHADE_SCHEDULE) {
        if (s.tick === st && !this.shades.some((x) => x.id === s.id)) {
          this._spawnShade(s.id);
        }
      }
    }

    // --- 8. shade AI (ID ascending), incl. stun + safe zones ----------------------
    const sorted = this.shades.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const zones = this._litLanternCenters();
    const playerSafe = this._playerInAnySafeZone();
    for (const s of sorted) {
      if (s.state === 'stunned') {
        if (now >= s.stunUntil) s.state = 'chase';
        continue; // stunned: no movement, no damage
      }
      // state 'chase': resolve safe-zone behaviour
      const inside = zones.some((c) => hypotXZ(s.pos, c) <= t.safe_radius);
      if (inside) {
        // Flee out of the safe zone.
        const [rx, rz] = this._repelSafeZones(s.pos[0], s.pos[2]);
        s.pos[0] = rx;
        s.pos[2] = rz;
        continue;
      }
      if (playerSafe) {
        // Player is safe: shade stops (does not chase into the zone).
        continue;
      }
      // Chase toward player, avoiding safe zones.
      let dx = this.player.pos[0] - s.pos[0];
      let dz = this.player.pos[2] - s.pos[2];
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-9) {
        dx /= dl;
        dz /= dl;
        let nx = s.pos[0] + dx * (t.shade_speed * DT);
        let nz = s.pos[2] + dz * (t.shade_speed * DT);
        [nx, nz] = this._repelSafeZones(nx, nz);
        [nx, nz] = this._clampToIsland(nx, nz);
        s.pos[0] = nx;
        s.pos[2] = nz;
        s.pos[1] = 0;
      }
    }

    // --- 9. shade-player collision + invulnerability ------------------------------
    if (!playerSafe && now >= this.player.invulnUntil) {
      for (const s of sorted) {
        if (s.state === 'stunned') continue;
        if (hypotXZ(this.player.pos, s.pos) <= t.shade_hit_radius) {
          // hit_drop_ratio baseline = 0 -> no drops.
          const dropped = Math.floor(this.player.carried * t.hit_drop_ratio);
          if (t.hit_drop_ratio > 0 && dropped > 0) {
            this.player.carried -= dropped;
          }
          this.player.flames -= 1;
          this.player.invulnUntil = now + Math.round(t.invuln_s * TICKS_PER_SEC);
          e.push({ name: 'player_hit', data: { by: 'shade', flames: this.player.flames, dropped } });
          break;
        }
      }
    }

    // --- 10. advance clock; check end conditions ----------------------------------
    this.simTick += 1;
    const newTick = this.simTick;

    let ended = false;
    if (this.lanterns.every((l) => l.lit)) {
      this.gameState = 'won';
      this.gameOverReason = 'all_lit';
      ended = true;
    } else if (this.player.flames <= 0) {
      this.gameState = 'lost';
      this.gameOverReason = 'no_flames';
      ended = true;
    } else if (this.timeLeft() <= 0) {
      this.gameState = 'lost';
      this.gameOverReason = 'dawn';
      ended = true;
    }

    if (ended) {
      // Bonus only when winning. PRD §10.2.
      if (this.gameState === 'won') {
        this.scoreValue +=
          Math.floor(this.timeLeft()) * this.score.per_second_left +
          this.player.flames * this.score.per_flame_left;
      }
      e.push({
        name: 'game_over',
        data: { result: this.gameState, reason: this.gameOverReason },
      });
    }

    this.allEvents.push(...e);
    return e;
  }
}

export { DEFAULT_MOTE_COUNT };
