import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const UX_ICON_THUMBNAIL_PATH = '/Users/Opeyemi/open-source-os/UX_app_icons_and_thumbnails.html';
const DESIGN_GUIDELINE_DIR = '/Users/Opeyemi/open-source-os/design-guideline';
const SHORTCUT_CARD_SPEC_PATH = '/Users/Opeyemi/open-source-os/design-guideline/shortcut-card.md';
const DEFAULT_THEME = 'bloom';

const THEME_GUIDELINE_FILES = new Map([
  ['bloom', 'bloom.md'],
  ['cartoon-brutalist', 'cartoon-brutalist.md'],
  ['liquid-glass', 'liquid-glass.md'],
  ['neo-brutalist', 'neo-brutalist.md'],
  ['pixel-crt', 'pixel-crt.md'],
  ['risograph', 'risograph.md'],
  ['warm-earthy', 'warm-earthy.md'],
  ['y2k-frutiger', 'y2k-frutiger.md'],
]);

const THEME_HTML_HEADINGS = new Map([
  ['bloom', 'Bloom'],
  ['cartoon-brutalist', 'Cartoon Brutalist'],
  ['liquid-glass', 'Liquid Glass'],
  ['neo-brutalist', 'Neo Brutalist'],
  ['pixel-crt', 'Pixel CRT'],
  ['risograph', 'Risograph'],
  ['warm-earthy', 'Warm &amp; Earthy'],
  ['y2k-frutiger', 'Y2K / Frutiger Aero'],
]);

function normalizeThemeId(themeId) {
  const id = String(themeId || '').trim().toLowerCase();
  return THEME_GUIDELINE_FILES.has(id) ? id : DEFAULT_THEME;
}

function extractActiveThemeHtmlGuidelines(html, themeId) {
  const heading = THEME_HTML_HEADINGS.get(themeId);
  if (!heading) return html;
  const firstThemeIndex = html.search(/^<h2>/m);
  const prelude = firstThemeIndex === -1 ? '' : html.slice(0, firstThemeIndex).trim();
  const startRe = new RegExp(`^<h2>${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s\\S]*?$`, 'm');
  const startMatch = html.match(startRe);
  if (!startMatch || startMatch.index == null) return html;
  const rest = html.slice(startMatch.index);
  const nextMatch = rest.slice(startMatch[0].length).match(/^<h2>/m);
  const end = nextMatch?.index == null ? html.length : startMatch.index + startMatch[0].length + nextMatch.index;
  const activeSection = html.slice(startMatch.index, end).trim();
  return [
    '<!-- Shared CSS and context from UX_app_icons_and_thumbnails.html -->',
    prelude,
    `<!-- Active theme section only: ${themeId} -->`,
    activeSection,
  ].filter(Boolean).join('\n\n');
}

export async function executeGetUxUiStrictGuidelines(block, ctx) {
  const cfg = await ctx.loadConfig?.();
  const requestedTheme = block.attrs?.theme;
  const themeId = normalizeThemeId(requestedTheme || cfg?.baseTheme || DEFAULT_THEME);
  const designGuidelinePath = resolve(DESIGN_GUIDELINE_DIR, THEME_GUIDELINE_FILES.get(themeId));

  // Same-turn re-fetch guard. The handler ctx persists across passes within
  // one assistant turn, so once the model has already received the full
  // ~36k-char spec there is zero reason to ship it again — re-emitting it
  // pushes the prompt past Anthropic's 30k tokens/min org rate limit and
  // every retry fails for the rest of the minute. Reasons the model
  // re-fetches mid-turn: it interprets a deferred attempt_completion as
  // "redo the work" and starts over from the guideline-fetch step.
  if (ctx.hasUxUiStrictGuidelines?.() && (ctx.uxUiStrictGuidelinesTheme?.() === themeId || !requestedTheme)) {
    return {
      ok: true,
      event: 'get_ux_ui_strict_guidelines',
      payload: { themeId, alreadyLoadedThisTurn: true },
      llmEcho: [
        `get_ux_ui_strict_guidelines: already returned in an earlier pass of this turn for theme "${themeId}".`,
        'The full design kit, widget thumbnail spec, and theme handbook are still visible in the previous tool_result above — re-read that block instead of re-fetching. Do NOT call this tag again this turn; proceed directly to <create_app>/<create_widget>/<update_app>/<update_widget>.',
      ].join('\n'),
    };
  }

  try {
    const [appIconAndThumbnailGuidelines, designGuideline, shortcutCardSpec] = await Promise.all([
      readFile(UX_ICON_THUMBNAIL_PATH, 'utf8'),
      readFile(designGuidelinePath, 'utf8'),
      readFile(SHORTCUT_CARD_SPEC_PATH, 'utf8'),
    ]);
    const activeThemeIconAndThumbnailGuidelines = extractActiveThemeHtmlGuidelines(appIconAndThumbnailGuidelines, themeId);

    ctx.markUxUiStrictGuidelinesRequested?.({ themeId, designGuidelinePath });
    await ctx.audit?.({
      kind: 'ux_ui_strict_guidelines.read',
      themeId,
      paths: [UX_ICON_THUMBNAIL_PATH, designGuidelinePath, SHORTCUT_CARD_SPEC_PATH],
    });

    return {
      ok: true,
      event: 'get_ux_ui_strict_guidelines',
      payload: {
        themeId,
        appIconAndThumbnailPath: UX_ICON_THUMBNAIL_PATH,
        appIconAndThumbnailGuidelines,
        activeThemeIconAndThumbnailGuidelines,
        designGuidelinePath,
        designGuideline,
        shortcutCardSpecPath: SHORTCUT_CARD_SPEC_PATH,
        shortcutCardSpec,
      },
      llmEcho: [
        `get_ux_ui_strict_guidelines ok for theme "${themeId}".`,
        // The shortcut-card spec is the STRICT contract for create_shortcut —
        // height ranges, layout patterns, theme tokens, the API-key UI POC
        // pattern, what's forbidden. Read it first; the theme + icon kit blocks
        // below are supplementary visual guidance for apps + thumbnails.
        `shortcutCardSpecPath: ${SHORTCUT_CARD_SPEC_PATH}`,
        '<shortcut_card_spec>',
        shortcutCardSpec,
        '</shortcut_card_spec>',
        `appIconAndThumbnailPath: ${UX_ICON_THUMBNAIL_PATH}`,
        '<active_theme_app_icon_and_thumbnail_guidelines>',
        activeThemeIconAndThumbnailGuidelines,
        '</active_theme_app_icon_and_thumbnail_guidelines>',
        `designGuidelinePath: ${designGuidelinePath}`,
        '<active_theme_design_guideline>',
        designGuideline,
        '</active_theme_design_guideline>',
        'You may now create_app or create_shortcut in the next pass. The shortcut_card_spec block above is the strict contract for create_shortcut — bubble heights, layout patterns, color tokens, allowed primitives, the API-key UI pattern, what is forbidden. Follow it exactly.',
      ].join('\n'),
    };
  } catch (err) {
    return {
      ok: false,
      event: 'tool_error',
      payload: {
        tag: 'get_ux_ui_strict_guidelines',
        reason: err.message,
        themeId,
        appIconAndThumbnailPath: UX_ICON_THUMBNAIL_PATH,
        designGuidelinePath,
      },
      llmEcho: `get_ux_ui_strict_guidelines failed: ${err.message}`,
    };
  }
}
