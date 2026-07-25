// Filesystem handlers. Reads are unrestricted; writes/deletes pass through
// paths.assertWritable. All paths are recorded in the audit log.

import { readFile, writeFile, mkdir, readdir, unlink, rmdir, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { dirname, relative, resolve, normalize } from 'node:path';
import { resolvePath, resolveForWrite, assertWritable, PROJECT_ROOT, DATA_DIR } from '../paths.js';
import { containsElisionMarker, ELISION_MARKER_REASON } from '../../validator.js';
import { decodeTextBufferChecked, pdfText, docxText, xlsxText, ipynbText } from './extract-text.js';

const MAX_READ_BYTES = 200 * 1024;     // 200 KB hard cap
const MAX_CHUNK_BYTES = 50 * 1024;
// Complex formats read_file understands natively. PDFs feed back as document
// blocks and images as vision blocks (via llmMedia) so the model actually sees
// them; Office/RTF text is extracted with macOS `textutil`. Anything else that
// looks binary is refused with guidance instead of mojibake.
const READ_PDF_MAX_BYTES = 20 * 1024 * 1024;   // matches the + button context cap
const READ_IMAGE_MAX_BYTES = 8 * 1024 * 1024;  // matches the + button context cap
const READ_UNKNOWN_MAX_BYTES = 50 * 1024 * 1024; // refuse loading unknown files beyond this into memory
const READ_IMAGE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
// Formats that need a `sips` transcode to a provider-accepted image type.
const CONVERT_IMAGE_EXTS = new Set(['.heic', '.heif', '.tif', '.tiff', '.bmp', '.ico', '.icns', '.psd']);
const TEXTUTIL_EXTS = new Set(['.docx', '.doc', '.rtf', '.rtfd', '.odt', '.wordml', '.webarchive']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.aiff', '.aif', '.caf', '.wma', '.opus']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.mpg', '.mpeg', '.wmv']);
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

function fileExt(absPath) {
  const match = /\.[a-z0-9]+$/i.exec(absPath);
  return match ? match[0].toLowerCase() : '';
}

function looksBinary(buf) {
  return buf.subarray(0, 8192).includes(0);
}

// Run a stock macOS CLI and capture stdout (capped). Rejects on non-zero exit.
function runTool(cmd, args, { maxBytes = 512 * 1024 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= maxBytes + 4096) out.push(chunk);
    });
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(out).toString('utf8'));
      else rejectPromise(new Error(Buffer.concat(err).toString('utf8').trim() || `${cmd} exited ${code}`));
    });
  });
}

// Extract plain text from Word/RTF/ODT via macOS textutil (ships with the OS).
function textutilExtract(absPath) {
  return runTool('textutil', ['-convert', 'txt', '-stdout', absPath], { maxBytes: MAX_READ_BYTES });
}

// Media metadata via Spotlight — duration, dimensions, codecs, sample rate.
async function mdlsMetadata(absPath) {
  try {
    const raw = await runTool('mdls', [
      '-name', 'kMDItemDurationSeconds', '-name', 'kMDItemPixelWidth', '-name', 'kMDItemPixelHeight',
      '-name', 'kMDItemCodecs', '-name', 'kMDItemAudioSampleRate', '-name', 'kMDItemAudioChannelCount',
      '-name', 'kMDItemTitle', '-name', 'kMDItemAuthors', '-name', 'kMDItemKind',
      absPath,
    ]);
    return raw.split('\n').filter((line) => line && !line.includes('(null)')).join('\n');
  } catch {
    return '';
  }
}

// Transcode an image macOS can decode (HEIC, TIFF, BMP, PSD, …) to JPEG.
async function sipsToJpeg(absPath) {
  const tmp = resolve(tmpdir(), `bor-read-${randomUUID()}.jpg`);
  try {
    await runTool('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', absPath, '--out', tmp]);
    return await readFile(tmp);
  } finally {
    unlink(tmp).catch(() => {});
  }
}

// Poster frame for a video via Quick Look.
async function qlThumbnail(absPath) {
  const dir = resolve(tmpdir(), `bor-ql-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    await runTool('qlmanage', ['-t', '-s', '1024', '-o', dir, absPath]);
    const entries = await readdir(dir);
    const png = entries.find((name) => name.toLowerCase().endsWith('.png'));
    if (!png) throw new Error('no thumbnail produced');
    return await readFile(resolve(dir, png));
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function stripXmlToText(xml) {
  return String(xml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Pull the text content out of an Office Open XML container with stock unzip.
async function officeXmlText(absPath, patterns) {
  const raw = await runTool('unzip', ['-p', absPath, ...patterns], { maxBytes: 4 * MAX_READ_BYTES });
  return stripXmlToText(raw);
}

// --- Best-effort pure-Node PDF text extraction --------------------------
// For providers that can't ingest document blocks inline (OpenAI-compatible
// endpoints), we extract the PDF's text server-side: inflate FlateDecode
// streams with stdlib zlib and pull the string literals off the Tj/TJ text
// operators. Handles the common text-based PDF; scanned or CID-encoded PDFs
// yield nothing and the caller falls back to honest guidance.
function pdfLiteralToText(lit) {
  let out = '';
  for (let i = 0; i < lit.length; i += 1) {
    const ch = lit[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = lit[i + 1];
    if (next === undefined) break;
    i += 1;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next >= '0' && next <= '7') {
      let oct = next;
      while (oct.length < 3 && lit[i + 1] >= '0' && lit[i + 1] <= '7') { i += 1; oct += lit[i]; }
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

function extractPdfText(buf) {
  const raw = buf.toString('latin1');
  const streams = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRe.exec(raw))) {
    let content;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      content = match[1]; // uncompressed stream
    }
    if (content && /\b(Tj|TJ)\b/.test(content)) streams.push(content);
  }
  const lines = [];
  for (const content of streams) {
    let line = '';
    const flush = () => { if (line.trim()) lines.push(line.trim()); line = ''; };
    // String literals shown via Tj / ' / ", arrays shown via TJ, and the
    // line-advance operators (T*, Td, TD) as line-break hints.
    const opRe = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")|\[((?:\((?:\\.|[^\\()])*\)|[^\]])*)\]\s*TJ|(T\*|Td|TD|ET)/g;
    let op;
    while ((op = opRe.exec(content))) {
      if (op[3]) { flush(); continue; }
      if (op[1] !== undefined) { line += pdfLiteralToText(op[1]); continue; }
      if (op[2] !== undefined) {
        const litRe = /\(((?:\\.|[^\\()])*)\)/g;
        let lit;
        while ((lit = litRe.exec(op[2]))) line += pdfLiteralToText(lit[1]);
      }
    }
    flush();
  }
  const text = lines.join('\n').replace(/\u0000/g, '').trim();
  if (!text) return '';
  // Quality gate: mostly-unprintable output means CID/hex encoding — garbage.
  const printable = text.replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, '');
  if (printable.length < 40 || printable.length / text.length < 0.7) return '';
  return printable;
}

function complexOk(tag, abs, bytes, format, body, llmMedia) {
  return {
    ok: true,
    event: tag,
    payload: { path: shortPath(abs), bytes, format },
    llmEcho: `# ${tag} ${shortPath(abs)}\nbytes: ${bytes}\nformat: ${format}\n\n${body}`,
    ...(llmMedia ? { llmMedia } : {}),
  };
}

function complexFail(tag, reason) {
  return { ok: false, event: 'tool_error', payload: { tag, reason }, llmEcho: `${tag} failed: ${reason}` };
}

function clipText(text) {
  const truncated = Buffer.byteLength(text, 'utf8') > MAX_READ_BYTES;
  const visible = truncated ? Buffer.from(text, 'utf8').subarray(0, MAX_READ_BYTES).toString('utf8') : text;
  return { visible, truncated };
}

// Route complex formats before the plain-utf8 read. read_file understands, by
// family: PDFs (native document block), images (vision block; HEIC/TIFF/BMP/
// PSD/ICO transcoded via sips), Word/RTF/ODT (textutil text), XLSX/PPTX
// (unzip + XML text), audio (afinfo/mdls metadata), video (Quick Look poster
// frame + metadata), archives (listings). Code and plain text of any kind fall
// through to the normal utf8 read; unknown binary gets metadata + guidance
// instead of mojibake. Returns a full handler result, or null to fall through.
// Reads bytes lazily so a multi-GB video never gets loaded into memory.
// `supportsDocuments` mirrors the active provider: when false (OpenAI-
// compatible endpoints), PDFs return extracted text instead of a document
// block the wire would drop.
async function readComplexFormat(abs, size, { tag, chunked = false, supportsDocuments = true } = {}) {
  const ext = fileExt(abs);
  const noteChunked = chunked ? ' (chunking does not apply to this format — the result covers the whole file)' : '';

  if (ext === '.pdf') {
    if (size > READ_PDF_MAX_BYTES) {
      return complexFail(tag, `PDF is ${Math.round(size / (1024 * 1024))} MB (max 20 MB for inline reading). Ask the user for a smaller export, or use execute_command with a CLI to extract the pages you need.`);
    }
    const buf = await readFile(abs);
    if (supportsDocuments) {
      return complexOk(tag, abs, size, `PDF${noteChunked}`,
        'The full PDF is attached below this tool result as a document — you can read it directly in this conversation. Do NOT use execute_command, Python, or any other extraction method on this file; the attached document already IS its complete content.',
        [{ type: 'document', url: `data:application/pdf;base64,${buf.toString('base64')}`, mediaType: 'application/pdf', name: shortPath(abs) }]);
    }
    // This provider drops document blocks at the wire — extract text instead.
    // pdf-parse (proper extraction, Sixth-style) first; the naive stream
    // parser is the zero-dependency fallback.
    let extracted = '';
    try { extracted = await pdfText(buf); } catch { /* fall through */ }
    if (!extracted) extracted = extractPdfText(buf);
    if (extracted) {
      const { visible, truncated } = clipText(extracted);
      return complexOk(tag, abs, size, 'PDF (text extracted server-side — this provider cannot view PDFs inline)',
        `${visible}${truncated ? '\n[truncated]' : ''}`);
    }
    return complexFail(tag, `this PDF's text could not be extracted server-side (likely a scanned or unusually encoded PDF), and the current provider cannot view PDF documents inline. On THIS provider you may use execute_command to extract it (e.g. a PDF-to-text CLI or Python library if available), or ask the user for a text/markdown export.`);
  }

  const imageMime = READ_IMAGE_MIME_BY_EXT[ext];
  if (imageMime) {
    if (size > READ_IMAGE_MAX_BYTES) {
      return complexFail(tag, `image is ${Math.round(size / (1024 * 1024))} MB (max 8 MB for inline viewing). Downscale it first (e.g. execute_command with sips).`);
    }
    const buf = await readFile(abs);
    return complexOk(tag, abs, size, `image (${imageMime})${noteChunked}`,
      'The image is attached below this tool result — look at it directly.',
      [{ type: 'image_url', url: `data:${imageMime};base64,${buf.toString('base64')}`, mediaType: imageMime }]);
  }

  if (CONVERT_IMAGE_EXTS.has(ext)) {
    try {
      const jpeg = await sipsToJpeg(abs);
      if (jpeg.length > READ_IMAGE_MAX_BYTES) {
        return complexFail(tag, `converted image is still over 8 MB. Downscale it first (execute_command with sips -Z).`);
      }
      return complexOk(tag, abs, size, `image (${ext.slice(1)} → jpeg)${noteChunked}`,
        'The image (converted to JPEG) is attached below this tool result — look at it directly.',
        [{ type: 'image_url', url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, mediaType: 'image/jpeg' }]);
    } catch (error) {
      return complexFail(tag, `could not convert ${ext} image (${error.message}).`);
    }
  }

  if (TEXTUTIL_EXTS.has(ext)) {
    // .docx: mammoth (Sixth-style, structure-aware) first; textutil is the
    // fallback and the primary for .doc/.rtf/.odt which mammoth can't parse.
    if (ext === '.docx') {
      try {
        const text = await docxText(abs);
        if (text) {
          const { visible, truncated } = clipText(text);
          return complexOk(tag, abs, size, 'docx (text extracted)',
            `${visible}${truncated ? '\n[truncated]' : ''}`);
        }
      } catch { /* fall through to textutil */ }
    }
    try {
      const { visible, truncated } = clipText(await textutilExtract(abs));
      return complexOk(tag, abs, size, `${ext.slice(1)} (text extracted via textutil)`,
        `${visible}${truncated ? '\n[truncated]' : ''}`);
    } catch (error) {
      return complexFail(tag, `could not extract text from ${ext} (${error.message}). Ask the user for a plain-text or PDF export.`);
    }
  }

  if (ext === '.xlsx') {
    // ExcelJS (Sixth-style: formula results, dates, hyperlinks, hidden-sheet
    // skipping) first; the raw unzip+strip extraction is the fallback.
    try {
      const text = await xlsxText(abs);
      if (text) {
        const { visible, truncated } = clipText(text);
        return complexOk(tag, abs, size, 'xlsx (sheets extracted)',
          `${visible}${truncated ? '\n[truncated]' : ''}`);
      }
    } catch { /* fall through */ }
    try {
      const { visible, truncated } = clipText(await officeXmlText(abs, ['xl/sharedStrings.xml', 'xl/worksheets/sheet*.xml']));
      return complexOk(tag, abs, size, 'xlsx (cell text extracted)',
        `Extracted spreadsheet text (cell strings; layout/formulas not preserved):\n\n${visible}${truncated ? '\n[truncated]' : ''}`);
    } catch (error) {
      return complexFail(tag, `could not extract xlsx text (${error.message}). Ask the user for a CSV export, or use execute_command to convert it.`);
    }
  }

  if (ext === '.ipynb') {
    try {
      const buf = await readFile(abs);
      const text = ipynbText(buf);
      const { visible, truncated } = clipText(text);
      return complexOk(tag, abs, size, 'ipynb (notebook cells extracted)',
        `${visible || '(empty notebook)'}${truncated ? '\n[truncated]' : ''}`);
    } catch (error) {
      return complexFail(tag, `could not parse notebook (${error.message}).`);
    }
  }

  if (ext === '.pptx') {
    try {
      const { visible, truncated } = clipText(await officeXmlText(abs, ['ppt/slides/slide*.xml', 'ppt/notesSlides/notesSlide*.xml']));
      return complexOk(tag, abs, size, 'pptx (slide text extracted)',
        `Extracted slide text (layout/images not preserved):\n\n${visible}${truncated ? '\n[truncated]' : ''}`);
    } catch (error) {
      return complexFail(tag, `could not extract pptx text (${error.message}). Ask the user for a PDF export.`);
    }
  }

  if (AUDIO_EXTS.has(ext)) {
    const info = await runTool('afinfo', [abs], { maxBytes: 16 * 1024 }).catch(() => '');
    const meta = info || await mdlsMetadata(abs);
    return complexOk(tag, abs, size, `audio (${ext.slice(1)})`,
      `Audio file metadata:\n${meta || '(no metadata available)'}\n\nYou cannot listen to audio directly. If the user needs the contents, ask them what they want from it, or transcribe it with execute_command if a transcription tool is available.`);
  }

  if (VIDEO_EXTS.has(ext)) {
    const meta = await mdlsMetadata(abs);
    let media;
    let frameNote = 'No poster frame could be generated.';
    try {
      const png = await qlThumbnail(abs);
      if (png.length <= READ_IMAGE_MAX_BYTES) {
        media = [{ type: 'image_url', url: `data:image/png;base64,${png.toString('base64')}`, mediaType: 'image/png' }];
        frameNote = 'A poster frame from the video is attached below this tool result.';
      }
    } catch { /* headless/unsupported codec — metadata only */ }
    return complexOk(tag, abs, size, `video (${ext.slice(1)})`,
      `Video file metadata:\n${meta || '(no metadata available)'}\n\n${frameNote} You cannot watch video directly; use execute_command (e.g. a frame-extraction CLI) if specific moments are needed.`, media);
  }

  if (ext === '.zip' || ext === '.jar' || ext === '.epub') {
    try {
      const { visible, truncated } = clipText(await runTool('unzip', ['-l', abs], { maxBytes: MAX_READ_BYTES }));
      return complexOk(tag, abs, size, `${ext.slice(1)} archive (listing)`,
        `Archive contents:\n${visible}${truncated ? '\n[truncated]' : ''}\n\nExtract specific entries with execute_command (unzip -p / unzip -d) to read them.`);
    } catch (error) {
      return complexFail(tag, `could not list archive (${error.message}).`);
    }
  }
  if (ext === '.tar' || ext === '.tgz' || abs.toLowerCase().endsWith('.tar.gz')) {
    try {
      const { visible, truncated } = clipText(await runTool('tar', ['-tf', abs], { maxBytes: MAX_READ_BYTES }));
      return complexOk(tag, abs, size, 'tar archive (listing)',
        `Archive contents:\n${visible}${truncated ? '\n[truncated]' : ''}\n\nExtract specific entries with execute_command (tar -xf) to read them.`);
    } catch (error) {
      return complexFail(tag, `could not list archive (${error.message}).`);
    }
  }

  // Unknown format past a sane size: don't slurp gigabytes into memory.
  if (size > READ_UNKNOWN_MAX_BYTES) {
    const meta = await mdlsMetadata(abs);
    return complexFail(tag, `file is ${Math.round(size / (1024 * 1024))} MB — too large to read inline.${meta ? `\nMetadata:\n${meta}` : ''}\nUse execute_command to inspect or extract what you need.`);
  }

  return null;
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
    const st = await stat(abs);
    const complex = await readComplexFormat(abs, st.size, { tag: 'read_file', supportsDocuments: ctx.providerCaps?.supportsDocuments !== false });
    if (complex) {
      ctx.markReadFile?.(abs);
      await ctx.audit({ kind: 'fs.read', path: abs, bytes: st.size, format: complex.payload?.format || 'refused' });
      return complex;
    }
    const buf = await readFile(abs);
    // Encoding-aware decode (jschardet + iconv-lite, Sixth's order: sniff
    // first, binary-check only undetectable buffers) — utf16/latin1 text
    // files no longer come back as mojibake.
    const decoded = await decodeTextBufferChecked(buf);
    if (decoded === null) {
      const reason = `"${shortPath(abs)}" is binary — decoding it as text would produce garbage. read_file natively supports PDFs, images, Word/RTF/ODT, XLSX/PPTX, notebooks, audio/video metadata, and archives; for this format use execute_command with an appropriate CLI, or ask the user for a supported export.`;
      return { ok: false, event: 'tool_error', payload: { tag: 'read_file', reason }, llmEcho: `read_file refused: ${reason}` };
    }
    const { visible: text, truncated } = clipText(decoded);
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
    const st = await stat(abs);
    const complex = await readComplexFormat(abs, st.size, { tag: 'read_file_in_chunks', chunked: true, supportsDocuments: ctx.providerCaps?.supportsDocuments !== false });
    if (complex) {
      ctx.markReadFile?.(abs);
      await ctx.audit({ kind: 'fs.read_chunk', path: abs, bytes: st.size, format: complex.payload?.format || 'refused' });
      return complex;
    }
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
  // History serializes long past bodies as self-closing stubs. A model
  // imitating the stub form sends an empty body — refuse it with the fix
  // spelled out rather than silently writing a zero-byte file.
  if (!content.trim()) {
    const reason = `${tag} requires the complete file content inside the tag body (CDATA-wrapped). `
      + 'The body was empty. Emit the call again with the FULL content — or, to intentionally create an '
      + 'empty file, use <execute_command>touch <path></execute_command>.';
    await ctx.audit({ kind: 'tool.refused', tag, path: abs, reason: 'empty body' });
    return { ok: false, event: 'tool_error', payload: { tag, reason }, llmEcho: `${tag} refused: ${reason}` };
  }
  // A body carrying a history-elision marker is a truncated imitation of
  // compressed history, never real file content — refuse instead of silently
  // writing a broken file (see validator.js containsElisionMarker).
  if (containsElisionMarker(content)) {
    await ctx.audit({ kind: 'tool.refused', tag, path: abs, reason: 'elision marker in body' });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: ELISION_MARKER_REASON },
      llmEcho: `${tag} refused: ${ELISION_MARKER_REASON}`,
    };
  }
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

  if (containsElisionMarker(block.body)) {
    await ctx.audit({ kind: 'tool.refused', tag, path: abs, reason: 'elision marker in body' });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: ELISION_MARKER_REASON },
      llmEcho: `${tag} refused: ${ELISION_MARKER_REASON}`,
    };
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
  const media = [];
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
      // A batched PDF/image echoes "attached below" — carry its media through
      // or that claim would be false.
      if (Array.isArray(result.llmMedia)) media.push(...result.llmMedia);
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
    ...(media.length ? { llmMedia: media } : {}),
  };
}
