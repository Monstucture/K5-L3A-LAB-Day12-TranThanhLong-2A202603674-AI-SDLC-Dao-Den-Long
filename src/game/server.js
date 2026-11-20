/** Minimal static file server for the browser GUI (+ leaderboard API). Cross-platform. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, loadEntries } from '../leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function readBody(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** hooks.onBenchResult(obj) is called when the benchmark page posts its measurements. */
export function startServer(port, hooks = {}) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    try {
      if (urlPath === '/api/leaderboard' && req.method === 'GET') return json(res, 200, { entries: loadEntries() });
      if (urlPath === '/api/leaderboard' && req.method === 'POST') {
        const entries = addEntry(JSON.parse(await readBody(req)));
        return entries ? json(res, 200, { entries }) : json(res, 400, { error: 'invalid entry' });
      }
      if (urlPath === '/api/bench-result' && req.method === 'POST' && hooks.onBenchResult) {
        hooks.onBenchResult(JSON.parse(await readBody(req, 1 << 20)));
        return json(res, 200, { ok: true });
      }
    } catch (error) {
      return json(res, 400, { error: String(error.message || error) });
    }
    let filePath = urlPath === '/' ? '/src/game/index.html' : urlPath;
    filePath = path.normalize(path.join(ROOT, filePath));
    // Prevent path traversal; never serve the saved data directory except through the API.
    if (!filePath.startsWith(path.resolve(ROOT)) || filePath.startsWith(path.join(ROOT, 'data'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type });
      res.end(data);
    });
  });
  server.listen(port, () => {
    if (!hooks.quiet) console.log(`Mây và Đêm Đảo Bến — http://localhost:${port}/`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer(Number(process.argv[2]) || 8080);
}
