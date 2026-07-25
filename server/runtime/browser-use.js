// browser-use installation detection.
//
// browser-use is BOR's FALLBACK browser-automation backend (the ambient
// browser_* tags are the default). It's a separate CLI the user has to
// install — BOR can't bundle it because it's a Python package that ships
// its own Chromium under the hood.
//
// We detect it, cache for 10 min, and expose the status to:
//   1. the /api/browser-use/status route, and
//   2. the prompt builder (so the browser-use skill is only loaded into
//      the system prompt when the CLI is actually available — no point
//      teaching the model to call a command that doesn't exist).
//
// DETECTION MUST BE PASSIVE. Probes are limited to `command -v`,
// `--version`, and `--help`. Never pipe a script into the CLI here: on the
// v3 harness that cold-starts its persistent CDP daemon, which pokes the
// user's real Chrome and repeatedly opens chrome://inspect/#remote-debugging
// tabs on their desktop. The daemon may only ever start when the MODEL
// deliberately runs browser-use via execute_command.

import { spawn } from 'node:child_process';

// Long TTL on purpose: this runs from the prompt builder on chat turns, and
// browser-use is fallback-only — churn here buys nothing.
const CACHE_TTL_MS = 10 * 60_000;
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
 * Extract `{major, minor}` from a version string like "browser-use 0.13.6"
 * or "0.13.6". Returns null when nothing version-shaped is present.
 */
function parseVersionParts(version) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(version || '');
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Detect browser-use. Returns:
 *   { installed, path?, version?, cliGeneration, detail? }
 *
 * `installed` is the canonical signal — the rest is for the UI.
 *
 * `cliGeneration` — 3 for the "CLI 3.0" harness interface (>= 0.13: Python
 * piped to stdin against a persistent CDP daemon that attaches to the user's
 * running Chrome), 2 for the old verb-subcommand CLI (open/click/type/…),
 * null when we can't tell. The prompt builder uses this to pick which skill
 * text to teach the model.
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
      const result = {
        installed: false,
        cliGeneration: null,
        detail: 'browser-use not found on PATH',
      };
      cache = { result, expiresAt: now + CACHE_TTL_MS };
      inflight = null;
      return result;
    }

    // Probe via the resolved absolute path, not the bare command name: the
    // login shell above sees the user's full PATH (~/.local/bin etc.), but
    // this process may not (e.g. Electron launched from Finder).
    // Try a quick version check — non-fatal if unsupported.
    const versionProbe = await probe(path, ['--version'], { timeoutMs: 4000 });
    const version = versionProbe.ok ? versionProbe.stdout.trim() : '';

    // CLI generation: the --help sniff is AUTHORITATIVE. Version numbers are
    // unreliable across the repackaged CLI builds — a real-world v3 harness
    // build reports 0.1.6 while the main package numbers it 0.13.x — but the
    // v3 help text always advertises the stdin interface (the `<<'PY'`
    // heredoc, "pre-imported" helpers, auto-starting daemon). Version is only
    // the tiebreak when --help is unavailable.
    let cliGeneration = null;
    const helpProbe = await probe(path, ['--help'], { timeoutMs: 4000 });
    const helpText = `${helpProbe.stdout}\n${helpProbe.stderr}`;
    if (/<<\s*'PY'|stdin|harness|pre-imported|pip(?:e|ed|ing)\b.{0,20}python|python.{0,20}pip(?:e|ed|ing)\b/i.test(helpText)) {
      cliGeneration = 3;
    } else if (helpProbe.ok && /\b(open|state|click|profile)\b/.test(helpText)) {
      cliGeneration = 2;
    } else {
      const parts = parseVersionParts(version);
      if (parts) cliGeneration = parts.major === 0 && parts.minor >= 13 ? 3 : 2;
      else if (helpProbe.ok) cliGeneration = 2;
    }

    // NO daemon-liveness probe. Piping even `print(1)` into the v3 CLI
    // cold-starts its persistent CDP daemon, which attaches to the user's
    // real Chrome and opens chrome://inspect/#remote-debugging tabs on
    // their desktop — repeatedly, since this detection re-runs when the
    // cache expires. Detection stays passive; the daemon starts only when
    // the model deliberately invokes browser-use through execute_command.
    const result = {
      installed: true,
      path,
      version: version || undefined,
      cliGeneration,
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
