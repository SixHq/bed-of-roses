// Shared internet connectivity monitor for chat + dreams.
//
// The shell polls /api/connectivity for UI state. Server-side LLM work uses
// the same status so chat and dream retries agree about whether the internet
// is currently usable.

const DEFAULT_TARGETS = [
  'https://www.google.com/generate_204',
  'https://www.gstatic.com/generate_204',
  'https://cloudflare.com/cdn-cgi/trace',
];
const PING_URLS = (process.env.BOR_CONNECTIVITY_URLS || process.env.BOR_CONNECTIVITY_URL || DEFAULT_TARGETS.join(','))
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const PING_INTERVAL_MS = Math.max(1000, Number(process.env.BOR_CONNECTIVITY_INTERVAL_MS) || 5000);
const PING_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_CONNECTIVITY_TIMEOUT_MS) || 4000);
const OFFLINE_AFTER_FAILURES = Math.max(1, Number(process.env.BOR_CONNECTIVITY_OFFLINE_AFTER_FAILURES) || 2);

let _timer = null;
let _checking = false;
const _listeners = new Set();

let _status = {
  online: true,
  checking: true,
  target: PING_URLS[0],
  targets: PING_URLS,
  intervalMs: PING_INTERVAL_MS,
  timeoutMs: PING_TIMEOUT_MS,
  offlineAfterFailures: OFFLINE_AFTER_FAILURES,
  checkedAt: null,
  lastOnlineAt: null,
  lastOfflineAt: null,
  error: null,
  probe: null,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
};

function publicStatus() {
  return { ..._status };
}

function notify() {
  const snapshot = publicStatus();
  for (const fn of _listeners) {
    try { fn(snapshot); } catch { /* ignore listener errors */ }
  }
}

function setStatus(patch) {
  const before = _status.online;
  _status = { ..._status, ...patch, checking: false, checkedAt: new Date().toISOString() };
  if (before !== _status.online) notify();
}

export function getConnectivityStatus() {
  return publicStatus();
}

export function onConnectivityChange(fn) {
  if (typeof fn !== 'function') return () => {};
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isLikelyNetworkError(err) {
  const text = [
    err?.code,
    err?.name,
    err?.message,
    err?.cause?.code,
    err?.cause?.message,
  ].filter(Boolean).join(' ').toLowerCase();
  return /network|fetch failed|failed to fetch|timeout|timed? out|enotfound|eai_again|econnreset|econnrefused|etimedout|socket|und_err|dns/.test(text);
}

async function probeTarget(url) {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: ac.signal,
    });
    clearTimeout(timeout);
    return { ok: res.status >= 200 && res.status < 500, url, status: res.status };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, url, error: e.message || 'connectivity check failed' };
  }
}

async function probeConnectivity() {
  const failures = [];
  for (const url of PING_URLS) {
    const result = await probeTarget(url);
    if (result.ok) return result;
    failures.push(result);
  }
  return { ok: false, failures, error: failures.map((f) => `${f.url}: ${f.error || f.status || 'failed'}`).join('; ') || 'connectivity check failed' };
}

export async function checkConnectivityNow() {
  if (_checking) return publicStatus();
  _checking = true;
  try {
    const result = await probeConnectivity();
    if (result.ok) {
      setStatus({
        online: true,
        target: result.url,
        lastOnlineAt: new Date().toISOString(),
        error: null,
        probe: result,
        consecutiveFailures: 0,
        consecutiveSuccesses: _status.consecutiveSuccesses + 1,
      });
      return publicStatus();
    }

    const failures = _status.consecutiveFailures + 1;
    setStatus({
      online: failures >= OFFLINE_AFTER_FAILURES ? false : _status.online,
      lastOfflineAt: failures >= OFFLINE_AFTER_FAILURES ? new Date().toISOString() : _status.lastOfflineAt,
      error: result.error,
      probe: result,
      consecutiveFailures: failures,
      consecutiveSuccesses: 0,
    });
  } catch (e) {
    const failures = _status.consecutiveFailures + 1;
    setStatus({
      online: failures >= OFFLINE_AFTER_FAILURES ? false : _status.online,
      lastOfflineAt: failures >= OFFLINE_AFTER_FAILURES ? new Date().toISOString() : _status.lastOfflineAt,
      error: e.message || 'connectivity check failed',
      probe: { ok: false, error: e.message || 'connectivity check failed' },
      consecutiveFailures: failures,
      consecutiveSuccesses: 0,
    });
  } finally {
    _checking = false;
  }
  return publicStatus();
}

export function startConnectivityMonitor({ log = console } = {}) {
  if (_timer) return;
  log.log(`[connectivity] monitor armed — ${PING_URLS.join(', ')} every ${Math.round(PING_INTERVAL_MS / 1000)}s`);
  checkConnectivityNow().catch((e) => log.warn?.('[connectivity] initial check failed:', e.message));
  _timer = setInterval(() => {
    checkConnectivityNow().catch((e) => log.warn?.('[connectivity] check failed:', e.message));
  }, PING_INTERVAL_MS);
  if (typeof _timer.unref === 'function') _timer.unref();
}

export function stopConnectivityMonitor() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

export function waitForOnline({ timeoutMs = 120_000 } = {}) {
  if (_status.online) return Promise.resolve(publicStatus());
  return new Promise((resolve) => {
    let done = false;
    const finish = (status) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      resolve(status);
    };
    const off = onConnectivityChange((status) => {
      if (status.online) finish(status);
    });
    const timer = setTimeout(() => finish(publicStatus()), timeoutMs);
  });
}
