function parseJsonBody(body) {
  const text = String(body || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`cron body must be JSON: ${err.message}`);
  }
}

function readId(block, params = {}) {
  return String(block.attrs?.id || block.attrs?.jobid || params.id || params.jobId || '').trim();
}

function compactJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled !== false,
    schedule: job.schedule,
    payload: job.payload?.kind === 'agentTurn'
      ? { kind: 'agentTurn', message: job.payload.message, timeoutSeconds: job.payload.timeoutSeconds }
      : job.payload,
    source: job.source,
    sourceSurfaceId: job.sourceSurfaceId,
    nextRunAtMs: job.state?.nextRunAtMs ?? null,
    lastRunAtMs: job.state?.lastRunAtMs ?? null,
    lastRunStatus: job.state?.lastRunStatus ?? null,
    lastError: job.state?.lastError ?? null,
  };
}

function compactJobs(jobs) {
  return (jobs || []).map(compactJob);
}

function actionFrom(block, params) {
  return String(block.attrs?.action || params.action || '').trim().toLowerCase();
}

export async function executeCron(block, ctx) {
  if (!ctx.cronService) throw new Error('cron service is not available');
  const params = parseJsonBody(block.body);
  const action = actionFrom(block, params);
  if (!action) throw new Error('cron action is required');

  let result;
  switch (action) {
    case 'status':
      result = await ctx.cronService.status();
      break;
    case 'list':
      result = { jobs: compactJobs(await ctx.cronService.list({ includeDisabled: params.includeDisabled === true || block.attrs?.includedisabled === 'true' })) };
      break;
    case 'get': {
      const id = readId(block, params);
      if (!id) throw new Error('cron.get requires id/jobId');
      result = compactJob(await ctx.cronService.get(id));
      if (!result) throw new Error(`unknown cron job id: ${id}`);
      break;
    }
    case 'add': {
      const job = params.job && typeof params.job === 'object' ? params.job : params;
      result = compactJob(await ctx.cronService.add({ ...job, source: job.source || 'agent' }));
      break;
    }
    case 'update': {
      const id = readId(block, params);
      if (!id) throw new Error('cron.update requires id/jobId');
      const patch = params.patch && typeof params.patch === 'object' ? params.patch : params;
      result = compactJob(await ctx.cronService.update(id, patch));
      break;
    }
    case 'remove': {
      const id = readId(block, params);
      if (!id) throw new Error('cron.remove requires id/jobId');
      result = await ctx.cronService.remove(id);
      break;
    }
    case 'run': {
      const id = readId(block, params);
      if (!id) throw new Error('cron.run requires id/jobId');
      const mode = params.mode === 'due' || block.attrs?.mode === 'due' ? 'due' : 'force';
      result = await ctx.cronService.run(id, mode);
      break;
    }
    default:
      throw new Error(`unknown cron action: ${action}`);
  }

  return {
    ok: true,
    event: 'cron',
    payload: { action, result },
    llmEcho: `cron.${action} result: ${JSON.stringify(result)}`,
  };
}

