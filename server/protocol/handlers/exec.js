// <execute_command> handler + companion tools (read_command_tail,
// list_recent_commands).
//
// Stage 4 changes from the legacy harness:
//   - The 30-second hard timeout is gone. Default is 5 minutes; tools that
//     need longer can pass `timeout_seconds` (clamped to 30 minutes).
//   - Captured output ceiling raised from 12 KB to 64 KB stdout / 32 KB stderr.
//   - The UI and run ring keep that captured output, but `llmEcho` is a compact
//     model-facing preview so browser-use/page dumps do not get copied through
//     every follow-up pass.
//   - Last 8 runs are retained in memory so the model can call
//     `read_command_tail` for captured output omitted from the preview.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolvePath, PROJECT_ROOT } from '../paths.js';
import { validateShellCommand } from '../../validator.js';

const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 32 * 1024;
const MODEL_STDOUT_PREVIEW_CHARS = 4 * 1024;
const MODEL_STDERR_PREVIEW_CHARS = 4 * 1024;
const MODEL_BROWSER_STDOUT_PREVIEW_CHARS = 2 * 1024;
// `state` is the model's ONLY view of the page's indexed elements — it must be
// generous or draft/compose fields deep in the DOM (e.g. Gmail Compose's
// To/Subject/Body) get truncated out and the model wrongly concludes it "can't
// see the draft". Captured stdout is still capped at 64 KB; this only governs
// the model-facing preview.
const MODEL_BROWSER_STATE_PREVIEW_CHARS = 14000;
const MODEL_PREVIEW_TAIL_RATIO = 0.35;
const MODEL_PREVIEW_MAX_LINES = 40;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
// Hard return window: a command NEVER blocks the model longer than this. After
// it elapses the output so far is handed back and the process keeps running in
// the background (the model follows it with wait_until + read_command_tail).
// background="true" returns sooner (for known long-runners like dev servers).
const FOREGROUND_RETURN_MS = 60 * 1000;
const BACKGROUND_WAIT_MS = 15 * 1000;
const RUN_RING_CAP = 8;

function truthyAttr(value) {
  if (value === true) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

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

function commandAfterBrowserUse(cmd) {
  const match = String(cmd || '').match(/\bbrowser-use\b\s*(.*)$/i);
  if (!match) return '';
  let rest = match[1].trim();
  let previous = '';
  while (rest && rest !== previous) {
    previous = rest;
    rest = rest.replace(/^(?:(?:--(?:profile|session|cdp-url)\s+(?:"[^"]+"|'[^']+'|\S+))|(?:--(?:headed|headless|json|mcp)))\s*/i, '').trim();
  }
  return rest.toLowerCase();
}

function ensureBrowserUseVisibleCommand(cmd) {
  const value = String(cmd || '');
  if (!/\bbrowser-use\b/i.test(value)) return value;
  if (!/^open\b/.test(commandAfterBrowserUse(value))) return value;

  let next = value.replace(/\s+--headless\b/ig, ' --headed');
  if (/\s--headed\b/i.test(next)) return next;
  return next.replace(/\bbrowser-use\b/i, (match) => `${match} --headed`);
}

function modelStdoutPreviewLimit(cmd) {
  const browserUse = commandAfterBrowserUse(cmd);
  if (!browserUse) return MODEL_STDOUT_PREVIEW_CHARS;
  if (/^(state\b|get\b)/.test(browserUse)) return MODEL_BROWSER_STATE_PREVIEW_CHARS;
  return MODEL_BROWSER_STDOUT_PREVIEW_CHARS;
}

function browserUseOutputKind(cmd) {
  const browserUse = commandAfterBrowserUse(cmd);
  if (!browserUse) return '';
  if (/^state\b/.test(browserUse)) return 'state';
  if (/^get\b/.test(browserUse)) return 'get';
  return 'browser';
}

function browserUsePostActionNote(cmd) {
  const browserUse = commandAfterBrowserUse(cmd);
  if (!/^(click|type|input|keys|select|upload|hover|dblclick|rightclick|scroll|eval|wait|back|tab\s+close)\b/.test(browserUse)) return '';
  return [
    '',
    'Browser verification required: this command only proves the action was dispatched.',
    'Run browser-use state, browser-use get, or browser-use screenshot next before claiming what page you are on, what is visible, or that the user task succeeded.',
    'Not seeing the expected element/text/draft in THIS result is normal and expected — the page may still be rendering, or you have not re-fetched state yet. The correct next step is to re-inspect (state/get/screenshot), scroll, or wait, then continue the task in browser-use. Do NOT stop, do NOT declare the task blocked, and do NOT switch to computer-use just because something is not visible here — only switch after browser-use returns an explicit error or the same step fails repeatedly after re-inspecting.',
  ].join('\n');
}

function browserUseCommandError(cmd) {
  if (!/\bbrowser-use\b/i.test(String(cmd || ''))) return '';
  const browserUse = commandAfterBrowserUse(cmd);
  if (!browserUse) return '';
  if (/^--?version\b/.test(browserUse)) return '';
  if (/^(doctor|setup|connect|close|state|screenshot|get|click|type|input|keys|select|upload|hover|dblclick|rightclick|scroll|eval|wait|cookies|back|open)\b/.test(browserUse)) return '';
  if (/^(profile\s+(list|sync|update)|cloud\s+(connect|login|logout|signup)|sessions\b|config\b|tab\s+(new|switch|list|close))/.test(browserUse)) return '';
  return [
    'browser-use natural-language/unknown task mode is disabled in BOR.',
    'Use explicit browser-use subcommands only: open, state, click <index>, input <index> <text>, keys, screenshot, scroll, or get.',
    'If you need an element index, run browser-use state first and only act on visible/indexed elements from that state.',
  ].join(' ');
}

function compactForModel(text, maxChars, { runId, stream }) {
  const value = String(text || '');
  if (!value) {
    return { text: value, omitted: 0, shown: value.length, previewTruncated: false };
  }

  const lines = value.split(/\r?\n/);
  if (lines.length > MODEL_PREVIEW_MAX_LINES) {
    const headLineCount = Math.floor(MODEL_PREVIEW_MAX_LINES * 0.7);
    const tailLineCount = MODEL_PREVIEW_MAX_LINES - headLineCount;
    const head = lines.slice(0, headLineCount).join('\n');
    const tail = lines.slice(-tailLineCount).join('\n');
    const headChars = head.length;
    const omittedLines = lines.length - headLineCount - tailLineCount;
    const note = [
      '',
      `...[${stream} model preview omitted ${omittedLines} lines from captured output; call read_command_tail run_id="${runId}" stream="${stream}" offset="${headChars}" max_bytes="12000" if those exact lines are needed]`,
      '',
    ].join('\n');
    return {
      text: `${head.trimEnd()}${note}${tail.trimStart()}`,
      omitted: Math.max(0, value.length - head.length - tail.length),
      shown: head.length + tail.length,
      previewTruncated: true,
    };
  }

  if (value.length <= maxChars) {
    return { text: value, omitted: 0, shown: value.length, previewTruncated: false };
  }

  const tailChars = Math.max(512, Math.floor(maxChars * MODEL_PREVIEW_TAIL_RATIO));
  const headChars = Math.max(512, maxChars - tailChars);
  const tailStart = Math.max(headChars, value.length - tailChars);
  const omitted = Math.max(0, tailStart - headChars);
  const note = [
    '',
    `...[${stream} model preview omitted ${omitted} chars from captured output; call read_command_tail run_id="${runId}" stream="${stream}" offset="${headChars}" max_bytes="12000" if those exact lines are needed]`,
    '',
  ].join('\n');

  return {
    text: `${value.slice(0, headChars).trimEnd()}${note}${value.slice(tailStart).trimStart()}`,
    omitted,
    shown: headChars + (value.length - tailStart),
    previewTruncated: true,
  };
}

function formatStreamForModel(record, { stream, text, captureTruncated, captureLimit, modelLimit }) {
  if (!text) return '';
  if (stream === 'stdout' && browserUseOutputKind(record.cmd) === 'state') {
    return formatBrowserUseStateForModel(record, text, {
      captureTruncated,
      captureLimit,
      modelLimit,
    });
  }
  const preview = compactForModel(text, modelLimit, { runId: record.id, stream });
  const summary = [
    `--${stream} ${preview.previewTruncated ? `preview ${preview.shown}/${text.length} chars` : `${text.length} chars`}`,
    captureTruncated ? `capture truncated at ${captureLimit} bytes` : '',
  ].filter(Boolean).join('; ');
  const captureNote = captureTruncated
    ? `\n...[${stream} capture stopped at ${captureLimit} bytes; rerun with filtering if uncaptured output is needed]`
    : '';
  return `\n${summary}--\n${preview.text}${captureNote}`;
}

function compactLine(line, max = 180) {
  const normalized = String(line || '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

// Matches a browser-use element line even when it is prefixed (e.g. shadow-DOM
// elements arrive as `|SHADOW(open)|[257]<input ...>`), so we don't drop them.
const BROWSER_ELEMENT_RE = /\[\d+\]\s*</;

function formatBrowserUseStateForModel(record, text, { captureTruncated, captureLimit, modelLimit }) {
  const raw = String(text || '').trim();
  const header = [
    `\n--browser-use state; source ${raw.length} chars${captureTruncated ? `; capture truncated at ${captureLimit} bytes` : ''}--`,
    'Browser truth rule: only the URL/title, indexed elements, and text shown below are safe to reference. If a target is missing, re-run browser-use state/get/screenshot, scroll, or wait — do not guess an index.',
  ];

  // Most state dumps are small (a few KB). Show them VERBATIM — the lossy
  // compaction below was dropping shadow-DOM controls (|SHADOW(open)|[257]<input>),
  // collapsing distinct links whose text sits on the next line, and stripping the
  // non-interactive text (list items, "N items left" counts) the model needs to
  // verify a task. Don't mangle what already fits.
  if (raw.length <= modelLimit) {
    return [...header, '', raw].join('\n');
  }

  // Oversized state: compact, but correctly — keep each element line, attach the
  // indented label/text on the following line, handle shadow prefixes, dedup only
  // on truly identical lines, and prioritize editable/typeable fields.
  header.push(`This page is large; showing a compact preview. Page the rest with read_command_tail run_id="${record.id}" stream="stdout".`);
  const lines = raw.split(/\r?\n/);
  const headerLines = [];
  const elementEntries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = compactLine(lines[i]);
    if (!line) continue;
    if (BROWSER_ELEMENT_RE.test(line)) {
      // Attach the following indented, non-element line as this element's label
      // (browser-use puts link/button text there, e.g. "[201]<a />" then "  Source").
      const rawNext = lines[i + 1] || '';
      const next = compactLine(rawNext);
      const label = next && /^\s/.test(rawNext) && !BROWSER_ELEMENT_RE.test(next) ? next : '';
      elementEntries.push(label ? `${line}  ${label}` : line);
    } else if (/^(URL|Title|Browser State|viewport|page|scroll)\b/i.test(line)) {
      headerLines.push(line);
    }
  }

  const EDITABLE = /\b(input|textarea|textbox|searchbox|combobox|contenteditable|editable|email|search|recipients?|subject|body|message|compose)\b/i;
  const ordered = [
    ...elementEntries.filter((l) => EDITABLE.test(l)),
    ...elementEntries.filter((l) => !EDITABLE.test(l)),
  ];
  const budget = Math.max(2000, modelLimit - 900);
  const seen = new Set();
  const chosen = new Set();
  let usedChars = 0;
  let omittedDuplicates = 0;
  for (const entry of ordered) {
    if (seen.has(entry)) { omittedDuplicates += 1; continue; } // dedup on FULL line (index+tag+label), so distinct elements survive
    if (chosen.size >= 400 || usedChars + entry.length + 1 > budget) continue;
    seen.add(entry);
    chosen.add(entry);
    usedChars += entry.length + 1;
  }
  const shown = elementEntries.filter((e) => chosen.has(e));
  const omitted = Math.max(0, elementEntries.length - shown.length - omittedDuplicates);
  if (omittedDuplicates) header.push(`Deduplicated ${omittedDuplicates} identical element lines.`);
  if (omitted) header.push(`Omitted ${omitted} additional element lines (very large page); use read_command_tail for the full list.`);

  return [
    ...header,
    '',
    ...headerLines.slice(0, 10),
    shown.length ? 'Elements:' : '',
    ...shown,
  ].filter(Boolean).join('\n');
}

function formatRunForModel(record) {
  const head = `$ ${record.cmd}`;
  const tail = `[exit ${record.exitCode ?? `killed (${record.signal || 'timeout'})`} in ${record.durationMs}ms; run_id=${record.id}]`;
  const stdoutBlock = formatStreamForModel(record, {
    stream: 'stdout',
    text: record.stdout,
    captureTruncated: record.stdoutTrunc,
    captureLimit: MAX_STDOUT_BYTES,
    modelLimit: modelStdoutPreviewLimit(record.cmd),
  });
  const stderrBlock = formatStreamForModel(record, {
    stream: 'stderr',
    text: record.stderr,
    captureTruncated: record.stderrTrunc,
    captureLimit: MAX_STDERR_BYTES,
    modelLimit: MODEL_STDERR_PREVIEW_CHARS,
  });
  return `${head}\n${tail}${stdoutBlock}${stderrBlock}${browserUsePostActionNote(record.cmd)}`.trim();
}

function formatStillRunningForModel(record) {
  const waited = Math.max(1, Math.round((Date.now() - record.startedAt) / 1000));
  const head = `$ ${record.cmd}`;
  const tail = `[still running after ${waited}s — output below is only what it has printed so far; run_id=${record.id}]`;
  const stdoutBlock = formatStreamForModel(record, {
    stream: 'stdout',
    text: record.stdout,
    captureTruncated: record.stdoutTrunc,
    captureLimit: MAX_STDOUT_BYTES,
    modelLimit: modelStdoutPreviewLimit(record.cmd),
  });
  const stderrBlock = formatStreamForModel(record, {
    stream: 'stderr',
    text: record.stderr,
    captureTruncated: record.stderrTrunc,
    captureLimit: MAX_STDERR_BYTES,
    modelLimit: MODEL_STDERR_PREVIEW_CHARS,
  });
  const note = [
    '',
    'This command is STILL RUNNING in the background — it was NOT killed and is NOT blocking you. The output above is only what it had printed when the return window elapsed.',
    `To follow it: <wait_until duration="N"/> to pause N seconds, then <read_command_tail run_id="${record.id}" stream="stdout"/> (or stream="stderr") for the newer output — repeat until it finishes or you have what you need.`,
    'If you started a dev server, open it with <browser_action action="launch" url="http://localhost:PORT"/>. To stop it, run another <execute_command> (e.g. a kill/pkill); otherwise it runs until the session ends.',
  ].join('\n');
  return `${head}\n${tail}${stdoutBlock}${stderrBlock}\n${note}`.trim();
}

const WAIT_UNTIL_MAX_S = 600; // 10-minute ceiling on a single pause

// <wait_until duration="30" reason="…"/> — pause the chat loop for N seconds so
// the model can let a still-running command (or anything else) make progress,
// then continue. Resolves early if the chat is cancelled.
export async function executeWaitUntil(block, ctx) {
  const raw = block.attrs?.duration ?? block.attrs?.seconds ?? block.body;
  let seconds = Math.round(Number(raw));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, event: 'tool_error', payload: { tag: 'wait_until', reason: 'duration in seconds is required, e.g. <wait_until duration="30"/>' }, llmEcho: 'wait_until: a positive duration (seconds) is required' };
  }
  seconds = Math.min(seconds, WAIT_UNTIL_MAX_S);
  const reason = String(block.attrs?.reason || '').trim();
  const startedAt = Date.now();
  await ctx.audit({ kind: 'wait_until', seconds, reason: reason || undefined });

  await new Promise((resolveP) => {
    let done = false;
    const cleanup = () => { clearTimeout(timer); ctx.signal?.removeEventListener?.('abort', onAbort); };
    const finish = () => { if (done) return; done = true; cleanup(); resolveP(); };
    const onAbort = () => finish();
    const timer = setTimeout(finish, seconds * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    if (ctx.signal?.aborted) { finish(); return; }
    ctx.signal?.addEventListener?.('abort', onAbort);
  });

  const waited = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const aborted = Boolean(ctx.signal?.aborted);
  return {
    ok: true,
    event: 'wait_until',
    payload: { seconds, waited, reason: reason || undefined, aborted },
    llmEcho: aborted
      ? `Wait interrupted after ${waited}s.`
      : `Waited ${waited}s${reason ? ` (${reason})` : ''}. Continue now — re-check whatever you were waiting on (e.g. <read_command_tail/> for a background command's latest output).`,
  };
}

export async function execute(block, ctx) {
  const cmd = ensureBrowserUseVisibleCommand((block.body || '').trim());
  if (!cmd) {
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: 'empty command' }, llmEcho: 'execute_command empty' };
  }
  const browserUseError = browserUseCommandError(cmd);
  if (browserUseError) {
    await ctx.audit({ kind: 'tool.refused', tag: 'execute_command', cmd, reason: browserUseError });
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: browserUseError }, llmEcho: `execute_command refused: ${browserUseError}` };
  }

  const validation = validateShellCommand(cmd);
  if (!validation.ok) {
    await ctx.audit({ kind: 'tool.refused', tag: 'execute_command', cmd, reason: validation.reason });
    return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: validation.reason }, llmEcho: `execute_command refused: ${validation.reason}` };
  }

  let cwd = PROJECT_ROOT;
  if (block.attrs.cwd) {
    try { cwd = resolvePath(block.attrs.cwd); }
    catch (e) {
      return { ok: false, event: 'tool_error', payload: { tag: 'execute_command', reason: e.message }, llmEcho: `execute_command cwd error: ${e.message}` };
    }
  }

  const background = truthyAttr(block.attrs.background);
  const explicitTimeout = !(block.attrs.timeout_seconds === undefined || block.attrs.timeout_seconds === null || block.attrs.timeout_seconds === '');
  const timeoutMs = resolveTimeoutMs(block.attrs.timeout_seconds);
  const runId = `run_${randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();
  await ctx.audit({ kind: 'shell.exec', cmd, cwd, runId, timeoutMs, background });

  // Live, mutable run record. For background commands we return after a short
  // wait while the child keeps running, so the record must keep filling — that
  // is what lets read_command_tail fetch output produced after the early
  // return, and what keeps the run available to list_recent_commands.
  const record = {
    id: runId,
    cmd, cwd,
    stdout: '', stderr: '',
    stdoutTrunc: false, stderrTrunc: false,
    exitCode: null, signal: null,
    startedAt, finishedAt: 0, durationMs: 0,
    running: true, background,
  };
  rememberRun(record);

  const outcome = await new Promise((resolveP) => {
    // Run through a shell so real shell syntax works: pipes, redirects, globs,
    // env-var expansion, subshells, quoting, and compound commands like
    // `cd X && npm install`. The previous `shell:false` + self-tokenize path
    // passed `&&`/`|`/`cd` as LITERAL argv — so `mkdir -p w && cd w && npm ...`
    // literally created directories named `&&`, `cd`, `npm`, `vite@latest`.
    // `detached:true` makes the child a process-group leader so killTree can
    // terminate the whole tree (npm/vite spawn their own children).
    const child = spawn('/bin/bash', ['-c', cmd], { cwd, detached: true });
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolveP(value); } };
    const killTree = (sig = 'SIGTERM') => {
      try { process.kill(-child.pid, sig); }
      catch { try { child.kill(sig); } catch { /* already gone */ } }
    };

    const append = (which, chunk) => {
      const text = chunk.toString('utf8');
      let accepted = text;
      if (which === 'out') {
        if (record.stdout.length + text.length > MAX_STDOUT_BYTES) {
          accepted = text.slice(0, Math.max(0, MAX_STDOUT_BYTES - record.stdout.length));
          record.stdoutTrunc = true;
        }
        record.stdout += accepted;
      } else {
        if (record.stderr.length + text.length > MAX_STDERR_BYTES) {
          accepted = text.slice(0, Math.max(0, MAX_STDERR_BYTES - record.stderr.length));
          record.stderrTrunc = true;
        }
        record.stderr += accepted;
      }
      if (accepted) {
        ctx.emit?.('execute_command_delta', {
          cmd, cwd, runId,
          stream: which === 'out' ? 'stdout' : 'stderr',
          text: accepted,
          stdoutTrunc: record.stdoutTrunc, stderrTrunc: record.stderrTrunc,
          background,
        });
      }
    };
    child.stdout.on('data', (c) => append('out', c));
    child.stderr.on('data', (c) => append('err', c));

    // The command is force-killed ONLY on an explicit timeout_seconds or a chat
    // cancel — NOT by the return window. Hitting the return window hands the
    // output back while leaving the process running.
    let timer = null;
    if (explicitTimeout) {
      timer = setTimeout(() => killTree('SIGTERM'), timeoutMs);
    }

    const onAbort = () => killTree('SIGTERM');
    ctx.signal?.addEventListener?.('abort', onAbort);

    const finalize = (exitCode, signal, errMsg) => {
      if (timer) clearTimeout(timer);
      ctx.signal?.removeEventListener?.('abort', onAbort);
      record.exitCode = exitCode;
      record.signal = signal;
      if (errMsg && !record.stderr) record.stderr = errMsg;
      record.running = false;
      record.finishedAt = Date.now();
      record.durationMs = record.finishedAt - record.startedAt;
      settle({ exited: true });
    };

    child.on('error', (err) => finalize(null, null, err.message));
    child.on('close', (code, signal) => finalize(code, signal));

    // Hard return window — output is read and handed back even if the command
    // is still running. Leave the child + listeners attached so it keeps going
    // and the record keeps filling for read_command_tail.
    child.unref?.();
    setTimeout(() => settle({ exited: false }), background ? BACKGROUND_WAIT_MS : FOREGROUND_RETURN_MS);
  });

  // Still running when its return window elapsed (60s foreground / 15s
  // background). The command keeps running in the background.
  if (!outcome.exited) {
    return {
      ok: true,
      event: 'execute_command',
      payload: {
        cmd, cwd, runId,
        stdout: record.stdout, stderr: record.stderr,
        stdoutTrunc: record.stdoutTrunc, stderrTrunc: record.stderrTrunc,
        exitCode: null, signal: null,
        durationMs: Date.now() - record.startedAt,
        background, running: true,
      },
      llmEcho: formatStillRunningForModel(record),
    };
  }

  // Completed: foreground, or a background command that exited early (crashed
  // on startup, finished fast, etc). The record is already final.
  if (record.finishedAt === 0) {
    record.running = false;
    record.finishedAt = Date.now();
    record.durationMs = record.finishedAt - record.startedAt;
  }
  return {
    ok: record.exitCode === 0,
    event: 'execute_command',
    payload: {
      cmd, cwd, runId,
      stdout: record.stdout, stderr: record.stderr,
      stdoutTrunc: record.stdoutTrunc, stderrTrunc: record.stderrTrunc,
      exitCode: record.exitCode, signal: record.signal,
      durationMs: record.durationMs,
      background, running: false,
    },
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
