#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hostEntry = path.join(root, 'v2', 'host', 'main.cjs');

let electronExecutable;
try {
  electronExecutable = require('electron');
} catch {
  console.error('Bed of Roses v2 requires Electron. Run `npm install`, then `npx bor` again.');
  process.exit(1);
}

const child = spawn(electronExecutable, [hostEntry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
