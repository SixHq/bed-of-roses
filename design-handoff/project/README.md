# 🌹 Bed of Roses — Design System

> Your operating system should grow with you, like a garden — not be handed to you fully built like a skyscraper.

This repo is the **design system** for **Bed of Roses**, an open-source AI-native operating system. The OS boots into an empty void with a personalized AI companion (a customizable animated "presence" rendered to a canvas). Users talk; the AI generates the entire UI on the fly. There are no pre-installed apps. No app store. No menus. Over time, the desktop fills with widgets purpose-built for how each individual actually uses their computer.

This system is what designers, the AI inside the OS, and contributors should reach for when they build anything that wears the Bed of Roses name — splash screens, onboarding, widgets, marketing, decks, docs.

**Current phase:** v0.3 "Brainstem" — Phase-1 proof of concept. The visual language is **monochrome iOS-dark + presence tint**, with a diegetic HUD register that signals "you are inside a system."

---

## Sources

This design system was distilled from the following sources. All file paths are relative to the user's local mount.

| Source | Path | Notes |
|---|---|---|
| **Codebase** | `open-source-os/` (read-only) | Vanilla HTML/CSS/JS shell + Node bridge. The shell `style.css` is the canonical source of design tokens (lifted into `colors_and_type.css`). |
| **Display shell** | `open-source-os/shell/` | `index.html`, `style.css`, `app.js`, `memoji.js` (canvas avatar engine), `ambient.js` (drifting motes + sun) |
| **Project document** | `_source/project_document.txt` | Extracted from `Bed_of_Roses_Project_Document.docx`. v0.1 brainstorm — vision, architecture, onboarding, dreaming/memory system, security model, roadmap. |
| **Logo assets** | `assets/logo-mark.svg`, `assets/logo-full-dark.svg`, `assets/logo-full-light.svg` | Geometric four-fold rose, copied directly from `shell/assets/`. |

> If you do not have access to the codebase mount, read `_source/project_document.txt` for the full vision and `colors_and_type.css` for design tokens.

---

## Index

```
.
├── README.md                          ← this file
├── colors_and_type.css                ← design tokens (vars + semantic type)
├── SKILL.md                           ← how to use this as a Claude Code skill
├── assets/                            ← logos, brand marks, glyphs
├── fonts/                             ← (none — we use system fonts; see VISUAL FOUNDATIONS)
├── preview/                           ← Design System tab cards (one HTML per concept)
├── ui_kits/
│   └── bed-of-roses-os/               ← high-fidelity recreation of the shell
│       ├── index.html                 ← clickable demo: splash → onboarding → home
│       ├── README.md
│       └── *.jsx                      ← Memoji, Ambient, HUD, Onboarding, Home, Widget, Modal
└── _source/
    └── project_document.txt           ← extracted vision doc
```

---

## CONTENT FUNDAMENTALS

The voice of Bed of Roses is **calm, second-person, and quietly poetic** — never barking, never breathlessly enthusiastic. It treats the user as a partner who is settling into a new room. The AI is *present*, not performative. Tech is *referenced*, not flaunted.

**Voice rules:**

- **You, not we.** The OS speaks directly to one person. *"Your computer starts empty. Talk to it, and it builds itself around how you work."* Never "we built this for you."
- **The AI says "I" — but only after onboarding.** Once named, the companion uses first-person ("I'm Atlas. Tell me what you need."). Before naming, the system speaks in third-person about the AI ("Name your AI."). Never "your assistant."
- **Sentences are short. Periods are friends.** Two-clause max. Headlines are 1–4 words ending in a period: *"Welcome.", "Name your AI.", "Choose a presence.", "Connect a model.", "Begin."* The terminating period is part of the brand register — it lands.
- **No exclamation points. Ever.** The system is composed.
- **No emoji** in product surfaces. The 🌹 lives only in the README, in casual GitHub markdown, and in the brand mark itself — never inside the OS chrome.
- **Sentence case for everything.** Headlines, button labels, field labels (when written as words) — sentence case. The only ALL-CAPS register is the **mono HUD label** (telemetry, system tags, version strings, presence color names — see VISUAL FOUNDATIONS).
- **Minimum viable copy.** A field label is one word: "Name", "Model", "API key", "Base URL". A button is one verb: "Continue", "Begin", "Connect", "Update", "Remove". A subheadline is one sentence with a concrete promise.
- **Avoid filler verbs and corporate hedges.** Not "Let's get you set up." Not "We'll help you discover." The OS just does the thing.
- **Diegetic flavor in HUD only.** The corner status lines (`BED · OF · ROSES · v0.3 · BRAINSTEM · N7-A1 · INIT · IDENTITY · SYSTEM READY`) speak the language of an instrument panel — wide-tracked, monospace, technical, dot-separated. This register *signals* depth without leaking into product copy.

**Examples lifted from the codebase:**

| Surface | Copy |
|---|---|
| Splash subline (in mark) | `THE AI-NATIVE OPERATING SYSTEM` |
| Welcome headline | `Welcome.` |
| Welcome subheadline | `Your computer starts empty. Talk to it, and it builds itself around how you work.` |
| Welcome CTA | `Get started` |
| Name pane | `Name your AI.` / `You'll see this name everywhere they show up.` |
| Presence pane | `Choose a presence.` / `Pick a personality and a color. Same intelligence — different feeling.` |
| Connect pane | `Connect a model.` / `Choose your provider. You can add more — and switch between them anytime.` |
| Empty home greeting | `I'm Atlas. Tell me what you need.` |
| Chat placeholder | `Ask. Or describe what you need.` |
| Onboarding error | `Connect at least one provider to continue.` |
| HUD pane stages | `INIT · GREETING`, `INIT · IDENTITY`, `INIT · MORPHOGENESIS`, `INIT · COGNITION` |

**Tone signature checklist** when writing new copy: *Is the headline a single full-stopped phrase? Is the subline one concrete sentence? Is there exactly one verb in the button label? Did I resist an exclamation point?* If yes to all four, you're on register.

---

## VISUAL FOUNDATIONS

The system is **monochrome dark with a single chromatic accent** (the user's chosen "presence color"). Hierarchy comes from **typography, spacing, hairlines, and breath** — not color, not gradients, not iconography. The aesthetic vocabulary is **iOS dark mode + visionOS depth + a hint of CRT/instrument-panel diegesis**.

### Backgrounds

- **Three layers, always.** (1) the **canvas** (`#000000`, the void), (2) the **wallpaper** layer (a CSS color or gradient set by the AI's `set_wallpaper` tool — defaults to transparent so the void shows through), (3) the **ambient field** (a full-viewport canvas with ~140 drifting "motes" tinted by the presence color, plus one large soft "sun" radial that traces a ~120-second orbit).
- **No stock imagery. No photography. No hand-drawn illustrations.** The brand has no photographic asset library. Texture comes from the ambient field, the avatar canvas, and the breathing animations — never from raster images.
- **Wallpaper as the only surface for color.** When the AI sets a wallpaper, it tints *the void only* — chrome stays monochrome on top. Avoid full-bleed colored panels in the chrome.

### Color

- **Surfaces:** `#000` canvas → `#1c1c1e` surface-1 → `#2c2c2e` surface-2 → `#3a3a3c` surface-3. Lifted from iOS dark mode.
- **Hairlines, not borders.** All "borders" are 1px translucent whites at 6%/10%/16% alpha (`--hairline-soft`, `--hairline`, `--hairline-strong`). Strong = focus / selected. Soft = internal divider. Never use solid grey borders.
- **Labels as alpha steps.** `#fff` → `rgba(235,235,245, 0.60 / 0.30 / 0.18)` — Apple's label scale. Don't introduce intermediate greys.
- **Presence color is the only chromatic accent.** Eight pre-named hues (Pearl, Amber, Ember, Bloom, Aurora, Frost, Lilac, Onyx) drive halos, glows, the avatar ring, the HUD tick, the mono labels' tinted opacity, and the ambient field. They never appear as fills or backgrounds — only as **light** (rgba ≤ 0.55 in halos, ≤ 0.50 in mono labels).

### Typography

- **System UI stack.** `-apple-system / BlinkMacSystemFont / "SF Pro Display" / "SF Pro Text" / Inter / Helvetica Neue / system-ui`. SF Pro on Apple platforms; Inter as the cross-platform fallback. **No webfont is loaded** — see "Font substitution" below.
- **Mono register.** `"JetBrains Mono" / "SF Mono" / "Berkeley Mono" / ui-monospace / Menlo`. Only used for HUD labels, field labels, and any "telemetry" copy.
- **iOS type scale.** Hero 56 / Display 44 / Title-1 28 / Title-2 22 / Headline 17 / Body 15 / Subhead 13 / Caption 11 / Micro 10. **Never invent intermediate sizes.**
- **Tight tracking.** Display/Hero -0.025em → -0.030em. Body -0.006em. Mono labels +0.18em uppercase.
- **Weights:** 400 (body), 500 (subhead, label, mono), 600 (headlines + buttons). No 300 or 700.
- **Per-character reveal.** Headlines fade in one character at a time on pane entry (32ms stagger, 520ms duration each). Set `font-feature-settings: "ss01", "cv11"` to pick the alt-six and stylistic curl from SF Pro.

### Spacing

- **4-px base.** `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72 / 96`. Use the ladder. Don't insert 18, 28, 30.
- **Generous outer padding.** `--s-7` (32px) is the default outer onboarding pad. `--s-6` (24px) for home chrome.
- **Tight internal stack.** Form fields stack with `--s-2` (8px) between label and input. Card content uses `--s-3` (12px) gaps.

### Radii

- **Five steps.** Input 12 → Button 14 → Bar 16 → Tile 22 → Modal 28. Larger surfaces get larger radii.
- **No square corners.** Even the chat-bar pill is rounded. The only sharp edges are hairline dividers and the wallpaper layer.

### Shadows / glow

- **No drop shadows on cards.** Cards live on the void; depth comes from hairline + surface tint.
- **Glow is reserved for primary action and avatar.** The primary button has a four-stop "presence aura": `0 0 0 1px rgba(presence,.35), 0 0 24px rgba(presence,.18), 0 0 60px rgba(presence,.10), 0 12px 32px rgba(0,0,0,.45)`. It **breathes** at 4.5s — alpha modulates through a sine.
- **Avatar ring + halo.** 1.5px tinted ring at 40% alpha; on hover it strengthens to 75% and gains a soft 4px halo at 5% alpha. The avatar canvas itself draws all the "presence" — there is no CSS animation on the avatar element.
- **Modal sheet.** No outer shadow; the backdrop is `rgba(0,0,0,0.6)` with `backdrop-filter: blur(24px)` instead.

### Transparency / blur

- **The chat bar is the canonical "frosted pill."** `rgba(28,28,30,0.72)` with `backdrop-filter: blur(40px) saturate(1.6)`. This is the only place glass is mandatory; modals also use it.
- **Avoid blur elsewhere.** Tiles, cards, fields, and buttons are **opaque**. Blur is the language of *floating* — pin it to floaters (chat bar, modals).

### Borders

- All borders are **1px hairlines** in translucent white. Never solid grey. Strong (.16) = active / selected. Default (.10) = resting. Soft (.06) = internal divider inside a card.

### Animation

- **Two easings.**
  `--ease-standard: cubic-bezier(0.32, 0.72, 0, 1)` — pane swaps, layout shifts, splash, modal-in. The "Apple curve."
  `--ease-snap: cubic-bezier(0.20, 0, 0, 1)` — micro-interactions (hover, focus, fill, press).
- **Three durations.** Micro 200ms / Pane 360ms / Layout 600ms. **Wallpaper crossfade is 600ms.**
- **Breath is everywhere.** The avatar breathes at the canvas level (engine-driven). The hero rose mark scales 1.000 → 1.025 → 1.000 over 6s. The primary button's halo breathes at 4.5s. The hero dot pulses at 3.4s. The HUD ticks pulse at 2.4s on staggered 600ms delays.
- **Per-character headline reveal** on every pane entry (described under Typography).
- **No bouncy easing. No spring physics. No keyframe overshoot.** Bed of Roses doesn't *bounce* — it *settles*.

### Hover, focus, press

- **Hover** = surface lifts one step (`surface-1` → `surface-2`) AND hairline strengthens (`.10` → `.16`). Never opacity.
- **Focus** = hairline strengthens AND a 3px soft halo appears (`box-shadow: 0 0 0 3px var(--hairline-soft)`).
- **Press** = `transform: scale(0.98)` over 120ms. No color change. No darken. **Never grow on press.**
- **Selected** (selection in pickers) = hairline becomes solid white `var(--label)` AND a 1px outer ring at 18% alpha appears via `inset` shadow trick.

### Layout rules

- **Fixed elements:** wallpaper (z=-1), ambient canvas (z=0), screens (z=1), home chrome (z=5), chat bar / chat log / avatar (z=6), HUD (z=7), modal (z=100). **Memorize this z-order.**
- **Onboarding panes are absolutely-positioned full-viewport.** Each pane is a single-task surface. Center content vertically with `justify-content: safe center` (graceful overflow).
- **Home grid:** `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` with fixed `grid-auto-rows: 240px`. Tiles can span 2x1, 1x2, 2x2, 2x3.
- **Mobile collapse at ≤600px.** All multi-span tiles collapse to 1-column. HUD top-right and bottom-left cells hide. Avatar moves from corner to top.

### 3D / parallax

- **Subtle card tilt on cursor proximity.** `.presence-card` and `.provider-card` rotate ±10° on Y and ±8° on X based on cursor distance from the card's center. `transform-style: preserve-3d`. **One global mousemove → rAF → fan-out** — never per-card listeners.
- **Ambient parallax.** Motes nearer "you" shift more on cursor move; farther ones shift less, suggesting dimensional depth.
- **No tilt on flat elements.** Buttons, fields, tiles do not tilt.

### Imagery vibe

- The brand has **no photography**. If imagery is ever needed (e.g. for a marketing page), the rule is: *cool, near-monochrome, deep blacks, faint chromatic bloom*. Never warm. Never bright. Never people. Grain is OK; saturation is not.

---

## ICONOGRAPHY

Bed of Roses uses a **hand-built family of inline SVG glyphs**, drawn at a **16×16 viewBox**, stroke `currentColor`, **stroke-width 1.4–1.6**, **stroke-linecap round**, **stroke-linejoin round**. They are visually consistent with iOS SF Symbols at the "Light" weight but are not SF Symbols — the codebase doesn't ship a font.

**Rules:**

- **Stroke, not fill.** Ninety percent of icons are pure-stroke. Settings cog, send arrow, close X, delete, chevron — all stroked.
- **Provider marks are the exception.** Anthropic, OpenAI, Gemini, OpenAI-compatible each have their own abstract geometric mark — kept as a *family* (consistent stroke weight + viewBox) so they read together in the provider grid.
- **No icon font is loaded.** No Lucide, no Heroicons, no Phosphor — the codebase ships its own glyphs inline. **For new icons in this design system, prefer pulling from [Lucide](https://lucide.dev) at stroke-width 1.4** as the closest CDN match — visually indistinguishable from the codebase glyphs, and well-maintained. Document any Lucide pull as a substitution.
- **No emoji** in product chrome. The 🌹 rose is allowed only in: (1) GitHub README markdown, (2) the brand wordmark itself (rendered as SVG, not unicode), (3) casual contributor docs. **Never inside the OS.**
- **No unicode characters** as icons in chrome. The "/" prefix on mono labels is content (`::before { content: '/ ' }`), not an icon.
- **Standard glyph sizes:** 12px (inline within text), 14px (buttons, chevrons, send), 16px (most chrome), 28px (provider marks).
- **The rose mark is the brand mark.** Three SVG variants ship: `logo-mark.svg` (mark only, on transparent), `logo-full-dark.svg` (mark + wordmark on black), `logo-full-light.svg` (mark + wordmark on white). The mark is a **four-fold geometric rose** built from concentric petal rings (outer + 45° rotated inner + tighter core) with a centered bud. **Never rasterize.**

**Iconography substitutions in this design system:**

| Need | Source | Notes |
|---|---|---|
| Generic glyphs (search, calendar, etc.) | [Lucide](https://lucide.dev) at stroke-width 1.4 | Closest CDN match to the codebase's hand-rolled glyph family. |
| Provider marks | Inline SVG copied from `shell/app.js` `PROVIDER_MARKS` | Anthropic, OpenAI, Gemini, openai-compatible. |
| Brand mark | `assets/logo-mark.svg` and variants | Geometric four-fold rose. |

---

## Font substitution flag

The codebase **does not load any webfont**. It uses the **system UI stack** — SF Pro on Apple platforms, Inter on the web/Linux fallback. There is no `fonts/` directory in the source.

**For Linux ISO + cross-platform consistency**, the closest free Google Fonts match would be:

- **Display + body:** [Inter](https://fonts.google.com/specimen/Inter) (already in the fallback chain). Cleanest substitute for SF Pro Display / Text. Use 400 / 500 / 600.
- **Mono labels:** [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (already in the fallback chain). 500 weight.

> **🚩 Open question for the team:** the v0.3 shell relies on SF Pro on macOS/iOS and falls back gracefully — but on the planned Linux ISO it'll render in Inter without explicit @font-face. **Should we ship Inter + JetBrains Mono as bundled webfonts in the ISO so the type stays consistent across platforms?** If yes, please drop `Inter*.woff2` and `JetBrainsMono*.woff2` into `fonts/` and we'll wire `@font-face` declarations into `colors_and_type.css`.

---

## How to use this system

1. **Drop in `colors_and_type.css`** — it provides every CSS variable plus semantic type rules (`.t-hero`, `.t-display`, `.t-headline`, `.t-mono-label`, etc.).
2. **Set the presence color.** Once the user picks an avatar color, write `--avatar-color-rgb: r,g,b` on `:root` (the CSS reads it for halos, HUD tints, ambient particles, etc.).
3. **Compose with the layers.** Wallpaper (back) → Ambient canvas → Screens → Chrome → HUD → Modal. Don't introduce new z-order regions.
4. **Reach for the UI kit.** `ui_kits/bed-of-roses-os/` is a click-thru recreation of the shell. Lift its components — `MemojiCanvas`, `AmbientCanvas`, `Hud`, `OnboardingPane`, `ProviderCard`, `WidgetTile`, `ChatBar`.
5. **When in doubt, check the codebase.** `open-source-os/shell/style.css` is canonical.

---

## Caveats & open questions

- **Memoji canvas engine** is not reimplemented in JSX in the UI kit — too engine-heavy for a static recreation. The UI kit substitutes a faithful CSS-only stand-in (radial gradient + breathing dot + tinted ring). If you need the real renderer, lift `shell/memoji.js` directly.
- **Ambient field canvas** likewise uses a lightweight CSS stand-in (drifting dots via keyframes). Real engine in `shell/ambient.js`.
- **No fonts are bundled.** See "Font substitution flag" above.
- **No iconography file is shipped.** Use Lucide at stroke-width 1.4 for additions. The provider marks in `ui_kits/.../ProviderMarks.jsx` are the canonical references.
