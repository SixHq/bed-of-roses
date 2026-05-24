#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  MCP_CLI,
  MCP_OUTPUT_DIR,
  MCP_PROFILE_DIR,
  PROJECT_ROOT,
  ensureBrowserDirs,
  resolveBrowserExecutable,
  truthy,
} from '../runtime/browser.js';

function chooseBrowserArgs() {
  if (process.env.BOR_BROWSER_CHANNEL) {
    return ['--browser', process.env.BOR_BROWSER_CHANNEL];
  }
  const resolved = resolveBrowserExecutable();
  return resolved.ok ? ['--executable-path', resolved.executablePath] : [];
}

function buildArgs() {
  const args = [
    MCP_CLI,
    '--user-data-dir', MCP_PROFILE_DIR,
    '--output-dir', MCP_OUTPUT_DIR,
    '--viewport-size', process.env.BOR_BROWSER_VIEWPORT || '1440x1000',
    '--timeout-action', process.env.BOR_BROWSER_ACTION_TIMEOUT || '10000',
    '--timeout-navigation', process.env.BOR_BROWSER_NAVIGATION_TIMEOUT || '90000',
    '--snapshot-mode', process.env.BOR_BROWSER_SNAPSHOT_MODE || 'full',
    '--image-responses', process.env.BOR_BROWSER_IMAGE_RESPONSES || 'allow',
    ...chooseBrowserArgs(),
  ];

  if (truthy(process.env.BOR_BROWSER_HEADLESS)) args.push('--headless');
  if (truthy(process.env.BOR_BROWSER_NO_SANDBOX)) args.push('--no-sandbox');
  if (truthy(process.env.BOR_BROWSER_BLOCK_SERVICE_WORKERS)) args.push('--block-service-workers');
  if (process.env.BOR_BROWSER_ALLOWED_ORIGINS) args.push('--allowed-origins', process.env.BOR_BROWSER_ALLOWED_ORIGINS);
  if (process.env.BOR_BROWSER_BLOCKED_ORIGINS) args.push('--blocked-origins', process.env.BOR_BROWSER_BLOCKED_ORIGINS);

  args.push(...process.argv.slice(2));
  return args;
}

function main() {
  if (!existsSync(MCP_CLI)) {
    console.error('[bor-browser] @playwright/mcp is not installed. Run npm install first.');
    process.exit(1);
  }
  ensureBrowserDirs();

  const child = spawn(process.execPath, buildArgs(), {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main();
