/**
 * Scenario contract — parse & validate a scenario JSON into a normalised
 * config that the Simulation Core can apply. PRD §16.
 *
 * Schema errors throw `ScenarioError` so the headless CLI can exit code 2.
 */
import { LANTERN_POSITIONS, DEFAULT_MOTE_COUNT } from '../core/tuning.js';

export class ScenarioError extends Error {}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isPos3(v) {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => isFiniteNumber(n))
  );
}
function isBool(v) {
  return typeof v === 'boolean';
}

function normLanterns(raw, tuning) {
  const byId = new Set(Object.keys(LANTERN_POSITIONS));
  const out = [];
  if (raw == null) return out; // all defaults
  if (!Array.isArray(raw)) throw new ScenarioError('scenario.lanterns must be an array');
  const seen = new Set();
  for (const l of raw) {
    if (typeof l !== 'object' || l === null) throw new ScenarioError('scenario.lanterns item must be an object');
    const id = l.id;
    if (typeof id !== 'string' || !byId.has(id)) throw new ScenarioError(`invalid lantern id: ${JSON.stringify(id)}`);
    if (seen.has(id)) throw new ScenarioError(`duplicate lantern id: ${id}`);
    seen.add(id);
    const entry = { id };
    if (l.pos !== undefined) {
      if (!isPos3(l.pos)) throw new ScenarioError(`lantern ${id}: pos must be [x,y,z]`);
      entry.pos = l.pos.slice();
    }
    let deposited = null;
    let lit = null;
    if (l.deposited !== undefined) {
      if (!isFiniteNumber(l.deposited)) throw new ScenarioError(`lantern ${id}: deposited must be a number`);
      deposited = l.deposited;
    }
    if (l.lit !== undefined) {
      if (!isBool(l.lit)) throw new ScenarioError(`lantern ${id}: lit must be a boolean`);
      lit = l.lit;
    }
    if (deposited !== null) {
      if (deposited < 0 || deposited > tuning.lantern_cost) {
        throw new ScenarioError(`lantern ${id}: deposited out of [0, lantern_cost]`);
      }
    }
    if (lit === true && deposited === null) deposited = tuning.lantern_cost;
    if (deposited !== null) entry.deposited = deposited;
    if (lit !== null) entry.lit = lit;
    out.push(entry);
  }
  return out;
}

function normMotes(raw, tuning) {
  if (raw === undefined) return null; // means "not provided" -> default spawn logic decides
  if (!Array.isArray(raw)) throw new ScenarioError('scenario.motes must be an array');
  const out = [];
  for (const m of raw) {
    if (!isPos3(m)) throw new ScenarioError(`mote position must be [x,y,z], got ${JSON.stringify(m)}`);
    out.push(m.slice());
  }
  return out;
}

function normShades(raw) {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) throw new ScenarioError('scenario.shades must be an array');
  const out = [];
  const seen = new Set();
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) throw new ScenarioError('scenario.shades item must be an object');
    const pos = s.pos;
    if (!isPos3(pos)) throw new ScenarioError(`shade pos must be [x,y,z], got ${JSON.stringify(pos)}`);
    const entry = { pos: pos.slice() };
    if (s.id !== undefined) {
      if (typeof s.id !== 'string' || s.id.length === 0) {
        throw new ScenarioError(`shade id must be a non-empty string, got ${JSON.stringify(s.id)}`);
      }
      if (seen.has(s.id)) throw new ScenarioError(`duplicate shade id: ${s.id}`);
      seen.add(s.id);
      entry.id = s.id;
    }
    if (s.state !== undefined) {
      if (s.state !== 'chase' && s.state !== 'stunned') {
        throw new ScenarioError(`shade state must be 'chase' or 'stunned', got ${JSON.stringify(s.state)}`);
      }
      entry.state = s.state;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Parse a raw scenario object.
 * @param {object|null} raw scenario JSON content, or null for "no scenario".
 * @param {object} tuning effective tuning.
 */
export function parseScenario(raw, tuning) {
  const flags = {
    playerPos: null,
    carried: null,
    flames: null,
    randomMotes: null,
    motes: null,
    randomShades: null,
    shades: null,
    timeLeftS: null,
  };

  if (raw == null) return flags;

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScenarioError('scenario must be a JSON object');
  }

  if (raw.player !== undefined) {
    if (typeof raw.player !== 'object' || raw.player === null) {
      throw new ScenarioError('scenario.player must be an object');
    }
    if (raw.player.pos !== undefined) {
      if (!isPos3(raw.player.pos)) throw new ScenarioError('scenario.player.pos must be [x,y,z]');
      flags.playerPos = raw.player.pos.slice();
    }
    if (raw.player.carried !== undefined) {
      if (!isFiniteNumber(raw.player.carried)) throw new ScenarioError('scenario.player.carried must be a number');
      if (raw.player.carried < 0 || raw.player.carried > tuning.carry_capacity) {
        throw new ScenarioError(`scenario.player.carried out of [0, carry_capacity]`);
      }
      flags.carried = raw.player.carried;
    }
    if (raw.player.flames !== undefined) {
      if (!isFiniteNumber(raw.player.flames)) throw new ScenarioError('scenario.player.flames must be a number');
      if (raw.player.flames < 0 || raw.player.flames > tuning.flames) {
        throw new ScenarioError(`scenario.player.flames out of [0, tuning.flames]`);
      }
      flags.flames = raw.player.flames;
    }
  }

  if (raw.random_motes !== undefined) {
    if (!isBool(raw.random_motes)) throw new ScenarioError('scenario.random_motes must be a boolean');
    flags.randomMotes = raw.random_motes;
  }
  if (raw.random_shades !== undefined) {
    if (!isBool(raw.random_shades)) throw new ScenarioError('scenario.random_shades must be a boolean');
    flags.randomShades = raw.random_shades;
  }

  flags.motes = normMotes(raw.motes, tuning);
  flags.shades = normShades(raw.shades);

  const lanterns = normLanterns(raw.lanterns, tuning);
  flags.lanterns = lanterns;

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s)) throw new ScenarioError('scenario.time_left_s must be a number');
    if (raw.time_left_s < 0) throw new ScenarioError('scenario.time_left_s must be >= 0');
    flags.timeLeftS = raw.time_left_s;
  }

  return flags;
}

/** Defaults applied by the game when fields are absent. */
export function resolveScenarioFlags(flags, tuning) {
  // Use ?? so both null (from parseScenario) and undefined (e.g. a bare {}
  // passed from the GUI for a default game) resolve to sensible defaults.
  return {
    playerPos: flags.playerPos || [0, 0, 0],
    carried: flags.carried ?? 0,
    flames: flags.flames ?? tuning.flames,
    randomMotes: flags.randomMotes ?? true,
    motes: flags.motes ?? null, // null -> generated when randomMotes true, else none
    randomShades: flags.randomShades ?? true,
    shades: flags.shades ?? [],
    timeLeftS: flags.timeLeftS ?? tuning.night1_duration_s,
    lanterns: flags.lanterns ?? [],
  };
}

export { DEFAULT_MOTE_COUNT };
