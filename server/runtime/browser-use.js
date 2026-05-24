// browser-use installation detection.
//
// browser-use is BOR's default browser-automation backend (Gmail, social
// posting, scraping JS-rendered pages, dashboards, OAuth flows). It's a
// separate CLI the user has to install — BOR can't bundle it because it's
// a Python package that ships its own Chromium under the hood.
//
// We detect it once, cache for 60 s, expose the status to:
//   1. the onboarding UI (so users know if they need to install it), and
//   2. the prompt builder (so the browser-use skill is only loaded into
//      the system prompt when the CLI is actually available — no point
//      teaching the model to call a command that doesn't exist).

import { spawn } from 'node:child_process';

const CACHE_TTL_MS = 60_000;
let cache = null; // {result, expiresAt}
let inflight = null;

/**
 * Run a small probe command and capture stdout/stderr with a hard timeout.
 * Resolves to `{ok, stdout, stderr, code}` — never throws.
 */
function probe(cmd, args = [], { timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawn(cmd, args, { shell: false });
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: err?.message || 'spawn failed', code: -1 });
      return;
    }
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve(payload);
    };
    child.stdout?.on('data', (b) => { stdout += b.toString('utf8'); });
    child.stderr?.on('data', (b) => { stderr += b.toString('utf8'); });
    child.on('error', (err) => finish({ ok: false, stdout, stderr: stderr || err.message, code: -1 }));
    child.on('close', (code) => finish({ ok: code === 0, stdout, stderr, code }));
    setTimeout(() => finish({ ok: false, stdout, stderr: 'timeout', code: -2 }), timeoutMs);
  });
}

/**
 * Detect browser-use. Returns:
 *   { installed, path?, version?, doctorOk?, detail? }
 *
 * `installed` is the canonical signal — the rest is for the UI.
 *
 * @param {{forceRefresh?: boolean}} opts
 */
export async function detectBrowserUse(opts = {}) {
  const now = Date.now();
  if (!opts.forceRefresh && cache && cache.expiresAt > now) return cache.result;
  if (inflight) return inflight;

  inflight = (async () => {
    // `command -v` is more portable than `which` and works in zsh/bash/sh.
    const whichProbe = await probe('/bin/sh', ['-lc', 'command -v browser-use']);
    const path = whichProbe.ok ? whichProbe.stdout.trim() : '';
    if (!path) {
      const result = { installed: false, detail: 'browser-use not found on PATH' };
      cache = { result, expiresAt: now + CACHE_TTL_MS };
      inflight = null;
      return result;
    }

    // Try a quick version check — non-fatal if unsupported.
    const versionProbe = await probe('browser-use', ['--version'], { timeoutMs: 4000 });
    const version = versionProbe.ok ? versionProbe.stdout.trim() : '';

    const result = {
      installed: true,
      path,
      version: version || undefined,
    };
    cache = { result, expiresAt: now + CACHE_TTL_MS };
    inflight = null;
    return result;
  })();

  return inflight;
}

/**
 * Synchronous-ish read of the cached status. Returns `null` if we haven't
 * detected yet — callers that need a definite answer must `await detectBrowserUse()`.
 * Used by the prompt builder, which prefers to avoid a child-process spawn
 * on every chat turn.
 */
export function cachedBrowserUseStatus() {
  return cache?.result || null;
}

/**
 * Invalidate the cache (used when the onboarding UI signals a successful
 * install or when the user explicitly re-checks).
 */
export function invalidateBrowserUseCache() {
  cache = null;
}
