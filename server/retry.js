const DEFAULT_RETRY_ATTEMPTS = 10;
const DEFAULT_RETRY_BASE_DELAY_MS = 450;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;

export function retryAttemptsEnv(name, fallback = DEFAULT_RETRY_ATTEMPTS) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryDelayMs(attemptIndex, {
  baseMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxMs = DEFAULT_RETRY_MAX_DELAY_MS,
} = {}) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptIndex));
  const jitter = Math.round(Math.random() * Math.min(250, exp * 0.25));
  return exp + jitter;
}

export function makeEmptyResponseError(label = 'provider') {
  const err = new Error(`${label} returned an empty response`);
  err.code = 'BOR_EMPTY_RESPONSE';
  return err;
}

export function failureMessage(errOrText) {
  if (typeof errOrText === 'string') return errOrText;
  return [
    errOrText?.code,
    errOrText?.name,
    errOrText?.message,
    errOrText?.cause?.code,
    errOrText?.cause?.message,
  ].filter(Boolean).join(' ');
}

export function isRetryableFailureMessage(errOrText) {
  const text = failureMessage(errOrText).toLowerCase();
  if (!text) return false;
  // Hard non-retryable: validation, auth, missing args, posix file errors,
  // any 4xx HTTP class. These will fail every time — re-attempting wastes
  // the user's time and floods the log with retry lines. Bubble up to the
  // LLM on the first attempt so it can adapt (try a different path, ask
  // the user, abandon the step).
  if (/(required|missing|invalid|unsupported|does not support|not configured|unknown provider|no provider|too long|too large|forbidden|unauthorized|permission|rejected|must call|first, wait|bad request|not found|no such file|no such directory|is a directory|not a directory|file exists|enoent|eacces|eisdir|enotdir|eexist|enospc|eloop|eperm|enametoolong|401|403|404|405|406|410|413|414|422)/.test(text)) {
    return false;
  }
  // Explicit retryable: true transient network / server-overload conditions.
  // Anything outside this list is treated as permanent (return false) so
  // unknown errors fail fast — the LLM will decide what to do next.
  if (/(bor_empty_response|empty response|timeout|timed? out|abort|network|fetch failed|failed to fetch|enotfound|eai_again|econnreset|econnrefused|etimedout|socket|und_err|dns|rate limit|429|408|409|425|500|502|503|504|5\d\d)/.test(text)) {
    return true;
  }
  return false;
}
