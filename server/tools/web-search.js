// Web search — basic, zero-key, scrapes DuckDuckGo's HTML endpoint.
//
// Not as rich as a real search API but it works without configuration. If the
// user wants better results, future versions can route through Brave Search /
// Serper / native provider tool calls when an API key is configured.
//
// Returns up to N results: { title, url, snippet }.

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const SEARCH_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_WEB_SEARCH_TIMEOUT_MS) || 30_000);

function decodeHtmlEntities(s) {
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

function stripTags(s) {
  return decodeHtmlEntities(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** DuckDuckGo wraps real URLs in a redirect like `//duckduckgo.com/l/?uddg=<urlencoded>`. */
function unwrapDuckUrl(href) {
  if (!href) return null;
  let h = href.startsWith('//') ? `https:${href}` : href;
  try {
    const u = new URL(h);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return u.toString();
  } catch { return null; }
}

export async function webSearch(query, { limit = 5 } = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, reason: 'empty query', results: [] };
  }

  const form = new URLSearchParams({ q: query, kl: 'us-en' });
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error(`web search timeout after ${Math.round(SEARCH_TIMEOUT_MS / 1000)}s`)), SEARCH_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  let res;
  let html;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        accept: 'text/html',
      },
      body: form.toString(),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, reason: `search ${res.status}`, results: [] };
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  // Result blocks live under a "results" container. Each block has classes
  // like `result results_links results_links_deep web-result`. We don't trust
  // that class string to stay stable — instead, find every <a class="result__a">
  // anchor (those carry the title + URL) and, for each one, look forward in the
  // HTML for the next snippet anchor or div.
  const results = [];
  const titleRe = /<a[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = titleRe.exec(html)) && results.length < limit) {
    const url = unwrapDuckUrl(m[1]);
    const title = stripTags(m[2]);
    if (!url || !title) continue;
    // Skip sponsored / ad anchors — those usually live in a different parent.
    if (/^https:\/\/duckduckgo\.com\/y\.js/.test(url) || url.startsWith('https://duckduckgo.com/y.js')) continue;
    // Snippet: scan the next ~1500 chars after the title close tag for the snippet anchor or div.
    const after = html.slice(titleRe.lastIndex, titleRe.lastIndex + 1500);
    let snippet = '';
    const snipA = after.match(/<a[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (snipA) snippet = stripTags(snipA[1]);
    else {
      const snipD = after.match(/<div[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (snipD) snippet = stripTags(snipD[1]);
    }
    results.push({ title, url, snippet });
  }

  return { ok: true, query, results };
}
