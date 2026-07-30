// CI Electron smoke: launch the host with an isolated data dir, require it to
// stay alive (no crash) for a grace window, then shut it down. The host spawns
// its own runtime, so surviving the window proves boot + runtime spawn + first
// window creation didn't throw on this platform.
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const GRACE_MS = Number(process.env.SMOKE_ELECTRON_GRACE_MS || 20_000);

let electronBinary;
try {
  electronBinary = require('electron'); // resolves to the binary path in a plain-node process
} catch {
  console.error('[smoke] electron not installed');
  process.exit(1);
}

// NOTE: CI-only. The host anchors its presence registry at <repo>/os-data —
// fine on a disposable CI checkout, but running this locally would create a
// throwaway presence in your real registry.
const child = spawn(electronBinary, [path.join(ROOT, 'host', 'main.cjs'), '--disable-gpu'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(Number(process.env.SMOKE_PORT || 7913)),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exited = false;
let exitInfo = null;
child.on('exit', (code, signal) => { exited = true; exitInfo = { code, signal }; });

setTimeout(() => {
  if (exited) {
    console.error(`[smoke] electron host exited early (${exitInfo?.signal || exitInfo?.code})`);
    process.exit(1);
  }
  console.log(`[smoke] electron host alive after ${GRACE_MS}ms — OK`);
  child.kill();
  setTimeout(() => process.exit(0), 2000).unref();
}, GRACE_MS);
