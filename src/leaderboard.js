/**
 * Local leaderboard (Ticket-04 §3). Stored on disk at data/leaderboard.json by the
 * game server; the GUI also keeps a localStorage copy as a fallback.
 * CLI: node src/leaderboard.js --export out.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEADERBOARD_FILE = path.join(ROOT, 'data', 'leaderboard.json');
export const MAX_ENTRIES = 10;
// 3-12 characters: ASCII letters/digits/underscore, plus Vietnamese letters (bonus).
export const NAME_RE = /^[A-Za-z0-9_À-ỹ]{3,12}$/u;

export function validateEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.normalize('NFC') : '';
  const score = Number(raw.score);
  const nightsWon = Number(raw.nights_won);
  const seed = Number(raw.seed);
  if (!NAME_RE.test(name)) return null;
  if (!Number.isFinite(score) || score < 0) return null;
  if (!Number.isInteger(nightsWon) || nightsWon < 0 || nightsWon > 3) return null;
  if (!Number.isFinite(seed)) return null;
  const at = typeof raw.achieved_at === 'string' && !Number.isNaN(Date.parse(raw.achieved_at)) ? raw.achieved_at : null;
  if (!at) return null;
  return { name, score: Math.floor(score), nights_won: nightsWon, achieved_at: at, seed: Math.floor(seed) };
}

/** Score descending; ties keep the earlier achieved_at on top. Keeps the best ten. */
export function rank(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e)
    .slice(0, MAX_ENTRIES);
}

export function loadEntries(file = LEADERBOARD_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return rank((parsed.entries ?? []).map(validateEntry).filter(Boolean));
  } catch {
    return [];
  }
}

export function addEntry(raw, file = LEADERBOARD_FILE) {
  const entry = validateEntry(raw);
  if (!entry) return null;
  const entries = rank([...loadEntries(file), entry]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ entries }, null, 2) + '\n');
  return entries;
}

export function exportEntries(out, file = LEADERBOARD_FILE) {
  const entries = loadEntries(file);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ entries }, null, 2) + '\n');
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--export');
  if (i < 0 || !process.argv[i + 1]) {
    process.stderr.write('usage: node src/leaderboard.js --export <out.json>\n');
    process.exit(2);
  }
  exportEntries(process.argv[i + 1]);
}
