// <display_media> handler — explicit media card rendering in the thought
// bubble. The harness no longer auto-scans every say/search/fetch text for
// URLs; the model calls this when (and only when) it wants media cards on
// screen. Typical flow: scrape a feed → collect URLs → display_media to
// surface them all at once.
//
// Accepted shapes:
//   <display_media url="https://youtu.be/..." title="Optional title"/>
//   <display_media>
//     <![CDATA[
//     https://youtu.be/abc
//     https://www.tiktok.com/@user/video/123
//     https://i.imgur.com/foo.jpg
//     ]]>
//   </display_media>
//
// Both forms can also coexist (attrs cover the first item, body adds more).
// Empty / commented lines (# or //) are ignored.

const URL_LIKE = /^(https?:\/\/|\/|data:|file:)/i;

// Tweet URL → numeric status id. Tolerates twitter.com, x.com, mobile.twitter.com,
// /i/status/, /i/web/status/, and trailing query strings.
function extractTweetId(url) {
  const m = String(url || '').match(/(?:twitter\.com|x\.com)\/[^?]*?\/status(?:es)?\/(\d+)/i);
  return m ? m[1] : '';
}

export async function executeDisplayTweet(block /* , ctx */) {
  const items = [];
  const singleUrl = String(block.attrs?.url || '').trim();
  const title = String(block.attrs?.title || '').trim();
  if (singleUrl) {
    const id = extractTweetId(singleUrl);
    if (id) items.push({ url: singleUrl, kind: 'tweet', tweetId: id, title: title || undefined });
  }
  const body = String(block.body || '').trim();
  if (body) {
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      const sepMatch = line.match(/^(\S+)\s+(?:\||—|-)\s+(.+)$/);
      const url = sepMatch ? sepMatch[1] : line;
      const itemTitle = sepMatch ? sepMatch[2].trim() : '';
      const id = extractTweetId(url);
      if (!id) continue;
      items.push({ url, kind: 'tweet', tweetId: id, title: itemTitle || undefined });
    }
  }
  if (items.length === 0) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag: 'display_tweet', reason: 'no valid tweet URL — expecting https://twitter.com/<handle>/status/<id> or https://x.com/<handle>/status/<id>' },
      llmEcho: 'display_tweet: no valid tweet url',
    };
  }
  const summary = items.slice(0, 3).map((i) => i.url).join(', ');
  return {
    ok: true,
    event: 'display_media',
    payload: { items, title: title || undefined },
    llmEcho: `displayed ${items.length} tweet${items.length === 1 ? '' : 's'}: ${summary}${items.length > 3 ? ` …+${items.length - 3} more` : ''}`,
  };
}

export async function executeDisplayMedia(block /* , ctx */) {
  const items = [];
  const singleUrl = String(block.attrs?.url || '').trim();
  const title = String(block.attrs?.title || '').trim();
  const caption = String(block.attrs?.caption || '').trim();
  if (singleUrl) {
    items.push({
      url: singleUrl,
      title: title || undefined,
      caption: caption || undefined,
    });
  }

  const body = String(block.body || '').trim();
  if (body) {
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#') || line.startsWith('//')) continue;
      // Allow `<url> | <title>` or `<url> — <title>` syntax for batched titles.
      let url = line;
      let itemTitle = '';
      const sepMatch = line.match(/^(\S+)\s+(?:\||—|-)\s+(.+)$/);
      if (sepMatch && URL_LIKE.test(sepMatch[1])) {
        url = sepMatch[1].trim();
        itemTitle = sepMatch[2].trim();
      }
      if (!URL_LIKE.test(url)) continue;
      items.push({ url, title: itemTitle || undefined });
    }
  }

  if (items.length === 0) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag: 'display_media', reason: 'no media url provided — pass `url` attr, or one URL per line in the body' },
      llmEcho: 'display_media: no url provided',
    };
  }

  const summary = items
    .slice(0, 3)
    .map((i) => i.url)
    .join(', ');

  return {
    ok: true,
    event: 'display_media',
    payload: {
      items,
      title: title || undefined,
      caption: caption || undefined,
    },
    llmEcho: `displayed ${items.length} media card${items.length === 1 ? '' : 's'}: ${summary}${items.length > 3 ? ` …+${items.length - 3} more` : ''}`,
  };
}
