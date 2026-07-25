// Bed of Roses — theme registry.
//
// Each entry declares everything the shell + LLM need to know to render and
// "speak" a theme correctly. Adding a new theme = adding one entry here +
// dropping a tokens.css (and optional extras.css) into shell/themes/<id>/.
//
// The shell uses { id, label, tagline, tokensHref, extrasHref } at runtime.
// The server uses { llmContext } when building the system prompt so the
// LLM's generated widgets correlate with the active theme.
//
// `palettePreview` is a small ordered list of hex stops that the onboarding
// picker renders as a swatch strip — gives the user a glanceable read of the
// theme without needing a screenshot per card.

export const THEMES = {
  bloom: {
    id: 'bloom',
    label: 'Bloom',
    tagline: 'Warm aubergine night, lilac presence.',
    description:
      "The default. A garden at dusk: warm aubergine canvas, iridescent rim light, Instrument Serif italic headlines, Geist body, lilac accent. Reads as quiet, literary, calm. Pairs with users who want a contemporary, dreamlike OS — not a server rack.",
    mood: ['quiet', 'literary', 'calm', 'dreamlike'],
    palettePreview: ['#07060B', '#221F2D', '#C4A8F0', '#F5F1FF'],
    tokensHref: '/themes/bloom/tokens.css',
    extrasHref: null,
    fonts: {
      display: 'Instrument Serif',
      system: 'Geist',
      mono: 'Geist Mono',
    },
    llmContext: `Theme: Bloom — warm aubergine night.
Aesthetic: contemporary editorial-tech. Italic Instrument Serif display headlines, Geist sans-serif body, Geist Mono telemetry labels.
Surfaces: warm-shifted near-black (#07060B canvas, #221F2D elevated). Hairlines are iridescent rgba(220,210,255,0.16). Lilac accent rgba(196,168,240).
Widgets should be transparent over the OS atmosphere or rgba(34,31,45,0.55) for elevated panels. Type-led hierarchy. Generous padding (14–20px). Hairline dividers. Soft halos around the active value.
NEVER: hard 90° corners, candy-flat colors, decorative emoji as visuals, gradients on text or buttons.`,
  },

  'cartoon-brutalist': {
    id: 'cartoon-brutalist',
    label: 'Cartoon Brutalist',
    tagline: 'Cream sheet, hard ink strokes, sticker energy.',
    description:
      'Loud and fun. Cream paper, 3px black ink strokes, hard offset shadows (no blur), saturated pop palette — pink/yellow/sky/mint over warm cream. Reads as confident, playful, like a screen-printed poster. Sticker energy.',
    mood: ['loud', 'playful', 'confident', 'sticker'],
    palettePreview: ['#FFF4DC', '#0A0A0A', '#FF4FA3', '#FFD93D'],
    tokensHref: '/themes/cartoon-brutalist/tokens.css',
    extrasHref: '/themes/cartoon-brutalist/extras.css',
    fonts: {
      display: 'Archivo Black',
      system: 'Bricolage Grotesque',
      mono: 'Space Mono',
    },
    llmContext: `Theme: Cartoon Brutalist — cream paper + hard ink strokes + sticker energy.
Aesthetic: loud, playful, screen-printed poster. Use Archivo Black ALL-CAPS display, Bricolage Grotesque body, Space Mono micro-labels.
Surfaces: cream #FFF4DC canvas, paper #FFFAF0 elevated. EVERY card and button has a 3px solid #0A0A0A border AND a hard offset shadow (e.g. 6px 6px 0 0 #0A0A0A) — never blur.
Accent palette: pink #FF4FA3, yellow #FFD93D, sky #6BCEFF, mint #5FE3A1. Pick ONE accent per widget. Saturated, not pastel.
Stickers (rotated chips with offset shadow) are encouraged for tags / status. Slight wonk (rotate(-2deg) on a sticker) is part of the language.
NEVER: glassmorphism, gradients, soft halos, italic serifs. Border radius is small (12-20px), strokes are heavy.`,
  },

  'warm-earthy': {
    id: 'warm-earthy',
    label: 'Warm & Earthy',
    tagline: 'Linen, terracotta, ferns through the window.',
    description:
      'Cozy, journal-like. Linen and parchment surfaces, terracotta + sage accents, hand-drawn warmth. Pairs with users who want a slow, lived-in OS — Studio Ghibli, ferns through the window, hopeful future.',
    mood: ['cozy', 'journal', 'lived-in', 'soft'],
    palettePreview: ['#EDE2CD', '#C8553D', '#7A8450', '#2A1F14'],
    tokensHref: '/themes/warm-earthy/tokens.css',
    extrasHref: '/themes/warm-earthy/extras.css',
    fonts: {
      display: 'Newsreader',
      system: 'Plus Jakarta Sans',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Warm & Earthy — linen + terracotta + moss.
Aesthetic: cozy, journal, Studio Ghibli sunlight. Fraunces serif (with optical-size flair) display, IBM Plex Sans body, IBM Plex Mono labels.
Surfaces: parchment cream canvas, linen elevated cards. Hairlines are warm brown rgba(58,40,30,0.18). Accent is terracotta #C66B4A and moss #3F5D3A.
Widgets should feel printed: paper grain, hand-drawn dividers, warm shadows (no harsh black). Type breathes (line-height 1.5+).
NEVER: cool greys, neon, glass, anything that reads digital-cold. The interface speaks like a gardener.`,
  },

  'neo-brutalist': {
    id: 'neo-brutalist',
    label: 'Neo Brutalist',
    tagline: 'Paper white, ink black, one hot accent.',
    description:
      'Serious, technical, "proper software." Paper white, ink black, single hot red accent. Helvetica/Inter Display + JetBrains Mono. Hairlines, hard 90° corners, monospace metadata, ASCII dividers. Power user energy.',
    mood: ['serious', 'technical', 'structural', 'power-user'],
    palettePreview: ['#F4F2ED', '#0A0A0A', '#FF3B00', '#D6FF3B'],
    tokensHref: '/themes/neo-brutalist/tokens.css',
    extrasHref: '/themes/neo-brutalist/extras.css',
    fonts: {
      display: 'Inter Tight',
      system: 'Inter Tight',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Neo Brutalist — paper white + ink black + single hot accent.
Aesthetic: raw web, file system, structural honesty. Inter Display 700 ALL-CAPS for titles, Inter for body, JetBrains Mono for metadata.
Surfaces: paper #FAFAFA canvas, pure white #FFF elevated. Hairline 1px solid #0A0A0A. Hot accent #FF3B00 used SPARINGLY on active state, error, key call-to-action.
Hard 90° corners (border-radius: 0). Monospace timestamps and metadata. ASCII dividers ("/// ─── ////") and structural labels ([01], ↳, &) read as native.
NEVER: gradients, glow, italic serifs, soft shadows, candy colors. The interface is a file manager pretending to be a UI.`,
  },

  'y2k-frutiger': {
    id: 'y2k-frutiger',
    label: 'Y2K Frutiger Aero',
    tagline: 'Translucent gel, blue glass, water droplets.',
    description:
      "2003 corporate optimism. Electric blue, silver, gel buttons with specular highlights, soft drop shadows, pixel-precise icon glyphs. Pairs with users nostalgic for Sony VAIOs, the original Aero theme, mid-2000s magic.",
    mood: ['nostalgic', 'optimistic', 'glassy', 'corporate-2003'],
    palettePreview: ['#3BA8FF', '#0066FF', '#A8E063', '#E6EEF6'],
    tokensHref: '/themes/y2k-frutiger/tokens.css',
    extrasHref: '/themes/y2k-frutiger/extras.css',
    fonts: {
      display: 'Sora',
      system: 'Inter',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Y2K Frutiger Aero — translucent gel + blue glass + water droplets.
Aesthetic: 2003 Windows Vista / Sony VAIO. Inter Display in restrained weights with letter-spacing. Avoid mono for body; use Inter throughout.
Surfaces: cool gradient backdrops (sky → cyan), gel buttons with specular linear-gradient highlights and a soft drop shadow. Active states bloom with cyan halo.
Accent palette: electric blue #0066FF, lime #A8E063 only as celebratory accent.
Pixel-precise rounded rectangles (radius 8–12). Inset specular highlight on top edge of every button. Soft outer shadow.
NEVER: hard offset shadows, ink-stroke borders, retro CRT effects.`,
  },

  'liquid-glass': {
    id: 'liquid-glass',
    label: 'Liquid Glass',
    tagline: 'Apple Vision-era frosted refraction.',
    description:
      "Apple WWDC25 / Vision Pro. Near-white surfaces over dynamic chromatic backgrounds; specular tints from the wallpaper bleed through frosted glass. Cards float and tilt with cursor. Apple-fluent users.",
    mood: ['apple-fluent', 'weightless', 'depth', 'frosted'],
    palettePreview: ['#06090F', '#A78BFA', '#22D3EE', '#E76F00'],
    tokensHref: '/themes/liquid-glass/tokens.css',
    extrasHref: '/themes/liquid-glass/extras.css',
    fonts: {
      // SF Pro is Apple-only; Inter Tight is the loaded fallback elsewhere.
      display: 'Inter Tight',
      system: 'Inter Tight',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Liquid Glass — Apple Vision frosted refraction.
Aesthetic: Apple WWDC25, weightless depth, photo-realistic frosted glass. SF Pro Display restrained weights; mono only for telemetry.
Surfaces: thick frosted glass cards (backdrop-filter: blur(40px) saturate(180%); background: rgba(255,255,255,0.10)) over a richly saturated wallpaper (use a vivid radial gradient if no photo).
Edge-light specular hairlines on the top of every card (linear-gradient white→transparent). Generous corner radii (24px+). Tilt-on-hover with subtle parallax.
Accent: violet→cyan hue inherited from the wallpaper.
NEVER: flat solid surfaces, hard shadows, monochrome backgrounds (the glass needs color to refract).`,
  },

  'pixel-crt': {
    id: 'pixel-crt',
    label: 'Pixel CRT',
    tagline: 'Phosphor green, scanlines, BBS comfort.',
    description:
      "1995 BBS, Severance terminal, comfort of phosphor. Phosphor green on near-black, IBM Plex Mono everywhere, scanlines, ASCII frames, blink cursor. Pairs with terminal lovers, Tmux users.",
    mood: ['retro-terminal', 'phosphor', 'BBS', 'dev'],
    palettePreview: ['#0B0F0A', '#33FF66', '#FFB000', '#FF3B8B'],
    tokensHref: '/themes/pixel-crt/tokens.css',
    extrasHref: '/themes/pixel-crt/extras.css',
    fonts: {
      display: 'VT323',
      system: 'IBM Plex Mono',
      mono: 'IBM Plex Mono',
    },
    llmContext: `Theme: Pixel CRT — phosphor terminal.
Aesthetic: 1995 BBS, Severance, MS-DOS comfort. EVERYTHING is monospace (IBM Plex Mono / VT323 / Departure Mono). No proportional fonts.
Surfaces: near-black #0B0B0B base. Phosphor green #33FF66 primary text. Amber #FFB000 highlight. Magenta #FF3366 error.
Decorative scanlines (repeating-linear-gradient) at low opacity over surfaces. Blink animation on the active cursor. ASCII frames around content (┌─┐│└─┘). NO antialiasing for display sizes (image-rendering: pixelated).
Border-radius: 0. Always. Buttons are square, hover inverts foreground/background.
NEVER: gradients, glass, italics, modern UI rounded corners.`,
  },

  risograph: {
    id: 'risograph',
    label: 'Risograph',
    tagline: 'Two-ink poster, halftone, off-register charm.',
    description:
      "Zine, gallery poster, slightly off-register. Two or three spot inks — fluoro pink, federal blue, sun yellow — printed on warm cream. Halftone fills, intentional misregistration. Designers and zine makers.",
    mood: ['print-shop', 'halftone', 'editorial', 'designer'],
    palettePreview: ['#F4ECD8', '#FF48B0', '#3145C2', '#FFE15B'],
    tokensHref: '/themes/risograph/tokens.css',
    extrasHref: '/themes/risograph/extras.css',
    fonts: {
      // Space Grotesk substitutes for ABC Diatype on Google Fonts.
      display: 'Fraunces',
      system: 'Space Grotesk',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Risograph — two-ink print shop.
Aesthetic: Risograph zine, gallery poster, intentional off-register charm. Fraunces italic display (or Bagoss) + ABC Diatype-grotesque body.
Surfaces: warm cream #F4ECD8 paper. Two-ink palette: fluoro pink #FF48B0 + federal blue #3145C2. Sun yellow #FFE15B as third spot. NEVER pure black — use a deep ink (#1B2A6B).
Halftone fills (radial-gradient dotted) on shapes. Slight 1–2px misregistration on overlapping elements (translate one layer by 2px in a contrasting hue). Paper grain subtle background noise.
Captions are italic. Eyebrow labels are mono.
NEVER: glass, neon, hard offset shadows, anything that reads digital-clean. The OS is a printed object.`,
  },

  solarpunk: {
    id: 'solarpunk',
    label: 'Solarpunk',
    tagline: 'Sun-warmed cream, moss and terracotta, living tech.',
    description:
      "Optimistic ecological future. Sun-bleached cream canvas, deep leaf-green ink, moss and terracotta accents, dashed botanical rings, pill-soft surfaces. Technology that reads grown rather than manufactured — a greenhouse OS with daylight in it.",
    mood: ['hopeful', 'botanical', 'sunlit', 'crafted'],
    palettePreview: ['#FAF1DB', '#3F5D3A', '#C66B4A', '#F2D58A'],
    tokensHref: '/themes/solarpunk/tokens.css',
    extrasHref: '/themes/solarpunk/extras.css',
    fonts: {
      display: 'DM Serif Display',
      system: 'Geist',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Solarpunk — sun-warmed ecological future.
Aesthetic: greenhouse optimism, crafted-organic tech. DM Serif Display italic for display, Geist body, JetBrains Mono labels.
Surfaces: sun-bleached cream #FAF1DB panels on a warm cream canvas. Ink is deep leaf-green #1F2A1A — never black or grey. Hairlines rgba(31,42,26,0.2).
Accents: moss #3F5D3A is the primary action color (filled buttons, active states, cream text on moss). Terracotta #C66B4A is the highlight — emphasis words, live readings, warm markers. Sun gradient #F2D58A → #C66B4A → #8B3F22 for solar/energy motifs only.
Shapes: pill inputs (border-radius 999px), generously rounded cards, soft warm shadows (0 18px 40px rgba(31,42,26,0.14) — never hard offsets). Dashed 1px leaf-green rings and borders as botanical detailing on icons and status marks.
Type breathes: italic serif headlines, line-height 1.5+ body, mono only for small-caps eyebrow labels.
NEVER: neon, glassmorphism, pure black or cold grey, hard offset shadows, dense terminal density. The interface photosynthesizes.`,
  },

  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    tagline: 'Neon-noir panels, cyan wireframe, magenta signal.',
    description:
      "Night-city terminal. Deep violet-black panels wireframed in glowing cyan, corners notched like console bezels, magenta for the hot signal, acid lime for confirmations. Dense mono telemetry, uppercase headers, everything slightly humming.",
    mood: ['neon-noir', 'terminal', 'dense', 'electric'],
    palettePreview: ['#0A0612', '#00E5FF', '#FF2D9C', '#A8FF3E'],
    tokensHref: '/themes/cyberpunk/tokens.css',
    extrasHref: '/themes/cyberpunk/extras.css',
    fonts: {
      display: 'Chakra Petch',
      system: 'Space Grotesk',
      mono: 'JetBrains Mono',
    },
    llmContext: `Theme: Cyberpunk — neon-noir night-city terminal.
Aesthetic: console bezels, wireframe HUD, hot signal glow. Chakra Petch 700 UPPERCASE display with a cyan text-shadow glow, Space Grotesk body, JetBrains Mono telemetry.
Surfaces: violet-black #13091F panels on a #0A0612 canvas. Every panel has a 1px solid #00E5FF border, border-radius 0, and notched corners via clip-path (polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)).
Glow: box-shadow: inset 0 0 18px rgba(0,229,255,0.08), 0 0 32px rgba(0,229,255,0.3) on elevated panels. Key text glows (text-shadow: 0 0 6px rgba(0,229,255,0.45)).
Accents: cyan #00E5FF is structure + primary action (filled buttons use #0A0612 text). Magenta #FF2D9C is the hot channel — active, alerts, emphasis. Lime #A8FF3E is success/confirm ONLY. Body text #EDE5FF.
Mono telemetry everywhere: uppercase mono micro-labels, coordinates, timestamps, [OK]/[ERR] status brackets.
NEVER: rounded corners, soft grey shadows, pastels, serifs, lowercase display type, warm paper tones. The interface is a rig, not a page.`,
  },

  memphis: {
    id: 'memphis',
    label: 'Memphis',
    tagline: 'Squiggles, clashing brights, hard ink outlines.',
    description:
      "1981 Milan. Bold geometric shapes — circles, zigzags, triangles — in clashing brights over warm paper, everything outlined in deep navy ink with asymmetric corners. Sottsass shelving, terrazzo, MTV idents. Confident, funny, deliberately too much.",
    mood: ['playful', 'geometric', 'clashing', 'postmodern'],
    palettePreview: ['#FFFAF0', '#1A1A2E', '#FF4FA3', '#3DB7FF'],
    tokensHref: '/themes/memphis/tokens.css',
    extrasHref: '/themes/memphis/extras.css',
    fonts: {
      display: 'Fraunces',
      system: 'Space Grotesk',
      mono: 'DM Mono',
    },
    llmContext: `Theme: Memphis — 1980s Memphis Group postmodern pop.
Aesthetic: Sottsass, Milan 1981, terrazzo and squiggles. Fraunces italic 900 display, Space Grotesk 700 body, DM Mono micro-labels.
Surfaces: warm paper #FFFAF0 cards on a cream #FAF1DC canvas. EVERY card and button carries a 2.5px solid #1A1A2E navy-ink border (never pure black) and ASYMMETRIC corners — border-radius 24px 4px 24px 4px (opposite corners round vs sharp). Box shadows are none or flat — never blurred.
Accents: pink #FF4FA3, yellow #FFE15B, sky #3DB7FF, mint #5FE3A1. Use them as flat blocks — a yellow input bar, a sky footer band, a mint status chip — and let two accents clash per surface, ink holding them together.
Decoration is structural: zigzag or squiggle dividers, terrazzo dot fields, small triangle confetti, one rotated shape per composition (rotate(-8deg) on a badge or triangle).
Emphasis words are Fraunces italic 900 in pink. Micro-labels are DM Mono uppercase.
NEVER: gradients, glass or blur, neutral grey, symmetric all-round radii on featured cards, pure black, soft shadows. If it looks tasteful and quiet, push it further.`,
  },
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'bloom';

export function getTheme(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}

/**
 * Apply a theme by injecting its tokens.css (and optional extras.css) into
 * <head> and removing any previously-applied theme link tags. Idempotent —
 * calling with the same id twice is a no-op.
 */
export function applyBaseTheme(id, doc = document) {
  const theme = getTheme(id);
  // Remove any prior theme stylesheets — we identify them via the data-attribute.
  for (const node of doc.querySelectorAll('link[data-theme]')) {
    node.remove();
  }

  const tokens = doc.createElement('link');
  tokens.rel = 'stylesheet';
  tokens.href = theme.tokensHref;
  tokens.dataset.theme = theme.id;
  tokens.dataset.role = 'tokens';
  doc.head.appendChild(tokens);

  if (theme.extrasHref) {
    const extras = doc.createElement('link');
    extras.rel = 'stylesheet';
    extras.href = theme.extrasHref;
    extras.dataset.theme = theme.id;
    extras.dataset.role = 'extras';
    doc.head.appendChild(extras);
  }

  // The LLM can write to /themes/<id>/user-extras.css and the shell will pick
  // it up. We always reference it; if it 404s the browser ignores it silently.
  const userExtras = doc.createElement('link');
  userExtras.rel = 'stylesheet';
  userExtras.href = `/themes/${theme.id}/user-extras.css`;
  userExtras.dataset.theme = theme.id;
  userExtras.dataset.role = 'user-extras';
  // Suppress the noisy 404 by setting a fallback; browsers will still console-warn.
  userExtras.onerror = () => userExtras.remove();
  doc.head.appendChild(userExtras);

  doc.documentElement.dataset.theme = theme.id;
}

/** Public projection used by the onboarding picker — strips llmContext. */
export function publicThemeList() {
  return THEME_IDS.map((id) => {
    const t = THEMES[id];
    return {
      id: t.id,
      label: t.label,
      tagline: t.tagline,
      description: t.description,
      mood: t.mood,
      palettePreview: t.palettePreview,
      fonts: t.fonts,
    };
  });
}
