/**
 * Input contract — parse & validate an inputs JSON. PRD §15.
 *
 * Schema errors throw `InputError` (handled as exit code 2 by the CLI).
 */
export class InputError extends Error {}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseInputs(raw) {
  if (raw == null) return []; // no inputs
  if (typeof raw !== 'object' || !Array.isArray(raw.frames)) {
    throw new InputError('inputs must be an object with a "frames" array');
  }

  const frames = [];
  let prevTick = -1;
  for (const f of raw.frames) {
    if (typeof f !== 'object' || f === null) {
      throw new InputError('each input frame must be an object');
    }
    if (!isNum(f.tick) || !Number.isInteger(f.tick)) {
      throw new InputError('input frame.tick must be an integer');
    }
    if (f.tick <= prevTick) {
      throw new InputError('input frame ticks must be strictly increasing');
    }
    prevTick = f.tick;

    const frame = { tick: f.tick };
    if (f.move !== undefined) {
      if (
        !Array.isArray(f.move) ||
        f.move.length !== 2 ||
        !isNum(f.move[0]) ||
        !isNum(f.move[1]) ||
        f.move[0] < -1 ||
        f.move[0] > 1 ||
        f.move[1] < -1 ||
        f.move[1] > 1
      ) {
        throw new InputError('input frame.move must be an [x,z] with each part in [-1,1]');
      }
      frame.move = [f.move[0], f.move[1]];
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) throw new InputError('input frame.cam_yaw_deg must be a number');
      frame.camYawDeg = f.cam_yaw_deg;
    }
    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause']) {
      if (f[key] !== undefined) {
        if (typeof f[key] !== 'boolean') throw new InputError(`input frame.${key} must be a boolean`);
        frame[key] = f[key];
      }
    }
    frames.push(frame);
  }
  return frames;
}
