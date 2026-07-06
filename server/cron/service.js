import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { DATA_DIR } from '../protocol/paths.js';
import { addNotification } from '../notifications.js';
import { computeNextRunAtMs, coerceFiniteScheduleNumber, parseAbsoluteTimeMs } from './schedule.js';

const CRON_DIR = join(DATA_DIR, 'cron');
export const DEFAULT_CRON_STORE_PATH = join(CRON_DIR, 'jobs.json');
const MAX_TIMER_DELAY_MS = 60_000;
const MIN_REFIRE_GAP_MS = 2_000;
const STUCK_RUN_MS = 2 * 60 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

function normalizeStore(parsed) {
  const rawJobs = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.jobs)
      ? parsed.jobs
      : [];
  return {
    version: 1,
    jobs: rawJobs.filter(isRecord).map(normalizePersistedJob).filter(Boolean),
  };
}

function normalizeName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('cron job name is required');
  return text.slice(0, 120);
}

function normalizeOptionalString(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function normalizeSchedule(input = {}, nowMs = Date.now()) {
  if (!isRecord(input)) throw new Error('cron schedule object is required');
  const kind = String(input.kind || (input.everyMs !== undefined || input.every !== undefined ? 'every' : input.expr || input.cron ? 'cron' : 'at')).trim();

  if (kind === 'at') {
    const raw = input.at ?? input.atMs;
    const atMs = typeof raw === 'number' ? raw : parseAbsoluteTimeMs(String(raw || ''));
    if (!Number.isFinite(atMs) || atMs <= 0) throw new Error('schedule.kind="at" requires at or atMs');
    return { kind: 'at', at: new Date(Math.floor(atMs)).toISOString() };
  }

  if (kind === 'every') {
    const rawEvery = input.everyMs ?? input.every;
    const everyMs = coerceFiniteScheduleNumber(rawEvery);
    if (everyMs === undefined || everyMs < 1) throw new Error('schedule.kind="every" requires everyMs > 0');
    const anchor = coerceFiniteScheduleNumber(input.anchorMs);
    return {
      kind: 'every',
      everyMs: Math.max(1, Math.floor(everyMs)),
      anchorMs: Math.max(0, Math.floor(anchor ?? nowMs)),
    };
  }

  if (kind === 'cron') {
    const expr = String(input.expr ?? input.cron ?? '').trim();
    if (!expr) throw new Error('schedule.kind="cron" requires expr');
    const out = { kind: 'cron', expr };
    const tz = normalizeOptionalString(input.tz);
    if (tz) out.tz = tz;
    const staggerMs = coerceFiniteScheduleNumber(input.staggerMs ?? input.stagger);
    if (staggerMs !== undefined) out.staggerMs = Math.max(0, Math.floor(staggerMs));
    return out;
  }

  throw new Error(`unsupported cron schedule kind: ${kind}`);
}

function normalizePayload(input = {}) {
  if (!isRecord(input)) throw new Error('cron payload object is required');
  const kind = String(input.kind || (input.text !== undefined ? 'systemEvent' : 'agentTurn')).trim();
  if (kind === 'systemEvent') {
    const text = String(input.text || input.message || '').trim();
    if (!text) throw new Error('payload.kind="systemEvent" requires text');
    return { kind: 'systemEvent', text };
  }
  if (kind === 'agentTurn') {
    const message = String(input.message || input.text || '').trim();
    if (!message) throw new Error('payload.kind="agentTurn" requires message');
    const payload = { kind: 'agentTurn', message };
    for (const key of ['model', 'thinking']) {
      const value = normalizeOptionalString(input[key]);
      if (value) payload[key] = value;
    }
    if (Array.isArray(input.toolsAllow)) payload.toolsAllow = input.toolsAllow.map(String).filter(Boolean);
    if (typeof input.timeoutSeconds === 'number' && Number.isFinite(input.timeoutSeconds)) {
      payload.timeoutSeconds = Math.max(0, Math.floor(input.timeoutSeconds));
    }
    return payload;
  }
  throw new Error(`unsupported cron payload kind: ${kind}`);
}

function normalizePersistedJob(raw) {
  try {
    const now = Date.now();
    const createdAtMs = Number.isFinite(raw.createdAtMs) ? Math.floor(raw.createdAtMs) : now;
    const updatedAtMs = Number.isFinite(raw.updatedAtMs) ? Math.floor(raw.updatedAtMs) : createdAtMs;
    return {
      id: String(raw.id || `cron-${randomUUID()}`),
      name: normalizeName(raw.name || 'Scheduled task'),
      description: normalizeOptionalString(raw.description),
      enabled: raw.enabled !== false,
      deleteAfterRun: typeof raw.deleteAfterRun === 'boolean' ? raw.deleteAfterRun : raw.schedule?.kind === 'at',
      createdAtMs,
      updatedAtMs,
      schedule: normalizeSchedule(raw.schedule, createdAtMs),
      payload: normalizePayload(raw.payload),
      source: normalizeOptionalString(raw.source) || 'unknown',
      sourceSurfaceId: normalizeOptionalString(raw.sourceSurfaceId),
      state: isRecord(raw.state) ? raw.state : {},
    };
  } catch {
    return null;
  }
}

function normalizeJobCreate(input, nowMs) {
  if (!isRecord(input)) throw new Error('job object is required');
  const schedule = normalizeSchedule(input.schedule ?? input, nowMs);
  const payload = normalizePayload(input.payload ?? {
    kind: input.text ? 'systemEvent' : 'agentTurn',
    text: input.text,
    message: input.message,
  });
  return {
    name: normalizeName(input.name || (payload.kind === 'systemEvent' ? payload.text : payload.message).slice(0, 48)),
    description: normalizeOptionalString(input.description),
    enabled: input.enabled !== false,
    deleteAfterRun: typeof input.deleteAfterRun === 'boolean' ? input.deleteAfterRun : schedule.kind === 'at',
    schedule,
    payload,
    source: normalizeOptionalString(input.source) || 'agent',
    sourceSurfaceId: normalizeOptionalString(input.sourceSurfaceId),
  };
}

function applyJobPatch(job, patch, nowMs) {
  if (!isRecord(patch)) throw new Error('patch object is required');
  if ('name' in patch) job.name = normalizeName(patch.name);
  if ('description' in patch) job.description = normalizeOptionalString(patch.description);
  if ('enabled' in patch) job.enabled = patch.enabled !== false;
  if ('deleteAfterRun' in patch && typeof patch.deleteAfterRun === 'boolean') job.deleteAfterRun = patch.deleteAfterRun;
  if ('schedule' in patch) job.schedule = normalizeSchedule(patch.schedule, nowMs);
  if ('payload' in patch) job.payload = normalizePayload(patch.payload);
  if ('sourceSurfaceId' in patch) job.sourceSurfaceId = normalizeOptionalString(patch.sourceSurfaceId);
  job.updatedAtMs = nowMs;
  job.state.nextRunAtMs = job.enabled ? computeJobNextRunAtMs(job, nowMs) : undefined;
  if (!job.enabled) job.state.runningAtMs = undefined;
}

function isJobEnabled(job) {
  return job.enabled !== false;
}

function hasScheduledNextRunAtMs(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function computeJobNextRunAtMs(job, nowMs) {
  if (!isJobEnabled(job)) return undefined;
  if (!job.state) job.state = {};
  if (job.schedule.kind === 'every') {
    const everyMs = coerceFiniteScheduleNumber(job.schedule.everyMs);
    if (everyMs === undefined) return undefined;
    const lastRunAtMs = job.state.lastRunAtMs;
    if (typeof lastRunAtMs === 'number' && Number.isFinite(lastRunAtMs)) {
      const nextFromLastRun = Math.floor(lastRunAtMs) + Math.max(1, Math.floor(everyMs));
      if (nextFromLastRun > nowMs) return nextFromLastRun;
    }
  }
  if (job.schedule.kind === 'at') {
    const atMs = parseAbsoluteTimeMs(job.schedule.at || String(job.schedule.atMs || ''));
    if (job.state.lastRunStatus === 'ok' && job.state.lastRunAtMs) {
      return atMs && atMs > job.state.lastRunAtMs ? atMs : undefined;
    }
  }
  return computeNextRunAtMs(job.schedule, nowMs);
}

function recomputeNextRuns(store, nowMs) {
  let changed = false;
  for (const job of store.jobs) {
    job.state ||= {};
    if (!isJobEnabled(job)) {
      if (job.state.nextRunAtMs !== undefined || job.state.runningAtMs !== undefined) {
        job.state.nextRunAtMs = undefined;
        job.state.runningAtMs = undefined;
        changed = true;
      }
      continue;
    }
    const runningAt = job.state.runningAtMs;
    if (typeof runningAt === 'number' && nowMs - runningAt > STUCK_RUN_MS) {
      job.state.runningAtMs = undefined;
      job.state.lastRunStatus = 'error';
      job.state.lastError = 'cron: cleared stale running marker';
      changed = true;
    }
    const next = job.state.nextRunAtMs;
    if (!hasScheduledNextRunAtMs(next)) {
      const computed = computeJobNextRunAtMs(job, nowMs);
      if (job.state.nextRunAtMs !== computed) {
        job.state.nextRunAtMs = computed;
        changed = true;
      }
    }
  }
  return changed;
}

function nextWakeAtMs(store) {
  const values = (store?.jobs || [])
    .filter((job) => isJobEnabled(job) && hasScheduledNextRunAtMs(job.state?.nextRunAtMs))
    .map((job) => job.state.nextRunAtMs);
  return values.length ? Math.min(...values) : undefined;
}

function isJobDue(job, nowMs, { forced = false } = {}) {
  if (!job.state) job.state = {};
  if (typeof job.state.runningAtMs === 'number') return false;
  if (forced) return true;
  return isJobEnabled(job) && hasScheduledNextRunAtMs(job.state.nextRunAtMs) && nowMs >= job.state.nextRunAtMs;
}

function summarizeRecordedTurn(text) {
  const result = String(text || '').match(/<result>([\s\S]*?)<\/result>/i)?.[1];
  if (result?.trim()) return result.replace(/\s+/g, ' ').trim();
  const sayMatches = [...String(text || '').matchAll(/<say\b[^>]*>([\s\S]*?)<\/say>/gi)];
  const lastSay = sayMatches.at(-1)?.[1];
  if (lastSay?.trim()) return lastSay.replace(/\s+/g, ' ').trim();
  return '';
}

export class CronService {
  constructor(deps = {}) {
    this.deps = {
      storePath: deps.storePath || DEFAULT_CRON_STORE_PATH,
      nowMs: deps.nowMs || (() => Date.now()),
      log: deps.log || console,
      executeAgentTurn: deps.executeAgentTurn,
    };
    this.store = null;
    this.timer = null;
    this.running = false;
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);
  }

  async load() {
    await mkdir(dirname(this.deps.storePath), { recursive: true });
    if (!existsSync(this.deps.storePath)) {
      this.store = { version: 1, jobs: [] };
      return this.store;
    }
    try {
      this.store = normalizeStore(JSON.parse(await readFile(this.deps.storePath, 'utf8')));
    } catch (err) {
      throw new Error(`Failed to read cron store: ${err.message}`);
    }
    return this.store;
  }

  async persist() {
    if (!this.store) await this.load();
    await atomicWriteJson(this.deps.storePath, this.store);
  }

  async start() {
    await this.load();
    const now = this.deps.nowMs();
    let changed = false;
    for (const job of this.store.jobs) {
      if (typeof job.state?.runningAtMs === 'number') {
        job.state.lastRunAtMs = job.state.runningAtMs;
        job.state.lastRunStatus = 'error';
        job.state.lastError = 'cron: job interrupted by runtime restart';
        job.state.runningAtMs = undefined;
        changed = true;
      }
    }
    if (recomputeNextRuns(this.store, now) || changed) await this.persist();
    this.armTimer();
    this.deps.log.log?.(`[cron] scheduler started; jobs=${this.store.jobs.length}; next=${nextWakeAtMs(this.store) || 'none'}`);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async status() {
    if (!this.store) await this.load();
    return {
      enabled: true,
      storePath: this.deps.storePath,
      jobs: this.store.jobs.length,
      nextWakeAtMs: nextWakeAtMs(this.store) ?? null,
      running: this.running,
    };
  }

  async list(opts = {}) {
    if (!this.store) await this.load();
    const includeDisabled = opts.includeDisabled === true;
    return this.store.jobs
      .filter((job) => includeDisabled || isJobEnabled(job))
      .slice()
      .sort((a, b) => (a.state?.nextRunAtMs ?? Number.MAX_SAFE_INTEGER) - (b.state?.nextRunAtMs ?? Number.MAX_SAFE_INTEGER));
  }

  async get(id) {
    if (!this.store) await this.load();
    return this.store.jobs.find((job) => job.id === id);
  }

  async add(input) {
    if (!this.store) await this.load();
    const now = this.deps.nowMs();
    const normalized = normalizeJobCreate(input, now);
    const job = {
      id: `cron-${randomUUID()}`,
      createdAtMs: now,
      updatedAtMs: now,
      ...normalized,
      state: {},
    };
    job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
    this.store.jobs.push(job);
    recomputeNextRuns(this.store, now);
    await this.persist();
    this.armTimer();
    this.events.emit('event', { action: 'added', jobId: job.id, job });
    return job;
  }

  async update(id, patch) {
    if (!this.store) await this.load();
    const job = this.store.jobs.find((entry) => entry.id === id);
    if (!job) throw new Error(`unknown cron job id: ${id}`);
    applyJobPatch(job, patch, this.deps.nowMs());
    await this.persist();
    this.armTimer();
    this.events.emit('event', { action: 'updated', jobId: job.id, job });
    return job;
  }

  async remove(id) {
    if (!this.store) await this.load();
    const before = this.store.jobs.length;
    const removedJob = this.store.jobs.find((job) => job.id === id);
    this.store.jobs = this.store.jobs.filter((job) => job.id !== id);
    const removed = before !== this.store.jobs.length;
    if (removed) {
      await this.persist();
      this.armTimer();
      this.events.emit('event', { action: 'removed', jobId: id, job: removedJob });
    }
    return { ok: true, removed };
  }

  async run(id, mode = 'force') {
    if (!this.store) await this.load();
    const now = this.deps.nowMs();
    const job = this.store.jobs.find((entry) => entry.id === id);
    if (!job) throw new Error(`unknown cron job id: ${id}`);
    if (!isJobDue(job, now, { forced: mode === 'force' })) {
      return { ok: true, ran: false, reason: 'not-due' };
    }
    if (typeof job.state.runningAtMs === 'number') {
      return { ok: true, ran: false, reason: 'already-running' };
    }
    await this.executeJob(job, now);
    return { ok: true, ran: true };
  }

  armTimer() {
    this.stop();
    if (!this.store) return;
    const next = nextWakeAtMs(this.store);
    if (!hasScheduledNextRunAtMs(next)) return;
    const delay = Math.max(0, Math.min(MAX_TIMER_DELAY_MS, next - this.deps.nowMs()));
    this.timer = setTimeout(() => {
      this.tick().catch((err) => this.deps.log.error?.('[cron] tick failed:', err));
    }, delay);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.running) {
      this.armTimer();
      return;
    }
    if (!this.store) await this.load();
    this.running = true;
    try {
      const now = this.deps.nowMs();
      recomputeNextRuns(this.store, now);
      const due = this.store.jobs
        .filter((job) => isJobDue(job, now, { forced: false }))
        .sort((a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0));
      if (!due.length) {
        await this.persist();
        return;
      }
      for (const job of due) {
        await this.executeJob(job, this.deps.nowMs());
      }
    } finally {
      this.running = false;
      await this.persist().catch(() => {});
      this.armTimer();
    }
  }

  async executeJob(job, startedAt) {
    job.state ||= {};
    job.state.runningAtMs = startedAt;
    job.state.lastError = undefined;
    await this.persist();
    this.events.emit('event', { action: 'started', jobId: job.id, job, runAtMs: startedAt });

    const runId = `cron:${job.id}:${startedAt}`;
    let result;
    try {
      result = await this.executeJobCore(job, runId);
    } catch (err) {
      result = { status: 'error', error: err.message || String(err) };
    }
    const endedAt = this.deps.nowMs();
    this.applyJobResult(job, result, startedAt, endedAt);
    await this.persist();
    this.events.emit('event', {
      action: 'finished',
      jobId: job.id,
      job,
      runId,
      status: result.status,
      error: result.error,
      summary: result.summary,
      runAtMs: startedAt,
      durationMs: job.state.lastDurationMs,
      nextRunAtMs: job.state.nextRunAtMs,
    });
    await this.notifyFinished(job, result, runId);
    return result;
  }

  async executeJobCore(job, runId) {
    if (job.payload.kind === 'systemEvent') {
      const body = job.payload.text.trim();
      await addNotification({
        level: 'info',
        subject: job.payload.subject || job.name,
        title: job.name,
        body,
        source: 'cron',
        jobId: job.id,
        runId,
      });
      return { status: 'ok', summary: body };
    }
    if (typeof this.deps.executeAgentTurn !== 'function') {
      return { status: 'error', error: 'cron agent execution is not configured' };
    }
    const timeoutMs = typeof job.payload.timeoutSeconds === 'number'
      ? job.payload.timeoutSeconds * 1000
      : DEFAULT_JOB_TIMEOUT_MS;
    const controller = new AbortController();
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(new Error('cron: job execution timed out')), timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    }
    try {
      const recorded = await this.deps.executeAgentTurn({
        job: cloneJson(job),
        runId,
        signal: controller.signal,
      });
      const summary = summarizeRecordedTurn(recorded) || 'Scheduled task completed.';
      return { status: 'ok', summary };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  applyJobResult(job, result, startedAt, endedAt) {
    job.state ||= {};
    job.state.runningAtMs = undefined;
    job.state.lastRunAtMs = startedAt;
    job.state.lastRunStatus = result.status;
    job.state.lastStatus = result.status;
    job.state.lastError = result.status === 'error' || result.status === 'skipped' ? result.error : undefined;
    job.state.lastDurationMs = Math.max(0, endedAt - startedAt);
    if (result.status === 'error') {
      job.state.consecutiveErrors = Math.max(0, Number(job.state.consecutiveErrors) || 0) + 1;
    } else {
      job.state.consecutiveErrors = 0;
    }
    job.updatedAtMs = endedAt;
    if (job.schedule.kind === 'at' && (job.deleteAfterRun !== false || result.status === 'ok')) {
      job.enabled = false;
      job.state.nextRunAtMs = undefined;
      return;
    }
    const naturalNext = computeJobNextRunAtMs(job, endedAt);
    job.state.nextRunAtMs = naturalNext === undefined ? undefined : Math.max(naturalNext, endedAt + MIN_REFIRE_GAP_MS);
  }

  async notifyFinished(job, result, runId) {
    if (job.payload.kind === 'systemEvent') return;
    if (result.status === 'ok') {
      await addNotification({
        level: 'success',
        subject: job.name || 'Scheduled task',
        title: job.name || 'Scheduled task complete',
        body: result.summary || 'Scheduled task completed.',
        source: 'cron',
        jobId: job.id,
        runId,
      });
      return;
    }
    await addNotification({
      level: 'error',
      subject: job.name || 'Scheduled task failed',
      title: `Scheduled task failed: ${job.name || job.id}`,
      body: result.error || 'Scheduled task failed.',
      source: 'cron',
      jobId: job.id,
      runId,
    });
  }
}
