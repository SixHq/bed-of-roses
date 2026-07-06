// Filesystem handlers. Reads are unrestricted; writes/deletes pass through
// paths.assertWritable. All paths are recorded in the audit log.

import { readFile, writeFile, mkdir, readdir, unlink, rmdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, relative, resolve, normalize } from 'node:path';
import { resolvePath, resolveForWrite, assertWritable, PROJECT_ROOT, DATA_DIR } from '../paths.js';

const MAX_READ_BYTES = 200 * 1024;     // 200 KB hard cap
const MAX_CHUNK_BYTES = 50 * 1024;
const MAX_BATCH_ITEMS = 20;
const MAX_BATCH_ECHO_BYTES = 240 * 1024;
const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_BYTES = 160 * 1024;
const MAX_SEARCH_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_FILES = 1000;
const MAX_SEARCH_MATCHES = 120;
const MAX_DEFINITION_FILE_BYTES = 256 * 1024;
const FILES_ROOT = resolve(DATA_DIR, 'files');
const DEVICE_ROOT = homedir();

function shortPath(absPath) {
  const rel = relative(PROJECT_ROOT, absPath);
  if (rel === '') return '.';
  return rel.startsWith('..') ? absPath : rel;
}

function isInsidePath(root, absPath) {
  const rel = relative(root, absPath);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}

function resolveVirtualPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const text = rawPath.trim().replace(/^\/(?=[a-z][a-z0-9_-]*:)/i, '');
  const match = text.match(/^([a-z][a-z0-9_-]*):(\/.*)?$/i);
  if (!match) return null;

  const rootName = match[1].toLowerCase();
  const root =
    ['device', 'home', 'user', 'local'].includes(rootName) ? DEVICE_ROOT :
    ['bor', 'gbor', 'files'].includes(rootName) ? FILES_ROOT :
    null;
  if (!root) throw new Error(`unknown file root: ${rootName}:`);

  const subpath = (match[2] || '/').replace(/^[/\\]+/, '');
  const abs = normalize(resolve(root, subpath || '.'));
  if (!isInsidePath(root, abs)) throw new Error(`refused: path escapes ${rootName}:/`);
  return abs;
}

function resolveReadablePath(rawPath) {
  return resolveVirtualPath(rawPath) || resolvePath(rawPath);
}

function resolveWritablePath(rawPath) {
  const virtualPath = resolveVirtualPath(rawPath);
  if (virtualPath) {
    assertWritable(virtualPath);
    return virtualPath;
  }
  return resolveForWrite(rawPath);
}

function truthyAttr(value) {
  return ['1', 'true', 'yes', 'recursive'].includes(String(value || '').trim().toLowerCase());
}

function kindForEntry(entry) {
  if (entry.isDirectory()) return 'dir';
  if (entry.isFile()) return 'file';
  return 'other';
}

async function collectListEntries(abs, recursive) {
  if (!recursive) {
    const entries = await readdir(abs, { withFileTypes: true });
    const items = entries.slice(0, MAX_LIST_ENTRIES).map((entry) => ({
      name: entry.name,
      kind: kindForEntry(entry),
    }));
    return { items, count: entries.length, truncated: entries.length > MAX_LIST_ENTRIES };
  }

  const items = [];
  let truncated = false;
  async function walk(dir, prefix = '') {
    if (items.length >= MAX_LIST_ENTRIES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (!prefix) throw err;
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (items.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        return;
      }
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      items.push({ name: entry.name, path: relPath, kind: kindForEntry(entry) });
      if (entry.isDirectory()) {
        await walk(resolve(dir, entry.name), relPath);
      }
    }
  }
  await walk(abs);
  return { items, count: items.length, truncated };
}

function globToRegExp(pattern) {
  const source = String(pattern || '*')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${source}$`);
}

function matchesFilePattern(relPath, pattern) {
  if (!pattern) return true;
  const re = globToRegExp(pattern);
  return re.test(relPath) || re.test(relPath.split('/').pop() || relPath);
}

function parseRipgrepOutput(stdout) {
  const matches = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^(.*?):(\d+):(.*)$/);
    if (!match) continue;
    matches.push({
      path: shortPath(match[1]),
      line: Number(match[2]),
      text: match[3].trimEnd(),
    });
    if (matches.length >= MAX_SEARCH_MATCHES) break;
  }
  return matches;
}

function renderReadResult(abs, bytes, truncated, text) {
  return [
    `# read_file ${shortPath(abs)}`,
    `bytes: ${bytes}`,
    `truncated: ${truncated ? 'true' : 'false'}`,
    '',
    text,
    truncated ? '\n[truncated]' : '',
  ].join('\n');
}

function renderFileMutationResult(tag, abs, bytes, content) {
  const truncated = Buffer.byteLength(content, 'utf8') > MAX_READ_BYTES;
  const visible = truncated ? Buffer.from(content, 'utf8').subarray(0, MAX_READ_BYTES).toString('utf8') : content;
  return [
    `# ${tag} ${shortPath(abs)}`,
    `bytes: ${bytes}`,
    `truncated: ${truncated ? 'true' : 'false'}`,
    '',
    visible,
    truncated ? '\n[truncated]' : '',
  ].join('\n');
}

function renderListResult(abs, count, recursive, items, truncated) {
  const lines = items.map((item) => {
    const label = item.path || item.name;
    return `- ${item.kind} ${label}`;
  });
  return [
    `# list_files ${shortPath(abs)}`,
    `recursive: ${recursive ? 'true' : 'false'}`,
    `count: ${count}`,
    `truncated: ${truncated ? 'true' : 'false'}`,
    '',
    lines.join('\n') || '(empty)',
  ].join('\n');
}

function renderSearchResult(abs, regex, filePattern, matches, truncated) {
  const lines = matches.map((match) => `${match.path}:${match.line}: ${match.text}`);
  return [
    `# search_files ${shortPath(abs)}`,
    `regex: ${regex}`,
    `file_pattern: ${filePattern || '*'}`,
    `count: ${matches.length}`,
    `truncated: ${truncated ? 'true' : 'false'}`,
    '',
    lines.join('\n') || '(no matches)',
  ].join('\n');
}

function renderChunkResult(abs, bytes, chunk, totalChunks, start, end, text) {
  return [
    `# read_file_in_chunks ${shortPath(abs)}`,
    `bytes: ${bytes}`,
    `chunk: ${chunk}/${totalChunks}`,
    `range: ${start}-${end}`,
    '',
    text,
    chunk < totalChunks ? `\n[End of chunk ${chunk}/${totalChunks}. Use read_file_in_chunks chunk="${chunk + 1}" to continue.]` : '\n[END OF FILE]',
  ].join('\n');
}

function parseReplaceBlocks(diff) {
  const text = String(diff || '').replace(/\r\n/g, '\n');
  const blocks = [];
  const marker = '------- SEARCH';
  let pos = 0;
  while (pos < text.length) {
    const searchStart = text.indexOf(marker, pos);
    if (searchStart === -1) break;
    let searchBodyStart = searchStart + marker.length;
    if (text[searchBodyStart] === '\n') searchBodyStart += 1;
    const sepStart = text.indexOf('\n=======', searchBodyStart);
    if (sepStart === -1) throw new Error('malformed diff: missing ======= separator');
    const replaceBodyStart = sepStart + '\n======='.length;
    const replaceBodyStartWithNewline = text[replaceBodyStart] === '\n' ? replaceBodyStart + 1 : replaceBodyStart;
    const replaceEnd = text.indexOf('\n+++++++ REPLACE', replaceBodyStartWithNewline);
    if (replaceEnd === -1) throw new Error('malformed diff: missing +++++++ REPLACE marker');
    blocks.push({
      search: text.slice(searchBodyStart, sepStart),
      replace: text.slice(replaceBodyStartWithNewline, replaceEnd),
    });
    pos = replaceEnd + '\n+++++++ REPLACE'.length;
  }
  if (!blocks.length) {
    throw new Error('malformed diff: expected at least one ------- SEARCH / ======= / +++++++ REPLACE block');
  }
  for (const [idx, block] of blocks.entries()) {
    if (!block.search) throw new Error(`malformed diff: SEARCH block ${idx + 1} is empty`);
  }
  return blocks;
}

function applyReplaceBlocks(original, blocks) {
  let next = original;
  const applied = [];
  for (const [idx, block] of blocks.entries()) {
    let search = block.search;
    let replace = block.replace;
    let at = next.indexOf(search);
    if (at === -1 && next.includes('\r\n') && search.includes('\n')) {
      search = search.replace(/\n/g, '\r\n');
      replace = replace.replace(/\n/g, '\r\n');
      at = next.indexOf(search);
    }
    if (at === -1) {
      const err = new Error(`SEARCH block ${idx + 1} not found. Read the latest file and make the SEARCH text match exactly.`);
      err.applied = applied;
      throw err;
    }
    next = `${next.slice(0, at)}${replace}${next.slice(at + search.length)}`;
    applied.push({ index: idx + 1, searchBytes: Buffer.byteLength(search, 'utf8'), replaceBytes: Buffer.byteLength(replace, 'utf8') });
  }
  return { content: next, applied };
}

function parseBatchItems(block) {
  const fromBody = String(block.body || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (fromBody.length) return fromBody.slice(0, MAX_BATCH_ITEMS);
  const attrs = block.attrs || {};
  const raw = attrs.paths || attrs.path || '';
  return String(raw)
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH_ITEMS);
}

const DEFINITION_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'go', 'rs',
  'java', 'kt', 'kts', 'swift', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'cs',
  'dart', 'scala', 'lua', 'sh', 'bash', 'zsh', 'fish', 'css', 'scss',
]);

function sourceExt(path) {
  const name = path.toLowerCase().split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function definitionRegexes(ext) {
  const commonJs = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)\b/,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+interface\s+([A-Za-z_$][\w$]*)\b/,
    /\binterface\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+type\s+([A-Za-z_$][\w$]*)\b/,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
  ];
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(ext)) return commonJs;
  if (ext === 'py') return [/^\s*class\s+([A-Za-z_]\w*)\b/, /^\s*def\s+([A-Za-z_]\w*)\s*\(/, /^\s*async\s+def\s+([A-Za-z_]\w*)\s*\(/];
  if (ext === 'rb') return [/^\s*class\s+([A-Za-z_:]\w*)\b/, /^\s*module\s+([A-Za-z_:]\w*)\b/, /^\s*def\s+([A-Za-z_]\w*[!?=]?)\b/];
  if (ext === 'php') return [/\bfunction\s+([A-Za-z_]\w*)\s*\(/, /\bclass\s+([A-Za-z_]\w*)\b/, /\binterface\s+([A-Za-z_]\w*)\b/, /\btrait\s+([A-Za-z_]\w*)\b/];
  if (ext === 'go') return [/\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, /\btype\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/];
  if (ext === 'rs') return [/\bfn\s+([A-Za-z_]\w*)\s*\(/, /\bstruct\s+([A-Za-z_]\w*)\b/, /\benum\s+([A-Za-z_]\w*)\b/, /\btrait\s+([A-Za-z_]\w*)\b/, /\bimpl\s+([A-Za-z_]\w*)\b/];
  if (['java', 'kt', 'kts', 'scala', 'swift', 'cs', 'dart'].includes(ext)) return [/\bclass\s+([A-Za-z_]\w*)\b/, /\binterface\s+([A-Za-z_]\w*)\b/, /\benum\s+([A-Za-z_]\w*)\b/, /\b(?:fun|func|void|public|private|protected|static|final|async|override|suspend|\w+)\s+([A-Za-z_]\w*)\s*\(/];
  if (['c', 'h', 'cpp', 'cc', 'cxx', 'hpp'].includes(ext)) return [/\b(?:void|int|char|float|double|bool|auto|static|extern|inline|[\w:*&<>]+)\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?/, /\b(?:struct|class|enum)\s+([A-Za-z_]\w*)\b/];
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return [/^\s*function\s+([A-Za-z_][\w-]*)\b/, /^\s*([A-Za-z_][\w-]*)\s*\(\)\s*\{/];
  if (['css', 'scss'].includes(ext)) return [/^\s*([.#][A-Za-z_][\w-]*)\s*[\{,]/];
  if (ext === 'lua') return [/\bfunction\s+([A-Za-z_][\w.:]*)\s*\(/, /\b([A-Za-z_]\w*)\s*=\s*function\s*\(/];
  return [];
}

async function extractDefinitions(filePath, baseDir) {
  const ext = sourceExt(filePath);
  if (!DEFINITION_EXTENSIONS.has(ext)) return null;
  const s = await stat(filePath).catch(() => null);
  if (!s?.isFile() || s.size > MAX_DEFINITION_FILE_BYTES) return null;
  const text = await readFile(filePath, 'utf8').catch(() => '');
  if (!text || text.includes('\0')) return null;
  const regexes = definitionRegexes(ext);
  const lines = text.split(/\r?\n/);
  const defs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const re of regexes) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (match?.[1]) {
        defs.push(`  L${i + 1}: ${match[1]}`);
        break;
      }
    }
    if (defs.length >= 80) break;
  }
  if (!defs.length) return null;
  return `${relative(baseDir, filePath) || filePath}\n${defs.join('\n')}`;
}

function runRipgrepSearch(abs, regex, filePattern) {
  return new Promise((resolveSearch, rejectSearch) => {
    const args = [
      '--line-number',
      '--with-filename',
      '--color',
      'never',
      '--no-heading',
      '--max-count',
      '20',
    ];
    if (filePattern) args.push('--glob', filePattern);
    args.push(regex, abs);

    const child = spawn('rg', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > MAX_SEARCH_BYTES) {
        stdout = stdout.slice(0, MAX_SEARCH_BYTES);
        truncated = true;
        child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      settled = true;
      rejectSearch(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code && code !== 1 && !truncated) {
        rejectSearch(new Error(stderr.trim() || `rg exited with ${code}`));
        return;
      }
      const matches = parseRipgrepOutput(stdout);
      resolveSearch({ matches, truncated: truncated || matches.length >= MAX_SEARCH_MATCHES });
    });
  });
}

async function fallbackSearch(abs, regex, filePattern) {
  let matcher;
  try {
    matcher = new RegExp(regex);
  } catch (err) {
    throw new Error(`invalid regex: ${err.message}`);
  }

  const matches = [];
  let filesScanned = 0;
  let truncated = false;

  async function walk(dir, prefix = '') {
    if (truncated) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
        continue;
      }
      if (!entry.isFile() || !matchesFilePattern(relPath, filePattern)) continue;
      filesScanned += 1;
      if (filesScanned > MAX_SEARCH_FILES) {
        truncated = true;
        return;
      }
      let s;
      try {
        s = await stat(fullPath);
      } catch {
        continue;
      }
      if (s.size > MAX_SEARCH_FILE_BYTES) continue;
      let buf;
      try {
        buf = await readFile(fullPath);
      } catch {
        continue;
      }
      if (buf.includes(0)) continue;
      const lines = buf.toString('utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        matcher.lastIndex = 0;
        if (matcher.test(lines[i])) {
          matches.push({ path: shortPath(fullPath), line: i + 1, text: lines[i].trimEnd() });
          if (matches.length >= MAX_SEARCH_MATCHES) {
            truncated = true;
            return;
          }
        }
      }
    }
  }

  await walk(abs);
  return { matches, truncated };
}

export async function executeRead(block, ctx) {
  let abs;
  try {
    abs = resolveReadablePath(block.attrs.path);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_file', reason: e.message }, llmEcho: `read_file failed: ${e.message}` };
  }
  try {
    const buf = await readFile(abs);
    const truncated = buf.length > MAX_READ_BYTES;
    const text = (truncated ? buf.subarray(0, MAX_READ_BYTES) : buf).toString('utf8');
    ctx.markReadFile?.(abs);
    await ctx.audit({ kind: 'fs.read', path: abs, bytes: buf.length });
    return {
      ok: true,
      event: 'read_file',
      payload: { path: shortPath(abs), bytes: buf.length, truncated, content: text },
      llmEcho: renderReadResult(abs, buf.length, truncated, text),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_file', reason: e.message }, llmEcho: `read_file failed: ${e.message}` };
  }
}

export async function executeReadChunk(block, ctx) {
  let abs;
  try {
    abs = resolveReadablePath(block.attrs.path);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_file_in_chunks', reason: e.message }, llmEcho: `read_file_in_chunks failed: ${e.message}` };
  }
  const requestedChunk = Math.max(1, Number.parseInt(block.attrs.chunk || '1', 10) || 1);
  try {
    const buf = await readFile(abs);
    const totalChunks = Math.max(1, Math.ceil(buf.length / MAX_CHUNK_BYTES));
    const chunk = Math.min(requestedChunk, totalChunks);
    const start = (chunk - 1) * MAX_CHUNK_BYTES;
    const end = Math.min(buf.length, start + MAX_CHUNK_BYTES);
    const text = buf.subarray(start, end).toString('utf8');
    ctx.markReadFile?.(abs);
    await ctx.audit({ kind: 'fs.read_chunk', path: abs, bytes: buf.length, chunk, totalChunks });
    return {
      ok: true,
      event: 'read_file_in_chunks',
      payload: { path: shortPath(abs), bytes: buf.length, chunk, totalChunks, start, end, content: text },
      llmEcho: renderChunkResult(abs, buf.length, chunk, totalChunks, start, end, text),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'read_file_in_chunks', reason: e.message }, llmEcho: `read_file_in_chunks failed: ${e.message}` };
  }
}

// Weaker models sometimes hallucinate BOR's internal turn-structure tags — the
// <tool_results>/<tool_result> wrapper the harness appends to each turn, or a
// stray closing tool tag — directly INTO the file content they stream
// (especially when a stream is cut mid-write and continued). These are never
// legitimate source content, so strip them before writing. We only remove
// occurrences that are alone on a line, plus a trailing run, so real code that
// merely mentions these words is untouched.
const PROTOCOL_TAGS = 'tool_results|tool_result|say|attempt_completion|write_to_file|write_file|replace_in_file';
const PROTOCOL_ARTIFACT_LINE = new RegExp(`^[ \\t]*</?(?:${PROTOCOL_TAGS})\\b[^>]*>[ \\t]*\\r?$`, 'gim');
const PROTOCOL_ARTIFACT_TRAILING = new RegExp(`(?:\\s*</?(?:${PROTOCOL_TAGS})\\b[^>]*>)+\\s*$`, 'i');

export function stripProtocolArtifacts(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text.replace(PROTOCOL_ARTIFACT_LINE, '');
  out = out.replace(PROTOCOL_ARTIFACT_TRAILING, '');
  return out;
}

async function executeWriteWithTag(block, ctx, tag) {
  let abs;
  try {
    abs = resolveWritablePath(block.attrs.path);
  } catch (e) {
    await ctx.audit({ kind: 'tool.refused', tag, path: block.attrs.path, reason: e.message });
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} refused: ${e.message}` };
  }
  const content = stripProtocolArtifacts(block.body || '');
  try {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    ctx.markReadFile?.(abs);
    await ctx.audit({ kind: 'fs.write', tag, path: abs, bytes });
    return {
      ok: true,
      event: 'write_file',
      payload: { path: shortPath(abs), bytes, tag },
      llmEcho: renderFileMutationResult(tag, abs, bytes, content),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
}

export async function executeWrite(block, ctx) {
  return executeWriteWithTag(block, ctx, 'write_file');
}

export async function executeWriteToFile(block, ctx) {
  return executeWriteWithTag(block, ctx, 'write_to_file');
}

export async function executeReplaceInFile(block, ctx) {
  const tag = 'replace_in_file';
  let abs;
  try {
    abs = resolveWritablePath(block.attrs.path);
  } catch (e) {
    await ctx.audit({ kind: 'tool.refused', tag, path: block.attrs.path, reason: e.message });
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} refused: ${e.message}` };
  }

  let blocks;
  try {
    blocks = parseReplaceBlocks(stripProtocolArtifacts(block.body));
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }

  try {
    const original = await readFile(abs, 'utf8');
    const { content, applied } = applyReplaceBlocks(original, blocks);
    await writeFile(abs, content, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    ctx.markReadFile?.(abs);
    await ctx.audit({ kind: 'fs.replace', tag, path: abs, blocks: applied.length, bytes });
    return {
      ok: true,
      event: tag,
      payload: { path: shortPath(abs), bytes, blocks: applied.length, applied },
      llmEcho: renderFileMutationResult(tag, abs, bytes, content),
    };
  } catch (e) {
    await ctx.audit({ kind: 'fs.replace.failed', tag, path: abs, reason: e.message });
    return { ok: false, event: 'tool_error', payload: { tag, path: shortPath(abs), reason: e.message }, llmEcho: `${tag} failed for ${shortPath(abs)}: ${e.message}` };
  }
}

export async function executeDelete(block, ctx) {
  let abs;
  try {
    abs = resolveWritablePath(block.attrs.path);
  } catch (e) {
    await ctx.audit({ kind: 'tool.refused', tag: 'delete_file', path: block.attrs.path, reason: e.message });
    return { ok: false, event: 'tool_error', payload: { tag: 'delete_file', reason: e.message }, llmEcho: `delete_file refused: ${e.message}` };
  }
  try {
    const s = await stat(abs);
    if (s.isDirectory()) {
      await rmdir(abs); // refuses non-empty dirs (Node default) — safer than recursive
    } else {
      await unlink(abs);
    }
    await ctx.audit({ kind: 'fs.delete', path: abs });
    return { ok: true, event: 'delete_file', payload: { path: shortPath(abs) }, llmEcho: `deleted ${shortPath(abs)}` };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'delete_file', reason: e.message }, llmEcho: `delete_file failed: ${e.message}` };
  }
}

export async function executeList(block, ctx) {
  let abs;
  try {
    abs = resolveReadablePath(block.attrs.path);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'list_files', reason: e.message }, llmEcho: `list_files failed: ${e.message}` };
  }
  try {
    const recursive = truthyAttr(block.attrs.recursive);
    const { items, count, truncated } = await collectListEntries(abs, recursive);
    await ctx.audit({ kind: 'fs.list', path: abs, count, recursive });
    return {
      ok: true,
      event: 'list_files',
      payload: { path: shortPath(abs), count, recursive, items, truncated },
      llmEcho: renderListResult(abs, count, recursive, items, truncated),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'list_files', reason: e.message }, llmEcho: `list_files failed: ${e.message}` };
  }
}

export async function executeListCodeDefinitions(block, ctx) {
  const tag = 'list_code_definition_names';
  let abs;
  try {
    abs = resolveReadablePath(block.attrs.path);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
  try {
    const s = await stat(abs);
    if (!s.isDirectory()) throw new Error('path must be a directory');
    const entries = await readdir(abs, { withFileTypes: true });
    const chunks = [];
    for (const entry of entries.slice(0, MAX_LIST_ENTRIES)) {
      if (!entry.isFile()) continue;
      const filePath = resolve(abs, entry.name);
      const defs = await extractDefinitions(filePath, abs);
      if (defs) chunks.push(defs);
    }
    const text = chunks.join('\n\n') || 'No source code definitions found.';
    await ctx.audit({ kind: 'fs.definitions', path: abs, files: entries.length, matches: chunks.length });
    return {
      ok: true,
      event: tag,
      payload: { path: shortPath(abs), count: chunks.length, definitions: text, truncated: entries.length > MAX_LIST_ENTRIES },
      llmEcho: `# ${tag} ${shortPath(abs)}\n${text}${entries.length > MAX_LIST_ENTRIES ? '\n\n[truncated]' : ''}`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
}

export async function executeSearch(block, ctx) {
  let abs;
  try {
    abs = resolveReadablePath(block.attrs.path);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'search_files', reason: e.message }, llmEcho: `search_files failed: ${e.message}` };
  }

  const regex = String(block.attrs.regex || block.attrs.pattern || '').trim();
  const filePattern = String(block.attrs.file_pattern || block.attrs.include || '').trim();
  if (!regex) {
    return { ok: false, event: 'tool_error', payload: { tag: 'search_files', reason: 'regex is required' }, llmEcho: 'search_files failed: regex is required' };
  }

  try {
    const s = await stat(abs);
    if (!s.isDirectory()) throw new Error('path must be a directory');
    let result;
    try {
      result = await runRipgrepSearch(abs, regex, filePattern);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      result = await fallbackSearch(abs, regex, filePattern);
    }
    await ctx.audit({ kind: 'fs.search', path: abs, regex, filePattern: filePattern || '*', count: result.matches.length });
    return {
      ok: true,
      event: 'search_files',
      payload: {
        path: shortPath(abs),
        regex,
        filePattern: filePattern || '*',
        count: result.matches.length,
        matches: result.matches,
        truncated: result.truncated,
      },
      llmEcho: renderSearchResult(abs, regex, filePattern, result.matches, result.truncated),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'search_files', reason: e.message }, llmEcho: `search_files failed: ${e.message}` };
  }
}

export async function executeReadBatch(block, ctx) {
  const tag = 'read_batch';
  const items = parseBatchItems(block);
  if (!items.length) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'paths are required' }, llmEcho: `${tag} failed: paths are required` };
  }
  const results = [];
  for (const item of items) {
    const [mode, ...rest] = item.includes(':') ? item.split(':') : ['read', item];
    const path = rest.join(':').trim();
    const key = mode.trim().toLowerCase();
    if (!path) continue;
    if (key === 'list') {
      const result = await executeList({ attrs: { path } }, ctx);
      results.push(result.llmEcho);
    } else if (key === 'list-recursive' || key === 'recursive') {
      const result = await executeList({ attrs: { path, recursive: 'true' } }, ctx);
      results.push(result.llmEcho);
    } else if (key === 'defs' || key === 'definitions') {
      const result = await executeListCodeDefinitions({ attrs: { path } }, ctx);
      results.push(result.llmEcho);
    } else {
      const readPath = key === 'read' ? path : item;
      const result = await executeRead({ attrs: { path: readPath } }, ctx);
      results.push(result.llmEcho);
    }
  }
  let text = results.filter(Boolean).join('\n\n---\n\n');
  if (Buffer.byteLength(text, 'utf8') > MAX_BATCH_ECHO_BYTES) {
    text = `${Buffer.from(text, 'utf8').subarray(0, MAX_BATCH_ECHO_BYTES).toString('utf8')}\n\n[read_batch truncated]`;
  }
  await ctx.audit({ kind: 'fs.read_batch', count: items.length });
  return {
    ok: true,
    event: tag,
    payload: { count: items.length },
    llmEcho: `# ${tag}\n${text}`,
  };
}
