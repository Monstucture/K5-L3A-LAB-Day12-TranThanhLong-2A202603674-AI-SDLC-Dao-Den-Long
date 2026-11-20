/**
 * Benchmark launcher (Ticket-04 §1).
 *   node src/bench.js --seed 42 --duration 30 --out bench.json [--port 8090] [--no-open]
 *
 * Starts the local game server, opens a 1280x720 non-fullscreen browser window on the
 * benchmark scene (/?bench=1), waits for the page to POST its measurements, writes the
 * JSON and exits 0. With --no-open it only prints the URL so you can open it yourself.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { startServer } from './game/server.js';

function parse(argv) {
  const opt = { seed: 42, duration: 30, out: null, port: 8090, open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') opt.seed = Number(argv[++i]);
    else if (a === '--duration') opt.duration = Number(argv[++i]);
    else if (a === '--out') opt.out = argv[++i];
    else if (a === '--port') opt.port = Number(argv[++i]);
    else if (a === '--no-open') opt.open = false;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!Number.isInteger(opt.seed) || !(opt.duration > 0) || !opt.out) throw new Error('usage: --seed <int> --duration <s> --out <file.json>');
  return opt;
}

const BROWSERS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

function openBrowser(baseUrl) {
  let url = baseUrl;
  const exe = (BROWSERS[process.platform] ?? []).find((p) => fs.existsSync(p));
  if (exe) {
    // Chromium flags: app window of exactly 1280x720, vsync and the frame-rate cap off.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'may-bench-'));
    const args = [`--app=${url}&novsync=1`, '--window-size=1280,720', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--user-data-dir=${profile}`, '--no-first-run'];
    spawn(exe, args, { stdio: 'ignore', detached: true }).unref();
    return { novsync: true, launched: exe };
  }
  url += '&novsync=0';
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
  return { novsync: false, launched: 'default browser (vsync could not be disabled)' };
}

const startedAt = Date.now();
let opt;
try { opt = parse(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }

const timeout = setTimeout(() => { process.stderr.write('benchmark timed out (no result from the page)\n'); process.exit(1); }, (opt.duration + 120) * 1000);
const server = startServer(opt.port, {
  quiet: true,
  onBenchResult(result) {
    result.os = `${os.type()} ${os.release()} (${os.platform()} ${os.arch()}) — ${result.os}`;
    fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    clearTimeout(timeout);
    setTimeout(() => { server.close(); process.exit(0); }, 200);
  },
});
server.on('listening', () => {
  const base = `http://localhost:${opt.port}/?bench=1&seed=${opt.seed}&duration=${opt.duration}&start=${startedAt}`;
  if (!opt.open) { process.stdout.write(`Open ${base}&novsync=0 in a 1280x720 window\n`); return; }
  const info = openBrowser(base);
  if (!info.novsync) process.stdout.write(`${info.launched}\n`);
});
