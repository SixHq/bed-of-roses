import { Cron } from 'croner';

const ISO_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T/;
const CRON_EVAL_CACHE_MAX = 512;
const cronEvalCache = new Map();

function normalizeUtcIso(raw) {
  if (ISO_TZ_RE.test(raw)) return raw;
  if (ISO_DATE_RE.test(raw)) return `${raw}T00:00:00Z`;
  if (ISO_DATE_TIME_RE.test(raw)) return `${raw}Z`;
  return raw;
}

export function parseAbsoluteTimeMs(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const parsed = Date.parse(normalizeUtcIso(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

export function coerceFiniteScheduleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resolveCronTimezone(tz) {
  const trimmed = String(tz || '').trim();
  if (trimmed) return trimmed;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCachedCron(expr, timezone) {
  const key = `${timezone}\u0000${expr}`;
  const cached = cronEvalCache.get(key);
  if (cached) {
    cronEvalCache.delete(key);
    cronEvalCache.set(key, cached);
    return cached;
  }
  if (cronEvalCache.size >= CRON_EVAL_CACHE_MAX) {
    const oldest = cronEvalCache.keys().next().value;
    if (oldest) cronEvalCache.delete(oldest);
  }
  const next = new Cron(expr, { timezone, catch: false });
  cronEvalCache.set(key, next);
  return next;
}

function resolveCronFromSchedule(schedule) {
  const exprSource = typeof schedule.expr === 'string' ? schedule.expr : schedule.cron;
  if (typeof exprSource !== 'string') throw new Error('invalid cron schedule: expr is required');
  const expr = exprSource.trim();
  if (!expr) return undefined;
  return resolveCachedCron(expr, resolveCronTimezone(schedule.tz));
}

export function computeNextRunAtMs(schedule, nowMs) {
  if (!schedule || typeof schedule !== 'object') return undefined;

  if (schedule.kind === 'at') {
    const atMs =
      typeof schedule.atMs === 'number' && Number.isFinite(schedule.atMs) && schedule.atMs > 0
        ? schedule.atMs
        : typeof schedule.atMs === 'string'
          ? parseAbsoluteTimeMs(schedule.atMs)
          : typeof schedule.at === 'string'
            ? parseAbsoluteTimeMs(schedule.at)
            : null;
    if (atMs === null) return undefined;
    return atMs > nowMs ? atMs : undefined;
  }

  if (schedule.kind === 'every') {
    const everyMsRaw = coerceFiniteScheduleNumber(schedule.everyMs);
    if (everyMsRaw === undefined) return undefined;
    const everyMs = Math.max(1, Math.floor(everyMsRaw));
    const anchorRaw = coerceFiniteScheduleNumber(schedule.anchorMs);
    const anchor = Math.max(0, Math.floor(anchorRaw ?? nowMs));
    if (nowMs < anchor) return anchor;
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    return anchor + steps * everyMs;
  }

  if (schedule.kind !== 'cron') return undefined;
  const cron = resolveCronFromSchedule(schedule);
  if (!cron) return undefined;
  const next = cron.nextRun(new Date(nowMs));
  if (!next) return undefined;
  const nextMs = next.getTime();
  if (!Number.isFinite(nextMs)) return undefined;

  // Copied from OpenClaw's guard: croner can occasionally return a non-future
  // timestamp for some timezone/date combinations. Retry from later cursors.
  if (nextMs <= nowMs) {
    const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
    const retry = cron.nextRun(new Date(nextSecondMs));
    if (retry) {
      const retryMs = retry.getTime();
      if (Number.isFinite(retryMs) && retryMs > nowMs) return retryMs;
    }
    const tomorrowMs = new Date(nowMs).setUTCHours(24, 0, 0, 0);
    const retry2 = cron.nextRun(new Date(tomorrowMs));
    if (retry2) {
      const retry2Ms = retry2.getTime();
      if (Number.isFinite(retry2Ms) && retry2Ms > nowMs) return retry2Ms;
    }
    return undefined;
  }

  return nextMs;
}

export function clearCronScheduleCacheForTest() {
  cronEvalCache.clear();
}

