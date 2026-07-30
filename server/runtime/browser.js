import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const BROWSER_DATA_ROOT = resolvePath(process.env.BOR_BROWSER_DATA_DIR || join(PROJECT_ROOT, '.bed-of-roses', 'browser'));
export const MCP_PROFILE_DIR = resolvePath(process.env.BOR_BROWSER_USER_DATA_DIR || join(BROWSER_DATA_ROOT, 'profile'));
export const USER_PROFILE_DIR = resolvePath(process.env.BOR_USER_BROWSER_USER_DATA_DIR || join(BROWSER_DATA_ROOT, 'user-profile'));
export const USER_DOWNLOADS_DIR = resolvePath(process.env.BOR_USER_BROWSER_DOWNLOADS_DIR || join(process.env.BOR_DATA_DIR ? resolve(process.env.BOR_DATA_DIR) : join(PROJECT_ROOT, 'os-data'), 'files', 'Downloads'));
export const MCP_OUTPUT_DIR = resolvePath(process.env.BOR_BROWSER_OUTPUT_DIR || join(BROWSER_DATA_ROOT, 'output'));
export const MCP_CLI = join(PROJECT_ROOT, 'node_modules', '@playwright', 'mcp', 'cli.js');
export const PLAYWRIGHT_CLI = join(PROJECT_ROOT, 'node_modules', 'playwright', 'cli.js');

export function resolvePath(value) {
  if (!value) return value;
  return resolve(String(value).replaceAll('${PROJECT_ROOT}', PROJECT_ROOT).replaceAll('$PROJECT_ROOT', PROJECT_ROOT));
}

export function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ''));
}

export function falsey(value) {
  return /^(0|false|no|off)$/i.test(String(value || ''));
}

export function systemBrowserExecutable() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : process.platform === 'win32'
      ? [
          process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ].filter(Boolean)
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
          '/usr/bin/microsoft-edge',
        ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export function bundledChromiumExecutable() {
  try {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import { chromium } from 'playwright'; process.stdout.write(chromium.executablePath());",
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0) return result.stdout.trim();
  } catch {
    // Fall through to browser installation.
  }
  return null;
}

export function installChromium() {
  if (!existsSync(PLAYWRIGHT_CLI)) return false;
  console.error('[bor-browser] installing bundled Chromium for first browser run...');
  const result = spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

export function resolveBrowserExecutable({ userFacing = false } = {}) {
  const explicit = userFacing
    ? (process.env.BOR_USER_BROWSER_EXECUTABLE_PATH || process.env.BOR_BROWSER_EXECUTABLE_PATH)
    : process.env.BOR_BROWSER_EXECUTABLE_PATH;
  if (explicit) {
    const executablePath = resolvePath(explicit);
    return existsSync(executablePath)
      ? { ok: true, source: 'env', executablePath }
      : { ok: false, source: 'env', error: `Browser executable not found: ${executablePath}` };
  }

  const systemBrowser = systemBrowserExecutable();
  if (systemBrowser) return { ok: true, source: 'system', executablePath: systemBrowser };

  if (!truthy(process.env.BOR_BROWSER_SKIP_INSTALL)) {
    let bundled = bundledChromiumExecutable();
    if (!bundled || !existsSync(bundled)) {
      if (!falsey(process.env.BOR_BROWSER_AUTO_INSTALL) && installChromium()) {
        bundled = bundledChromiumExecutable();
      }
    }
    if (bundled && existsSync(bundled)) return { ok: true, source: 'playwright', executablePath: bundled };
  }

  return {
    ok: false,
    source: 'none',
    error: 'No Chrome/Chromium executable found. Install Chrome or run npm run browser:install.',
  };
}

export function ensureBrowserDirs() {
  mkdirSync(BROWSER_DATA_ROOT, { recursive: true });
  mkdirSync(MCP_PROFILE_DIR, { recursive: true });
  mkdirSync(USER_PROFILE_DIR, { recursive: true });
  mkdirSync(USER_DOWNLOADS_DIR, { recursive: true });
  mkdirSync(MCP_OUTPUT_DIR, { recursive: true });
}
