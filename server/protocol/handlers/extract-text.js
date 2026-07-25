// Text extraction for complex formats — ported from Sixth
// (sixth-vscode-v2 src/integrations/misc/extract-text.ts), the reference
// implementation for BOR's file-reading stack:
//   - pdf-parse (v2 PDFParse API) for PDFs
//   - mammoth for .docx raw text
//   - ExcelJS for .xlsx (formula results, dates, hyperlinks, hidden sheets)
//   - jschardet + iconv-lite for encoding-aware text decoding
//   - isbinaryfile for binary detection
//   - stdlib JSON for .ipynb notebooks

import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';
import { isBinaryFile } from 'isbinaryfile';
import { PDFParse } from 'pdf-parse';

const XLSX_MAX_ROWS_PER_SHEET = 50_000;

export async function isBinaryBuffer(buf) {
  try {
    return await isBinaryFile(buf, buf.length);
  } catch {
    return buf.subarray(0, 8192).includes(0);
  }
}

/** Encoding-aware decode: jschardet sniffs, iconv-lite decodes, utf8 fallback. */
export function decodeTextBuffer(buf) {
  try {
    const detected = jschardet.detect(buf);
    const encoding = detected?.encoding && iconv.encodingExists(detected.encoding)
      ? detected.encoding
      : 'utf8';
    return iconv.decode(buf, encoding);
  } catch {
    return buf.toString('utf8');
  }
}

/**
 * Sixth's read order: sniff the encoding FIRST and trust a confident match
 * (latin1/utf16 text must not be misread as binary); only an undetectable
 * buffer that isbinaryfile also flags is treated as binary. Returns the
 * decoded text, or null for binary content.
 */
export async function decodeTextBufferChecked(buf) {
  try {
    const detected = jschardet.detect(buf);
    if (detected?.encoding && (detected.confidence ?? 0) >= 0.5 && iconv.encodingExists(detected.encoding)) {
      return iconv.decode(buf, detected.encoding);
    }
  } catch { /* fall through to binary check */ }
  if (await isBinaryBuffer(buf)) return null;
  return buf.toString('utf8');
}

export async function pdfText(buf) {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    // Strip the "-- N of M --" page separators pdf-parse v2 appends.
    return String(result?.text || '').replace(/\n?-- \d+ of \d+ --\n?/g, '\n').trim();
  } finally {
    await parser.destroy?.().catch?.(() => {});
  }
}

export async function docxText(absPath) {
  const result = await mammoth.extractRawText({ path: absPath });
  return String(result?.value || '').trim();
}

// Mirrors Sixth's formatCellValue: nulls, error cells, dates, rich text,
// hyperlinks, and formulas (calculated result preferred).
function formatCellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.error) return `[Error: ${value.error}]`;
    if (value instanceof Date) return value.toISOString().split('T')[0];
    if (value.richText) return value.richText.map((rt) => rt.text).join('');
    if (value.text && value.hyperlink) return `${value.text} (${value.hyperlink})`;
    if (value.formula) {
      return value.result !== undefined && value.result !== null
        ? String(value.result)
        : `[Formula: ${value.formula}]`;
    }
    return String(value);
  }
  return String(value);
}

export async function xlsxText(absPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absPath);
  const sheets = [];
  workbook.eachSheet((sheet) => {
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') return;
    const lines = [`--- Sheet: ${sheet.name} ---`];
    let truncated = false;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > XLSX_MAX_ROWS_PER_SHEET) { truncated = true; return; }
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(formatCellValue(cell)));
      const line = cells.join('\t').trimEnd();
      if (line.trim()) lines.push(line);
    });
    if (truncated) lines.push(`[... truncated at row ${XLSX_MAX_ROWS_PER_SHEET} ...]`);
    if (lines.length > 1) sheets.push(lines.join('\n'));
  });
  return sheets.join('\n\n').trim();
}

export function ipynbText(buf) {
  const notebook = JSON.parse(decodeTextBuffer(buf));
  const parts = [];
  for (const cell of notebook?.cells || []) {
    if (cell.cell_type !== 'markdown' && cell.cell_type !== 'code') continue;
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    if (!source.trim()) continue;
    parts.push(cell.cell_type === 'code' ? `\`\`\`\n${source}\n\`\`\`` : source);
  }
  return parts.join('\n\n').trim();
}
