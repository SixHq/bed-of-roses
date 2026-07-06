// Browser session — a single Playwright-driven Chromium the model can launch,
// view, and interact with, then read back a screenshot + console logs. This is
// a faithful port of the Sixth VSCode `browser_action` BrowserSession (which
// uses puppeteer) onto Playwright, which BOR already bundles.
//
// One headless browser per runtime process. The sequence the model drives is
// always: launch(url) -> [click|type|scroll_down|scroll_up]* -> close. Every
// action except `close` returns:
//   { screenshot, logs, currentUrl, currentMousePosition }
// where `screenshot` is a base64 jpeg data URL (the exact shape the presence
// thought bubble and the LLM image-feedback path consume).

import { chromium } from 'playwright';
import { resolveBrowserExecutable } from './browser.js';

export const DEFAULT_VIEWPORT = { width: 1024, height: 720 };
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

let session = null; // { browser, context, page, viewport, mouse }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isOpen() {
  return Boolean(session?.page);
}

export function currentViewport() {
  return session?.viewport || DEFAULT_VIEWPORT;
}

// Launch the underlying Chromium, trying the bundled Playwright build first,
// then a resolved system Chrome, then the `chrome` channel. Throws a clear,
// actionable error if none work.
async function launchChromium() {
  const baseArgs = { headless: true, args: ['--disable-dev-shm-usage'] };
  try {
    return await chromium.launch(baseArgs);
  } catch (bundledErr) {
    // Bundled Chromium missing (user never ran `npm run browser:install`) —
    // fall back to a resolved system Chrome, then the `chrome` channel.
    const resolved = resolveBrowserExecutable({ userFacing: false });
    if (resolved?.ok && resolved.executablePath) {
      try {
        return await chromium.launch({ ...baseArgs, executablePath: resolved.executablePath });
      } catch { /* fall through */ }
    }
    try {
      return await chromium.launch({ ...baseArgs, channel: 'chrome' });
    } catch { /* fall through */ }
    throw new Error(
      `headless browser failed to launch (${bundledErr.message}). Install the bundled Chromium with "npm run browser:install".`,
    );
  }
}

// Run one page action, capturing any new console logs, then take a screenshot.
// Mirrors Sixth's BrowserSession.doAction: attach console/pageerror listeners,
// run the action, wait briefly for console output to settle, screenshot.
async function doAction(action) {
  if (!session?.page) {
    throw new Error('browser is not open. Launch it first with action="launch".');
  }
  const { page } = session;
  const logs = [];
  let lastLogAt = Date.now();

  const onConsole = (msg) => {
    const type = msg.type();
    logs.push(type === 'log' ? msg.text() : `[${type}] ${msg.text()}`);
    lastLogAt = Date.now();
  };
  const onPageError = (err) => {
    logs.push(`[Page Error] ${err?.toString?.() || String(err)}`);
    lastLogAt = Date.now();
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await action(page);
  } catch (err) {
    logs.push(`[Error] ${err instanceof Error ? err.message : String(err)}`);
  }

  // Wait for console activity to go quiet (max ~3s), like Sixth's pWaitFor.
  const settleStart = Date.now();
  while (Date.now() - settleStart < 3000) {
    if (Date.now() - lastLogAt >= 500) break;
    await sleep(100);
  }

  let screenshot = '';
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
    screenshot = `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    try {
      const buf = await page.screenshot({ type: 'png' });
      screenshot = `data:image/png;base64,${buf.toString('base64')}`;
    } catch { /* screenshot may fail on a closing page */ }
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  return {
    screenshot,
    logs: logs.join('\n'),
    currentUrl: safeUrl(page),
    currentMousePosition: session.mouse,
  };
}

function safeUrl(page) {
  try { return page.url(); } catch { return ''; }
}

async function waitForStable(page, timeout = 7000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch { /* networkidle can legitimately never fire; that's fine */ }
}

export async function launch({ url, viewport } = {}) {
  await close(); // a launch always starts a fresh session
  const vp = normalizeViewport(viewport);
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: vp, userAgent: USER_AGENT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  session = { browser, context, page, viewport: vp, mouse: `${Math.round(vp.width * 0.7)},${Math.round(vp.height * 0.5)}` };
  // Cheap cross-module flag so the executor can auto-close on a non-browser
  // tool WITHOUT importing this module (and thus Playwright) until a browser
  // has actually been opened.
  globalThis.__borBrowserOpen = true;

  return doAction(async (p) => {
    if (url) {
      await p.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await waitForStable(p);
    }
  });
}

export async function navigate(url) {
  return doAction(async (page) => {
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await waitForStable(page);
  });
}

export async function click(coordinate) {
  const [x, y] = String(coordinate || '').split(',').map((n) => Number(n.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`invalid coordinate "${coordinate}" — expected "x,y" within ${session?.viewport?.width || DEFAULT_VIEWPORT.width}x${session?.viewport?.height || DEFAULT_VIEWPORT.height}`);
  }
  return doAction(async (page) => {
    let navigated = false;
    const onRequest = () => { navigated = true; };
    page.on('request', onRequest);
    await page.mouse.click(x, y);
    if (session) session.mouse = `${x},${y}`;
    await sleep(120);
    if (navigated) {
      await page.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => {});
      await waitForStable(page);
    }
    page.off('request', onRequest);
  });
}

export async function type(text) {
  return doAction(async (page) => {
    await page.keyboard.type(String(text ?? ''));
  });
}

export async function scrollDown() {
  return doAction(async (page) => {
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
    await sleep(300);
  });
}

export async function scrollUp() {
  return doAction(async (page) => {
    await page.evaluate(() => window.scrollBy({ top: -600, behavior: 'instant' }));
    await sleep(300);
  });
}

export async function close() {
  const current = session;
  session = null;
  globalThis.__borBrowserOpen = false;
  if (!current) return {};
  try { await current.context?.close?.(); } catch { /* ignore */ }
  try { await current.browser?.close?.(); } catch { /* ignore */ }
  return {};
}

function normalizeViewport(viewport) {
  const w = Math.round(Number(viewport?.width));
  const h = Math.round(Number(viewport?.height));
  return {
    width: Number.isFinite(w) && w >= 320 && w <= 2560 ? w : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(h) && h >= 320 && h <= 1600 ? h : DEFAULT_VIEWPORT.height,
  };
}
