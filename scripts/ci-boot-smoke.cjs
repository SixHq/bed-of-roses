// CI boot smoke: start the Node runtime headless, poll HTTP until it serves
// the shell, then shut down. Cross-platform (no curl/bash). Exits 0 on
// success, 1 on failure.
'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 7911);
const dataDir = mkdtempSync(path.join(tmpdir(), 'bor-smoke-'));

const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), BOR_DATA_DIR: dataDir },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exited = false;
child.on('exit', (code, signal) => {
  exited = true;
  if (!done) {
    console.error(`[smoke] runtime exited early (${signal || code})`);
    process.exit(1);
  }
});

let done = false;

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !exited) {
    const res = await get(`http://127.0.0.1:${PORT}/`);
    if (res && res.status === 200 && /<!doctype html/i.test(res.body)) {
      console.log('[smoke] runtime serves the shell — OK');
      done = true;
      child.kill();
      // Give it a moment to die, then hard-exit regardless.
      setTimeout(() => process.exit(0), 1500).unref();
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error('[smoke] runtime did not become ready within 60s');
  child.kill();
  process.exit(1);
}

main();
