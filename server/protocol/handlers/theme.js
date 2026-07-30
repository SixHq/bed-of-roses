// Theme + system handlers — set_theme, reset_theme, set_ai_name, reset_chat.
//
// Each is an adapter shim around the existing config mutators (loadConfig /
// saveConfig / mergeConfig) in server/index.js. The registry passes a `ctx`
// with those functions injected so we don't have a circular import.
//
// <wallpaper> child also supports `from_prompt` — the server generates an
// image via the active provider, saves it, and sets wallpaper to its url().
// This collapses the otherwise two-turn dance ("generate" then "apply") into
// one LLM emit.

import { generateAndSave } from '../../tools/images.js';
import { getProvider } from '../../providers/index.js';

const VALID_ACCENTS = new Set(['pearl', 'amber', 'ember', 'bloom', 'aurora', 'frost', 'lilac', 'onyx']);
const VALID_AVATAR_STYLES = new Set(['nova', 'cipher', 'aria', 'echo']);

function pickChild(block, name) {
  return block.children?.find((c) => c.name === name) || null;
}

export async function executeSetTheme(block, ctx) {
  const config = await ctx.loadConfig();
  const update = {};
  const themeUpdate = {};
  let touched = [];

  const accentNode = pickChild(block, 'accent');
  if (accentNode?.body) {
    const v = accentNode.body.toLowerCase().trim();
    if (VALID_ACCENTS.has(v)) {
      themeUpdate.accent = v;
      update.avatarColor = v; // mirror so the avatar renderer follows
      touched.push(`accent=${v}`);
    }
  }

  const wallpaperNode = pickChild(block, 'wallpaper');
  if (wallpaperNode) {
    const fromPrompt = (wallpaperNode.attrs?.from_prompt || '').trim();
    const explicitUrl = (wallpaperNode.attrs?.url || '').trim();
    const bodyVal = (wallpaperNode.body || '').trim();

    if (fromPrompt) {
      // Generate the image first, then set wallpaper to url(/api/images/...).
      const providerId = config?.defaultProvider;
      const provider = providerId ? getProvider(providerId) : null;
      const providerCfg = config?.providers?.[providerId];
      if (!provider || !providerCfg) {
        return { ok: false, event: 'tool_error', payload: { tag: 'set_theme', reason: 'no provider configured for wallpaper generation' }, llmEcho: 'set_theme wallpaper-from-prompt failed: no provider' };
      }
      if (typeof provider.generateImage !== 'function') {
        return { ok: false, event: 'tool_error', payload: { tag: 'set_theme', reason: `${provider.label} cannot generate images — use a literal gradient instead` }, llmEcho: `set_theme wallpaper-from-prompt failed: ${provider.label} doesn't support image gen` };
      }
      try {
        const size = (wallpaperNode.attrs?.size || '1536x1024').trim();
        const saved = await generateAndSave({ provider, providerCfg, prompt: fromPrompt, hint: 'wallpaper', size });
        // Compose a CSS background string that fills the viewport but stays
        // behind the OS chrome. Center, cover, no repeat.
        update.wallpaper = `center / cover no-repeat url("${saved.url}")`;
        touched.push(`wallpaper-from-prompt → ${saved.url}`);
        await ctx.audit({ kind: 'image.generate', model: saved.model, bytes: saved.bytes, url: saved.url, reason: 'wallpaper' });
      } catch (e) {
        return { ok: false, event: 'tool_error', payload: { tag: 'set_theme', reason: `wallpaper image-gen failed: ${e.message}` }, llmEcho: `set_theme wallpaper failed: ${e.message}` };
      }
    } else if (explicitUrl) {
      // <wallpaper url="https://..."/> or <wallpaper url="/api/images/foo.png"/>
      const safe = explicitUrl.slice(0, 400);
      update.wallpaper = `center / cover no-repeat url("${safe}")`;
      touched.push('wallpaper');
    } else if (bodyVal) {
      // Legacy: <wallpaper>linear-gradient(...)</wallpaper> or any CSS background string
      update.wallpaper = bodyVal.slice(0, 400);
      touched.push('wallpaper');
    }
  }

  const fontsNode = pickChild(block, 'fonts');
  if (fontsNode) {
    const f = {};
    for (const key of ['display', 'system', 'mono']) {
      if (fontsNode.attrs[key]) f[key] = String(fontsNode.attrs[key]).slice(0, 60);
    }
    if (Object.keys(f).length) {
      themeUpdate.fonts = f;
      touched.push(`fonts=${Object.keys(f).join('+')}`);
    }
  }

  const atmoNode = pickChild(block, 'atmosphere');
  if (atmoNode?.body) {
    const v = atmoNode.body.trim();
    if (v === 'none' || v === 'default') themeUpdate.atmosphere = v;
    else themeUpdate.atmosphere = v.slice(0, 400);
    touched.push('atmosphere');
  }

  if (Object.keys(themeUpdate).length) {
    update.theme = { ...(config.theme || {}), ...themeUpdate };
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, event: 'tool_error', payload: { tag: 'set_theme', reason: 'no recognized fields' }, llmEcho: 'set_theme no-op' };
  }

  const next = ctx.mergeConfig(config, update);
  await ctx.saveConfig(next);
  await ctx.audit({ kind: 'config.update', fields: Object.keys(update) });

  return {
    ok: true,
    event: 'set_theme',
    payload: { config: ctx.publicConfig(next) },
    llmEcho: `set_theme: ${touched.join(', ')}`,
  };
}

export async function executeResetTheme(_block, ctx) {
  const config = await ctx.loadConfig();
  const next = ctx.mergeConfig(config, { theme: null });
  await ctx.saveConfig(next);
  await ctx.audit({ kind: 'config.update', fields: ['theme'] });
  return {
    ok: true,
    event: 'set_theme',
    // `reset: true` tells the host to restore the user's ORIGINAL desktop
    // wallpaper (snapshotted before BOR's first apply) instead of painting
    // the default BOR gradient over it.
    payload: { config: ctx.publicConfig(next), reset: true },
    llmEcho: 'reset_theme',
  };
}

export async function executeSetAiName(block, ctx) {
  const value = (block.body || '').trim().slice(0, 24);
  if (!value) {
    return { ok: false, event: 'tool_error', payload: { tag: 'set_ai_name', reason: 'empty name' }, llmEcho: 'set_ai_name empty' };
  }
  const config = await ctx.loadConfig();
  const next = ctx.mergeConfig(config, { aiName: value });
  await ctx.saveConfig(next);
  await ctx.audit({ kind: 'config.update', fields: ['aiName'] });
  return { ok: true, event: 'set_theme', payload: { config: ctx.publicConfig(next) }, llmEcho: `Renamed to "${value}"` };
}

export async function executeResetChat(_block /* , ctx */) {
  // No server-side state to clear — the client owns conversation memory.
  // We just notify the client via SSE so it can flush its messages array.
  return { ok: true, event: 'reset_chat', payload: {}, llmEcho: 'Chat cleared' };
}
