// <execute_command> handler + companion tools (read_command_tail,
// list_recent_commands).
//
// Stage 4 changes from the legacy harness:
//   - The 30-second hard timeout is gone. Default is 5 minutes; tools that
//     need longer can pass `timeout_seconds` (clamped to 30 minutes).
//   - Captured output ceiling raised from 12 KB to 64 KB stdout / 32 KB stderr.
//   - The 1500-char `llmEcho` truncation is gone — the model sees the full
//     captured buffer up to the cap, with explicit truncation markers.
//   - Last 8 runs are retained in memory so the model can call
//     `read_command_tail` for output past the cap on a follow-up turn.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolvePath, PROJECT_ROOT } from '../paths.js';
import { validateShellCommand } from '../../validator.js';

const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const RUN_RING_CAP = 8;

/**
 * @typedef {Object} RunRecord
 * @property {string} id
 * @property {string} cmd
 * @property {string} cwd
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} stdoutTrunc
 * @property {boolean} stderrTrunc
 * @property {number|null} exitCode
 * @property {string|null} signal
 * @property {number} startedAt
 * @property {number} finishedAt
 * @property {number} durationMs
 */

/** @type {Map<string, RunRecord>} */
const runRing = new Map();

function rememberRun(record) {
  runRing.set(record.id, record);
  while (runRing.size > RUN_RING_CAP) {
    const oldest = runRing.keys().next().value;
    runRing.delete(oldest);
  }
}

function tokenize(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < cmd.length) { cur += cmd[++i]; continue; }
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '\\' && i + 1 < cmd.length) { cur += cmd[++i]; continue; }
    if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (quote) throw new Error(`unterminated quote (${quote})`);
  if (cur) out.push(cur);
  return out;
}

function resolveTimeoutMs(attr) {
  if (attr === undefined || attr === null || attr === '') return DEFAULT_TIMEOUT_MS;
  const seconds = Number(attr);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.round(seconds * 1000));
}

function formatRunForModel(record) {
  const head = `$ ${record.cmd}`;
  const tail = `[exit ${record.exitCode ?? `killed (${record.signal || 'timeout'})`} in ${record.durationMs}ms; run_id=${record.id}]`;
  const stdoutBlock = record.stdout
    ? `\n${record.stdout}${record.stdoutTrunc ? `\n…[stdout truncated at ${MAX_STDOUT_BYTES} bytes; call read_command_tail with run_id="${record.id}" to fetch more]` : ''}`
    : '';
  const stderrBlock = record.stderr
    ? `\n--stderr--\n${record.stderr}${record.stderrTrunc ? `\n…[stderr truncated at ${MAX_STDERR_BYTES} bytes]` : ''}`
    : '';
  return `${head}\n${tail}${stdoutBlock}${stderrBlock}`.trim();
}

export async function execute(block, ctx) {
  const cmd = (block.body || '').trim();
  if (!cmd) {
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: 'empty command' }, llmEcho: 'execute_command empty' };
  }

  const validation = validateShellCommand(cmd);
  if (!validation.ok) {
    await ctx.audit({ kind: 'tool.refused', tag: 'execute_command', cmd, reason: validation.reason });
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: validation.reason }, llmEcho: `execute_command refused: ${validation.reason}` };
  }

  let argv;
  try { argv = tokenize(cmd); }
  catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: e.message }, llmEcho: `execute_command parse failed: ${e.message}` };
  }
  if (argv.length === 0) {
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: 'no command' }, llmEcho: 'execute_command empty argv' };
  }

  let cwd = PROJECT_ROOT;
  if (block.attrs.cwd) {
    try { cwd = resolvePath(block.attrs.cwd); }
    catch (e) {
      return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: e.message }, llmEcho: `execute_command cwd error: ${e.message}` };
    }
  }

  const timeoutMs = resolveTimeoutMs(block.attrs.timeout_seconds);
  const runId = `run_${randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();
  await ctx.audit({ kind: 'shell.exec', cmd, cwd, runId, timeoutMs });

  const result = await new Promise((resolveP) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    let stdoutTrunc = false;
    let stderrTrunc = false;

    const append = (which, chunk) => {
      const text = chunk.toString('utf8');
      let accepted = text;
      if (which === 'out') {
        if (stdout.length + text.length > MAX_STDOUT_BYTES) {
          accepted = text.slice(0, Math.max(0, MAX_STDOUT_BYTES - stdout.length));
          stdoutTrunc = true;
        }
        stdout += accepted;
      } else {
        if (stderr.length + text.length > MAX_STDERR_BYTES) {
          accepted = text.slice(0, Math.max(0, MAX_STDERR_BYTES - stderr.length));
          stderrTrunc = true;
        }
        stderr += accepted;
      }
      if (accepted) {
        ctx.emit?.('execute_command_delta', {
          cmd, cwd, runId,
          stream: which === 'out' ? 'stdout' : 'stderr',
          text: accepted,
          stdoutTrunc, stderrTrunc,
        });
      }
    };
    child.stdout.on('data', (c) => append('out', c));
    child.stderr.on('data', (c) => append('err', c));
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* ignore */ } }, timeoutMs);

    const onAbort = () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } };
    ctx.signal?.addEventListener?.('abort', onAbort);

    child.on('error', (err) => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener?.('abort', onAbort);
      resolveP({ exitCode: null, signal: null, stdout, stderr: stderr || err.message, stdoutTrunc, stderrTrunc });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener?.('abort', onAbort);
      resolveP({ exitCode: code, signal, stdout, stderr, stdoutTrunc, stderrTrunc });
    });
  });

  const finishedAt = Date.now();
  const record = {
    id: runId,
    cmd, cwd,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutTrunc: result.stdoutTrunc,
    stderrTrunc: result.stderrTrunc,
    exitCode: result.exitCode,
    signal: result.signal,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
  };
  rememberRun(record);

  return {
    ok: result.exitCode === 0,
    event: 'execute_command',
    payload: { cmd, cwd, runId, ...result, durationMs: record.durationMs },
    llmEcho: formatRunForModel(record),
  };
}

/**
 * <read_command_tail run_id="..." stream="stdout|stderr" offset="0" max_bytes="32768"/>
 * Pulls additional bytes from a remembered run beyond what the original
 * tool_result included. Lets the model paginate through long output.
 */
export async function executeReadCommandTail(block /* , ctx */) {
  const runId = String(block.attrs.run_id || '').trim();
  if (!runId) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_command_tail', reason: 'run_id required' }, llmEcho: 'read_command_tail: run_id required' };
  }
  const record = runRing.get(runId);
  if (!record) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_command_tail', reason: `unknown run_id "${runId}"` }, llmEcho: `read_command_tail: unknown run_id ${runId}` };
  }
  const stream = String(block.attrs.stream || 'stdout').toLowerCase();
  const source = stream === 'stderr' ? record.stderr : record.stdout;
  const offset = Math.max(0, Number(block.attrs.offset) || 0);
  const maxBytes = Math.min(64 * 1024, Math.max(1024, Number(block.attrs.max_bytes) || 32 * 1024));
  const slice = source.slice(offset, offset + maxBytes);
  const nextOffset = offset + slice.length;
  const more = nextOffset < source.length;
  return {
    ok: true,
    event: 'read_command_tail',
    payload: { runId, stream, offset, returnedBytes: slice.length, nextOffset, more },
    llmEcho: [
      `read_command_tail run_id=${runId} stream=${stream} offset=${offset} returned=${slice.length} next=${nextOffset} more=${more}`,
      slice,
    ].join('\n'),
  };
}

/**
 * <list_recent_commands/>
 * Summarizes the last 8 commands the harness has run so the model can pick a
 * run_id for `read_command_tail` without having to remember it across turns.
 */
export async function executeListRecentCommands(/* block, ctx */) {
  const records = Array.from(runRing.values());
  if (records.length === 0) {
    return {
      ok: true,
      event: 'list_recent_commands',
      payload: { runs: [] },
      llmEcho: 'No recent commands in memory.',
    };
  }
  const lines = records.map((r) => (
    `${r.id} — \`${r.cmd}\` (cwd: ${r.cwd}) — exit ${r.exitCode ?? `killed (${r.signal || 'timeout'})`} in ${r.durationMs}ms; stdout ${r.stdout.length}B${r.stdoutTrunc ? ' (truncated)' : ''}, stderr ${r.stderr.length}B${r.stderrTrunc ? ' (truncated)' : ''}`
  ));
  return {
    ok: true,
    event: 'list_recent_commands',
    payload: { runs: records.map((r) => ({ id: r.id, cmd: r.cmd, exitCode: r.exitCode, durationMs: r.durationMs })) },
    llmEcho: ['Recent commands (newest last):', ...lines].join('\n'),
  };
}
