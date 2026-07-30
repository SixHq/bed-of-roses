#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hostEntry = path.join(root, 'host', 'main.cjs');

const USAGE = `Bed of Roses — AI-native desktop companion

Usage:
  bor                       Launch the host (default).
  bor onboard               Launch the host and create a new presence with onboarding.
  bor create [name]         Register a new presence (headless). Prints its id.
  bor delete <presence_id>  Delete a presence + its data dir (headless).
  bor list                  List presences (headless). (alias: ls)
  bor --help | -h | help    Show this help.`;

// Headless ops never touch Electron — they require the pure-Node registry only.
function presences() {
  return require('../host/presences.cjs');
}

async function runHeadless(command, args) {
  switch (command) {
    case 'create': {
      const nickname = args.join(' ').trim() || 'New presence';
      const entry = await presences().createPresence({ nickname }, { nowMs: Date.now() });
      console.log(`Created presence ${entry.id} (${entry.nickname}).`);
      console.log('Run `bor onboard` to set it up, or restart Bed of Roses if it\'s already running.');
      return 0;
    }
    case 'delete': {
      const id = (args[0] || '').trim();
      if (!id) {
        console.error('Usage: bor delete <presence_id>');
        return 1;
      }
      const removed = await presences().deletePresence(id, { removeData: true });
      if (!removed) {
        console.error(`No presence with id ${id}.`);
        return 1;
      }
      console.log(`Deleted presence ${id}.`);
      console.log('If Bed of Roses is currently running, restart it for this to take effect.');
      return 0;
    }
    case 'list':
    case 'ls': {
      const list = await presences().listPresences();
      if (!list.length) {
        console.log('No presences yet. Run `bor onboard` to create one.');
        return 0;
      }
      const rows = list.map((p) => [p.id, p.nickname || '', p.onboarded ? 'yes' : 'no']);
      const headers = ['ID', 'NICKNAME', 'ONBOARDED'];
      const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
      const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
      console.log(fmt(headers));
      for (const row of rows) console.log(fmt(row));
      return 0;
    }
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;
    default:
      return null; // not a headless command
  }
}

function launchHost() {
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
    // Re-raise the child's death signal so shells see the real cause. On
    // Windows `signal` is effectively never set and arbitrary signal names
    // throw — fall through to a plain exit.
    if (signal) {
      try { process.kill(process.pid, signal); } catch { /* ignore */ }
    }
    process.exit(code ?? 0);
  });
}

const command = process.argv[2];
const HEADLESS = new Set(['create', 'delete', 'list', 'ls', 'help', '--help', '-h']);

if (HEADLESS.has(command)) {
  runHeadless(command, process.argv.slice(3))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`bor ${command}: ${err.message}`);
      process.exit(1);
    });
} else {
  // Default + `onboard`: launch Electron, forwarding all args (the `onboard`
  // token rides along in process.argv.slice(2) and is read by main.cjs).
  launchHost();
}
