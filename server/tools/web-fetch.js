// Web fetch — pulls a URL, strips HTML noise, returns a text approximation.
//
// Not a full readability extractor; just strips <script>, <style>, and tags,
// collapses whitespace, and truncates. Good enough for the LLM to grok the
// page content without paying for every byte.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const MAX_BYTES = 12 * 1024; // 12 KB returned text after stripping
const MAX_INPUT_BYTES = 2 * 1024 * 1024; // refuse pages >2 MB at the source
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_WEB_FETCH_TIMEOUT_MS) || 30_000);

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim().slice(0, 200) : null;
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|br|li|h[1-6]|div|section|article|tr|td|th)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function webFetch(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'invalid url' };
  }
  let res;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error(`web fetch timeout after ${Math.round(FETCH_TIMEOUT_MS / 1000)}s`)), FETCH_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9' },
      redirect: 'follow',
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_INPUT_BYTES) {
      return { ok: false, reason: `page too large (${buf.length}B; max ${MAX_INPUT_BYTES}B)` };
    }
    const raw = buf.toString('utf8');

    // JSON / plain-text endpoints get returned verbatim (truncated).
    if (/^application\/json/i.test(ct)) {
      return {
        ok: true, url, title: null, contentType: ct,
        text: raw.slice(0, MAX_BYTES),
        truncated: raw.length > MAX_BYTES,
      };
    }
    if (/^text\/plain/i.test(ct) || !/html|xml/i.test(ct)) {
      return {
        ok: true, url, title: null, contentType: ct,
        text: raw.slice(0, MAX_BYTES),
        truncated: raw.length > MAX_BYTES,
      };
    }

    const title = extractTitle(raw);
    const stripped = htmlToText(raw);
    return {
      ok: true,
      url,
      title,
      contentType: ct,
      text: stripped.slice(0, MAX_BYTES),
      truncated: stripped.length > MAX_BYTES,
      sourceBytes: buf.length,
    };
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e.message}` };
  } finally {
    clearTimeout(timeout);
  }
}
