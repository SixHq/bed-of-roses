# Bloom — Theme Handbook

> The original Bed of Roses. Aubergine night, Instrument Serif italic, lilac presence aura.
> A house made of roses and long light.

This is a handbook. Read it once, then build with it next to you.

---

## 1. Mood & philosophy

Bloom is the night-time, literary, romantic register of Bed of Roses. It is **dark, warm, weightless**. The void is not black — it is aubergine. The hairlines are not white — they have a faint violet cast. The avatar is not a function call — she is a small glowing presence in the corner of the room.

**Build for:** users who want their computer to feel like a quiet evening; people who hold their phones two-handed; readers, writers, planners; the person who picks "lilac" without overthinking.

**Tonal anchors (use these as gut-checks):**
- A candle on a wood table
- A glass-bottomed boat
- The first paragraph of a novel
- A weeknight, after dinner

If your design feels like an office product or a gaming HUD, you've drifted. Pull back toward *quiet*.

---

## 2. Tokens (read these from CSS variables — never hardcode)

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--canvas` | `#07060B` | Page background — the void with a violet hint |
| `--surface-1` | `#15131D` | Cards, inputs, chat-bar pill |
| `--surface-2` | `#221F2D` | Hover, selected, modal frame |
| `--surface-3` | `#322D40` | Pressed, depth-3 controls |
| `--bloom` | `#2A1F38` | Atmospheric tint band (radial washes) |

### Hairlines
Translucent off-white with violet tilt — never neutral white.
| Var | Value | Use |
|---|---|---|
| `--hairline` | `rgba(220, 210, 255, 0.10)` | Default border |
| `--hairline-strong` | `rgba(220, 210, 255, 0.18)` | Selected/focused border |
| `--hairline-soft` | `rgba(220, 210, 255, 0.06)` | Internal divider inside a card |

### Labels (text)
| Var | Value | Use |
|---|---|---|
| `--label` | `#F5F1FF` | Primary text — off-white with warm hint |
| `--label-2` | `rgba(238,232,250,0.62)` | Body text, secondary |
| `--label-3` | `rgba(238,232,250,0.34)` | Captions, hints |
| `--label-4` | `rgba(238,232,250,0.20)` | Disabled, decorative |

### Presence color
The user picks one of eight; default is **lilac** `#C4A8F0`. Read it as `--avatar-color-rgb: 196, 168, 240` so you can drop it into `rgba()`.

**Use the presence color for, and *only* for:**
- Halos on primary buttons
- The avatar ring
- HUD tick dots
- Mono-label tint
- Working-state pulses
- Selection states on cards

Never use the presence color as a flat fill.

### Type
- **Display** — `Instrument Serif`, weight 400, italic-capable
- **UI** — `Geist`, weights 300/400/500/600
- **Mono** — `Geist Mono`, weights 400/500

| Class | Size / Line | Letter-spacing | Use |
|---|---|---|---|
| `.t-hero` | 56 / 60 | -0.030em | Hero on home / welcome |
| `.t-display` | 44 / 48 | -0.025em | Page titles |
| `.t-title-1` | 28 / 32 | -0.018em | Section titles |
| `.t-title-2` | 22 / 28 | -0.012em | Card titles |
| `.t-headline` | 17 / 22 | -0.008em | Subheads, dialog titles |
| `.t-body` | 15 / 22 | -0.004em | Body copy |
| `.t-subhead` | 13 / 18 | -0.004em | Tertiary copy |
| `.t-caption` | 11 / 14 | 0.06em UPPER | Tags, mono labels |
| `.t-mono-label` | 10 / 14 | 0.16em UPPER | Field labels, HUD |

**Rules:** Display sizes use Instrument Serif (often italic). UI body sets in Geist. Mono labels are uppercase with wide tracking. Never put display serif at body size.

### Spacing — 4px base
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72 / 96
Vars: `--s-1` through `--s-11`. Never invent 18, 28, 30.

### Radii
| Var | Value | Use |
|---|---|---|
| `--r-input` | 12 | Inputs |
| `--r-button` | 14 | Buttons |
| `--r-bar` | 16 | Chat bar pill |
| `--r-tile` | 22 | Widget tiles |
| `--r-modal` | 28 | App modals |

### Shadows / glow
- **No drop shadows on cards.** Hierarchy comes from surface tint + hairline.
- **Glow on primary button and avatar only.** Four-stop "presence aura":
```css
box-shadow:
  0 0 0 1px rgba(var(--avatar-color-rgb), .35),
  0 0 24px rgba(var(--avatar-color-rgb), .18),
  0 0 60px rgba(var(--avatar-color-rgb), .10),
  0 12px 32px rgba(0,0,0,.45);
```
- Primary button's halo *breathes* on a 4.5s loop.

### Motion
| Var | Value | When |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.32, 0.72, 0, 1)` | Pane swaps, layout shifts |
| `--ease-snap` | `cubic-bezier(0.20, 0, 0, 1)` | Hover, focus, fill |
| `--d-micro` | 200ms | Micro-interactions |
| `--d-pane` | 360ms | Pane swap |
| `--d-layout` | 600ms | Avatar reposition, wallpaper crossfade |

Never use bouncy/spring easing. Bloom *settles*, it does not bounce.

---

## 3. Layout & screen orientation

### Z-stack (memorize)
| z | Layer |
|---|---|
| -1 | Wallpaper (user-set CSS color or gradient) |
| 0 | Ambient canvas (drifting motes + slow sun) |
| 1 | Screens |
| 5 | Home chrome (wordmark, settings cog) |
| 6 | Chat bar, chat log, avatar |
| 7 | HUD (corner telemetry) |
| 100 | Modal |

### Home grid
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: var(--s-4);
  padding: 88px var(--s-6) 132px;
}
```
- Outer pad: 24px sides, 88px top (clears home chrome), 132px bottom (clears chat bar)
- Gap between tiles: 16px
- Tile rows: 240px (fixed)

### Tile spans
| `data-size` | Cols × Rows | When |
|---|---|---|
| `1x1` | 1 × 1 | Default — atomic data point |
| `2x1` | 2 × 1 | Two-endpoint widgets, prose |
| `1x2` | 1 × 2 | Vertical lists, tall charts |
| `2x2` | 2 × 2 | Quad — chart + list |
| `2x3` | 2 × 3 | Feeds |

On screens ≤ 600px, all multi-column tiles collapse to single column.

### App modal
```css
.modal-frame {
  width: min(960px, 100%);
  height: min(720px, 88vh);
  border-radius: var(--r-modal);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
```
Backdrop: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(24px)`. Modal opens with 360ms ease-standard from `translateY(16px) scale(0.98)`.

### Mobile breakpoint
`@media (max-width: 600px)` — home grid → 150px columns, padding tightens to 16px, avatar moves to top center (from corner).

### Safe areas
Honor `env(safe-area-inset-*)` on the home chrome and chat bar. The OS will eventually be a PWA / Linux ISO; design as if it will run on a phone too.

---

## 4. Component handbook

### Button — primary
```html
<button class="btn btn-primary" type="button">Begin</button>
```
```css
.btn {
  height: 50px;
  padding: 0 var(--s-6);
  border-radius: var(--r-button);
  font-size: var(--t-headline);
  font-weight: 600;
  letter-spacing: -0.010em;
}
.btn-primary {
  background: var(--label);
  color: var(--canvas);
  box-shadow: /* the four-stop aura, see Tokens */;
  animation: btn-portal-breathe 4.5s var(--ease-standard) infinite;
}
```
**Edge cases:** disabled → opacity .4, halo off; press → `scale(0.98)` 120ms; hover → background `rgba(255,255,255,.95)` + halo strengthens.

### Button — secondary
Transparent, hairline-strong border, `var(--label)` text. Hover lifts surface 1 step (transparent → `var(--surface-1)`).

### Field
```html
<div class="field">
  <label class="field-label">Name</label>
  <input class="field-input" type="text" placeholder="Atlas" />
</div>
```
Field label is a `.t-mono-label` with a `/ ` prefix added via `::before`. Input is 50px tall, `var(--surface-1)` background, 12px radius. Focus: hairline strengthens + 3px soft halo.

### Chip
30px tall, pill-radius (999), `var(--surface-1)` background, hairline border, body weight 500. Selected: tinted with the presence color at 10% opacity, border at 55% opacity, text → `var(--label)`.

### Tile
```html
<article class="tile" data-size="2x2">
  <iframe class="tile-iframe" src="/widgets/.../widget.html" sandbox="allow-scripts"></iframe>
  <div class="tile-overlay">
    <span class="tile-name">Flight Tracker</span>
    <button class="tile-delete">×</button>
  </div>
</article>
```
- Background `var(--surface-1)`, hairline border, 22px radius
- Hover: surface → `--surface-2`, hairline → `--hairline-strong`
- Tile-in animation: 520ms ease-standard from `translateY(10px) scale(.985)`

### Chat bubble
- User: `var(--label)` white pill, ink text, bottom-right corner squared (6px)
- AI: `var(--surface-2)` with hairline, white text, bottom-left squared (6px)
- System: centered, smaller, `--surface-1` with hairline, label-2 text

### Chat bar (frosted pill)
```css
.chat-bar {
  background: rgba(28, 28, 30, 0.72);
  border: 1px solid var(--hairline);
  border-radius: var(--r-bar);
  backdrop-filter: blur(40px) saturate(1.6);
  padding: 8px 8px 8px var(--s-5);
}
```
Send button: 36px circle, ink fill, white arrow icon, scales to 0.94 on press.

### Modal
See Layout section. Header is 48px tall with title left, actions right (delete, close). Body is iframe at 100% × 100%, transparent background.

---

## 5. App handbook — building a placeholder Notes app

Goal: a Notes app that lists notes, lets you open one, edit it, save. Single-purpose, in keeping with the OS's "no menus" philosophy.

### Frame
```html
<div class="modal-frame">
  <header class="modal-header">
    <span class="modal-title">Notes</span>
    <div class="modal-actions">
      <button class="icon-button" data-act="new" title="New note">+</button>
      <button class="icon-button" data-act="close" title="Close">×</button>
    </div>
  </header>
  <main class="app-body"><!-- two columns: list + editor --></main>
</div>
```

### Layout inside
- **Two-column split:** 240px list on the left, editor on the right.
- List background: `var(--surface-2)`. Editor: `var(--surface-1)`.
- Hairline vertical divider between (`--hairline-soft`).
- Outer padding inside columns: 20px / 24px.

### List item
```html
<button class="note-item" data-id="042">
  <span class="note-title">A slow Sunday</span>
  <span class="note-meta">2 min · 14:32</span>
</button>
```
- Title: Geist 500 / 15px
- Meta: mono 11 / 14 / .14em uppercase / label-3
- 56px tall, 12px internal radius, hover surface → `--surface-3`
- Selected: 1.5px inset hairline-strong + presence-tinted background `rgba(var(--avatar-color-rgb), .08)`

### Editor
```html
<header class="editor-head">
  <h1 contenteditable class="t-display">A slow Sunday</h1>
</header>
<div contenteditable class="editor-body t-body">
  Coffee by the window, then to the market for tomatoes &amp; bread…
</div>
```
- Title: Instrument Serif italic, 44px, fully editable, no border, no background
- Body: Geist 15/22, max-width 56ch (so lines stay readable)
- Cursor uses the presence color
- Save: auto, every 600ms after last keystroke. No save button.

### Empty
List shows the mono caption "When you're ready." centered, label-3. No CTA, no illustration.

### Working
Title gets a tiny `breathing-dot` to the right while regenerating. Body fades to 60% opacity. Never block input — let the user keep typing.

---

## 6. Widget handbook — building a Weather widget

### Markup
```html
<article class="widget" data-size="1x1" data-state="live">
  <span class="widget-meta">weather · lagos</span>
  <div class="widget-body">
    <span class="hero-num">18°</span>
    <span class="hero-sub">partly cloudy</span>
  </div>
</article>
```

### Sizing & padding
- Tile is 240×240 at `1x1`
- Internal padding 16px all sides
- Meta sits flush top-left, hero-num bottom-left aligned

### Type
- **hero-num:** Instrument Serif italic, 50px, line-height 1
- **hero-sub:** Geist 400 / 15px / label-2
- **meta:** Geist Mono 11 / .14em / lowercase / label-3

### Color
- Tile background `var(--surface-1)`, hairline border, 22px radius
- Add a faint radial wash bottom-left tinted by weather state (cool blue for rain, soft pink for sunrise, etc.) — never above 18% opacity

### States
- **Empty:** "Set a place." in mono-label color, no number shown
- **Live:** as above
- **Working:** the hero-num breathes at 2.4s (opacity .55 → 1.0), meta replaced with "fetching · lagos"

### Don'ts
- Don't add a weather icon SVG — the prose says enough
- Don't show humidity, pressure, wind unless `2x1` or larger
- Don't use color to encode temperature — let the number stand

### Variant: 2x1
Adds a five-day strip below the hero number. Each day = single-letter weekday (M T W T F), small number underneath, both in Geist 500.

### Variant: 2x2
Adds the strip *plus* a low-saturation line chart of hourly temps. Chart stroke is presence-color at 60%, fill is the same at 8% gradient.

---

## 7. Icons & marks

### App icon construction — 64 × 64

Every Bloom app icon uses the same three-layer recipe:

1. **Plate** — 60×60 rounded square (radius 14), background `var(--surface-1)`, faint radial highlight top-left at 8% white
2. **Silhouette** — the genre glyph in `var(--label)`, 2px stroke, round caps, round joins, geometric
3. **Accent dot** — one 4px lilac dot in a meaningful position (top-right of book, center of play triangle, etc.) — the "Bloom signature"

```html
<svg viewBox="0 0 64 64" class="app-icon" aria-hidden="true">
  <rect x="2" y="2" width="60" height="60" rx="14"
        fill="var(--surface-1)"
        stroke="var(--hairline)" stroke-width="1"/>
  <!-- top-left highlight -->
  <ellipse cx="22" cy="18" rx="18" ry="8"
           fill="rgba(255,255,255,.06)"/>
  <!-- silhouette (Notes example) -->
  <path d="M18 18 H42 L46 22 V46 H18 Z M38 18 V24 H44"
        fill="none" stroke="var(--label)" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
  <!-- accent dot -->
  <circle cx="46" cy="18" r="2.4" fill="rgba(196,168,240,.95)"/>
</svg>
```

### Sizes
- 64 — home grid app drawer
- 32 — inline in chat ("opens in <icon> Notes")
- 16 — corner tags in widgets

### Widget thumbnails
- 480 × 480 export, generated at first paint with no live data
- Same as live widget but the hero number replaced with em-dash `—`
- Background tinted with the widget's accent color at 6%

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Second person, calm.** *"Pinned a flight tracker to today."*
- **Italic noun phrases for warmth.** *"a small sun in the corner."* (Use sparingly — once per surface, max.)
- **Full-stopped fragments.** *"Welcome."* *"Begin."* *"Ready when you are."*
- **No exclamation points. Ever.**
- **No emoji in OS chrome.** A pasted user emoji in a note is fine.

### Common mistakes
- ❌ Hardcoding `#07060B` instead of `var(--canvas)` — your widget will break on theme switch
- ❌ Adding a drop shadow to a tile — Bloom does not drop-shadow cards
- ❌ Using Instrument Serif at body size — it's a display face
- ❌ Bouncy easing — Bloom settles, doesn't spring
- ❌ Solid white borders — every line is translucent with a violet hint
- ❌ Replacing the presence color with another brand color — the user picked theirs

### Ship checklist
- [ ] Every color read from a CSS var
- [ ] Every font read from a CSS var
- [ ] Tile radius matches `--r-tile`
- [ ] Empty / live / working states all designed
- [ ] Working state uses the breathing presence orb idiom (not a spinner)
- [ ] Headlines use Instrument Serif (italic where warmth helps)
- [ ] Body uses Geist
- [ ] Mono labels are uppercase 10px / .16em
- [ ] No emoji in chrome
- [ ] Animation uses `--ease-standard` or `--ease-snap`
- [ ] No drop shadows on cards (glow only on primary button + avatar)
- [ ] Widget at `1x1` shows one number/word, `2x1+` shows that plus support
- [ ] Thumbnail.png generated, em-dash replacing live numbers

> If you pass the checklist and your widget still feels wrong, ask yourself: *would this fit on a candlelit wood table?* If yes, ship.
