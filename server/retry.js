const DEFAULT_RETRY_ATTEMPTS = 10;
const DEFAULT_RETRY_BASE_DELAY_MS = 450;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;

// Mid-stream recovery backoff for the chat loop. Slower and wider than the
// tool-executor schedule above: a dead provider stream usually means the
// upstream is resetting or overloaded, and hammering it sub-second makes it
// worse. Retry-After (when the provider sends one) can stretch a step up to
// the hard cap.
const STREAM_RETRY_SCHEDULE_MS = [1000, 2500, 6000, 15_000, 30_000];
const STREAM_RETRY_MAX_DELAY_MS = 60_000;
// Per-turn wall-clock ceiling for consecutive stream-failure recovery. The
// clock starts at the first failure of an incident and resets on the next
// genuinely successful stream, so one blip early in a long turn doesn't eat
// the budget for a blip an hour later.
const DEFAULT_STREAM_RETRY_BUDGET_MS = 180_000;

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

// ---------- Mid-stream failure classification (chat loop) ----------

function httpStatusOf(err) {
  const direct = Number(err?.status ?? err?.statusCode ?? err?.cause?.status);
  if (Number.isFinite(direct) && direct >= 100 && direct <= 599) return direct;
  // Providers embed the status in the message: "Anthropic 529: …",
  // "Custom endpoint 500: …", "HTTP 429". Match a standalone 4xx/5xx token.
  const m = /(?:^|[\s(])([45]\d\d)(?=[:\s)]|$)/.exec(failureMessage(err));
  return m ? Number(m[1]) : 0;
}

/**
 * Classify a dead/failed LLM stream for the chat loop's auto-retry.
 * Returns { retryable, kind, waitHintMs }.
 *
 * Order matters: the user's abort signal wins over everything (a user Stop
 * must NEVER be retried), then hard non-retryable classes (auth, invalid
 * request, context length, safety refusal), then the transient classes.
 */
export function classifyStreamFailure(err, { signal = null } = {}) {
  if (signal?.aborted) return { retryable: false, kind: 'user_abort', waitHintMs: null };
  const text = failureMessage(err).toLowerCase();
  const status = httpStatusOf(err);
  const hint = Number(err?.retryAfterMs ?? err?.cause?.retryAfterMs);
  const waitHintMs = Number.isFinite(hint) && hint >= 0 ? hint : null;

  // Auth / key problems — retrying re-fails and hides the real fix (the
  // provider_config_required flow opens settings for these).
  if (status === 401 || status === 403
    || /unauthorized|forbidden|invalid[ _-]?api[ _-]?key|incorrect api key|authentication|api key not valid/.test(text)) {
    return { retryable: false, kind: 'auth', waitHintMs: null };
  }
  // Context length / oversized request — deterministic, retry can't help.
  if (/context[ _-]?(?:window|length)|maximum context|too many tokens|prompt is too long|token limit|exceeds? the (?:model|maximum)|request too large|payload too large/.test(text)) {
    return { retryable: false, kind: 'context_length', waitHintMs: null };
  }
  // Safety refusals — deterministic.
  if (/content policy|content_filter|safety (?:filter|system|setting)|blocked by safety|prohibited content/.test(text)) {
    return { retryable: false, kind: 'safety', waitHintMs: null };
  }
  // Retryable HTTP classes.
  if (status === 408 || status === 425) return { retryable: true, kind: 'timeout', waitHintMs };
  if (status === 429) return { retryable: true, kind: 'rate_limit', waitHintMs };
  if (status === 529) return { retryable: true, kind: 'overloaded', waitHintMs };
  if (status >= 500 && status <= 599) return { retryable: true, kind: 'server_error', waitHintMs };
  // Any other 4xx is a permanent request problem (400/404/405/413/422 …).
  if (status >= 400 && status <= 499) return { retryable: false, kind: 'invalid_request', waitHintMs: null };
  // Provider "we're busy" text without a usable status code.
  if (/overloaded|temporarily unavailable|server is busy|service unavailable|at capacity|try again later/.test(text)) {
    return { retryable: true, kind: 'overloaded', waitHintMs };
  }
  if (/rate limit|too many requests|quota exceeded|resource[ _-]?exhausted/.test(text)) {
    return { retryable: true, kind: 'rate_limit', waitHintMs };
  }
  // Idle stall — our own watchdog killed a stream that stopped producing.
  if (/idle timeout|stopped responding/.test(text)) {
    return { retryable: true, kind: 'idle_stall', waitHintMs };
  }
  // Truncated SSE — the stream ended without the provider's finish marker,
  // or the socket died under the reader (undici "terminated").
  if (err?.code === 'BOR_TRUNCATED_STREAM'
    || /without a completion marker|premature close|err_stream_premature|terminated|other side closed/.test(text)) {
    return { retryable: true, kind: 'truncated_stream', waitHintMs };
  }
  if (err?.code === 'BOR_EMPTY_RESPONSE' || /empty response/.test(text)) {
    return { retryable: true, kind: 'empty_response', waitHintMs };
  }
  // Network resets / DNS blips / hangups / fetch aborts not caused by the user.
  if (/network|fetch failed|failed to fetch|enotfound|eai_again|econnreset|econnrefused|epipe|etimedout|timed? out|timeout|socket hang up|socket|und_err|dns|abort/.test(text)) {
    return { retryable: true, kind: 'network', waitHintMs };
  }
  // Unknown errors fail fast — same policy as isRetryableFailureMessage.
  return { retryable: false, kind: 'unknown', waitHintMs: null };
}

// ---------- Stream retry policy ----------

export function streamRetryBudgetMs() {
  const raw = Number(process.env.BOR_STREAM_RETRY_BUDGET_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.round(raw);
  return DEFAULT_STREAM_RETRY_BUDGET_MS;
}

// Parse an HTTP Retry-After header value (delta-seconds or HTTP-date) → ms.
export function parseRetryAfterMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(String(value));
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

// Backoff step for the Nth stream recovery of the current incident.
// Honors a provider wait hint (Retry-After) when it asks for MORE than the
// schedule would wait, capped at STREAM_RETRY_MAX_DELAY_MS.
export function streamRetryDelayMs(retryIndex, { waitHintMs = null } = {}) {
  const idx = Math.max(0, Math.min(STREAM_RETRY_SCHEDULE_MS.length - 1, Math.round(retryIndex) || 0));
  let base = STREAM_RETRY_SCHEDULE_MS[idx];
  if (Number.isFinite(waitHintMs) && waitHintMs > 0) {
    base = Math.max(base, Math.min(waitHintMs, STREAM_RETRY_MAX_DELAY_MS));
  }
  const jitter = Math.round(Math.random() * Math.min(1000, base * 0.2));
  return base + jitter;
}

// Abort-aware sleep. Resolves true when the full delay elapsed, false when
// the signal fired first — the caller must bail out without retrying.
export function sleepWithAbort(ms, signal) {
  if (!signal) return sleep(ms).then(() => true);
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => { cleanup(); resolve(false); };
    const timer = setTimeout(() => { cleanup(); resolve(true); }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
