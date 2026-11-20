/** Key bindings (presentation only): defaults, validation, conflict detection, labels. */
export const ACTIONS = ['up', 'left', 'down', 'right', 'jump', 'dash', 'interact', 'pulse', 'pause'];
export const ACTION_LABELS = {
  up: 'Move up', left: 'Move left', down: 'Move down', right: 'Move right',
  jump: 'Jump', dash: 'Dash', interact: 'Interact', pulse: 'Pulse', pause: 'Pause',
};
export const DEFAULT_BINDINGS = {
  up: ['KeyW'], left: ['KeyA'], down: ['KeyS'], right: ['KeyD'],
  jump: ['Space'], dash: ['ShiftLeft', 'ShiftRight'], interact: ['KeyE'], pulse: ['KeyF'], pause: ['Escape', 'KeyP'],
};
const RESERVED = new Set(['KeyR']); // R always restarts the Night

export const cloneBindings = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]]));

/** Accepts saved data only if every action has at least one string code and no code is shared. */
export function sanitizeBindings(saved) {
  if (!saved || typeof saved !== 'object') return cloneBindings(DEFAULT_BINDINGS);
  const out = {};
  const used = new Set();
  for (const action of ACTIONS) {
    const codes = saved[action];
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((c) => typeof c === 'string' && c.length > 0 && c.length < 24)) {
      return cloneBindings(DEFAULT_BINDINGS);
    }
    for (const c of codes) {
      if (used.has(c) || RESERVED.has(c)) return cloneBindings(DEFAULT_BINDINGS);
      used.add(c);
    }
    out[action] = [...codes];
  }
  return out;
}

/** Returns the other action already using `code`, or null. */
export function findConflict(bindings, action, code) {
  if (RESERVED.has(code)) return 'restart';
  for (const other of ACTIONS) if (other !== action && bindings[other].includes(code)) return other;
  return null;
}

export function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab' };
  return map[code] ?? code;
}
