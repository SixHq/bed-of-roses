# Pixel CRT — Theme Handbook

> Phosphor green on near-black, scanlines, VT323 display, ASCII chrome.
> A soft little OS for people who like their assistants quiet, monospaced, and slightly green.

---

## 1. Mood & philosophy

Pixel CRT is the **terminal, dot-matrix, post-cyberpunk-but-cozy** register. It looks like a 1990s BBS, an Atari ST, the Severance lumon terminal, or a green-screen IBM. The whole page lives behind a 2px / 3px scanline overlay, with a faint phosphor glow on every glyph.

**Build for:** developers, terminal lovers, the person who runs `htop` for fun, anyone with a copy of "Type Specimens of the Twentieth Century" on their shelf.

**Tonal anchors:** a CRT in a corner of an office, an Atari ST boot screen, the original Pong score display, the lumon terminal.

If your design starts to feel anti-aliased or smooth, you've drifted. Push back toward *pixelated*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--bg` | `#0B0F0A` | Page background — near-black with green tint |
| `--bg-2` | `#070A06` | Deepest (inset) |
| `--bg-3` | `#101810` | Lifted |

### Phosphor + state
| Var | Hex | Use |
|---|---|---|
| `--green` | `#33FF66` | Primary phosphor — text, primary action |
| `--green-dim` | `#1FA63E` | Body text |
| `--green-deep` | `#0F4F1B` | Hairlines, deep accents |
| `--amber` | `#FFB000` | Caution / focus secondary |
| `--magenta` | `#FF3B8B` | Error / alert only |
| `--cyan` | `#00E0FF` | Info — used 1× per screen |

### Hairlines
- `--line`: `rgba(51,255,102,.25)` — phosphor at 25%
- `--line-2`: `rgba(51,255,102,.5)` — strong

### Text shadow (the glow)
Every glyph gets a phosphor glow:
```css
text-shadow: 0 0 6px rgba(51,255,102,.55);
```
Amber elements: `text-shadow: 0 0 6px rgba(255,176,0,.6)`.
Magenta: `text-shadow: 0 0 6px rgba(255,59,139,.6)`.

### Scanlines + flicker (mandatory)
```css
body::before {
  content:'';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 50;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.22) 2px 3px);
}
body::after {
  content:'';
  position: fixed; inset: 0;
  pointer-events: none; z-index: 51;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.5) 100%);
}
```
The first creates scanlines; the second creates the CRT vignette.

### Type
- **Display** — `VT323` (only weight, only size variant)
- **Mono / UI** — `IBM Plex Mono`, weight 400/500/700

| Class | Size / Line | Use |
|---|---|---|
| `.p-h1` | 148 / .85 / .02em (VT323) | Hero |
| `.p-h2` | 60 / .95 / .02em (VT323) | Section title |
| `.p-h3` | 18 / 1 / .06em UPPER (Plex 700) | Sub |
| `.p-display` | 14 / 1.6 (Plex 400) | Body display, slightly dim |
| `.p-body` | 13 / 1.65 (Plex 400) | Body, green-dim |
| `.p-mono` | 11 / .06em (Plex 500) | Metadata |
| `.p-eyebrow` | 11 / .18em UPPER (Plex 700 amber) | Eyebrows |

**Always** anti-aliasing off at headline sizes: `image-rendering: pixelated;` for icons; CSS `-webkit-font-smoothing: none` for VT323.

### Spacing
4 / 8 / 12 / 16 / 24 / 32. Dense by nature. ASCII frames *touch* the content.

### Radii
**Zero everywhere.** Every corner sharp.

### Motion
- Hover: background fills with phosphor green; text inverts to bg color; no transform
- Press: same as hover, just held
- Blinking cursor `█` at 1s step-end interval
- No fade transitions

---

## 3. Layout & screen orientation

### Page
`--bg` everywhere. Scanline + flicker overlays mandatory.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: 220px;
  gap: 0;
  border: 1px solid var(--green);
}
.tile {
  border-right: 1px solid var(--green-deep);
  border-bottom: 1px solid var(--green-deep);
}
```
Tiles share edges, like a terminal panel manager.

### App modal
- 920×680, bg-2 background, 1px green border, **zero radius, zero shadow**
- Phosphor glow: `box-shadow: 0 0 24px rgba(51,255,102,.18), inset 0 0 24px rgba(51,255,102,.05)`
- Backdrop: bg at 80% opacity, no blur

---

## 4. Component handbook

### Button
```html
<button class="p-btn p-btn-pri">▶ RUN</button>
```
```css
.p-btn {
  height: 40px;
  padding: 0 18px;
  font-family: var(--mono);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  border: 1px solid var(--green);
  background: var(--bg-3);
  color: var(--green);
  cursor: pointer;
  box-shadow: 0 0 10px rgba(51,255,102,.3);
  text-shadow: 0 0 6px rgba(51,255,102,.7);
}
.p-btn:hover { background: var(--green); color: var(--bg); text-shadow: none; box-shadow: 0 0 14px rgba(51,255,102,.7); }
.p-btn-pri { background: var(--green); color: var(--bg); text-shadow: none; box-shadow: 0 0 14px rgba(51,255,102,.7); }
.p-btn-amber { border-color: var(--amber); color: var(--amber); }
.p-btn-mag { border-color: var(--magenta); color: var(--magenta); }
```

### Field
```html
<div class="p-field">
  <label>&gt; NAME</label>
  <input class="p-input" placeholder="ENTER HANDLE..." />
</div>
```
- Label: Plex Mono UPPER 11px green
- Input: 40px tall, 1px green border, bg-2 fill, mono 14px, phosphor text glow
- Focus: 2px green outline, inset glow

### Chip
- 24px tall, 1px green border, bg-2 fill, mono UPPER 10px
- Selected: invert (green bg, bg text)

### Tile
- 1px deep-green border, bg fill
- Hover: invert
- Glow on hover increases

### ASCII Box (the canonical container)
```html
<div class="ascii-box">
  <span class="corner tl">┌</span>
  <span class="corner tr">┐</span>
  <span class="corner bl">└</span>
  <span class="corner br">┘</span>
  …
</div>
```
The corners are real text characters at 1px from the edge of a 1px green border — a redundancy that *says* "terminal".

### Chat bubble
- User: 1px green border, green text glow, bg-2 fill
- AI: 1px green-deep border, green-dim text, no glow
- Name in mono amber UPPER `[ROSE] :: 14:32:08`

### Prompt bar
```html
<form class="prompt-bar">
  <span class="sigil">$&gt;</span>
  <input placeholder="ENTER PROMPT..."/>
  <span class="cursor">█</span>
  <button>SEND ↵</button>
</form>
```
1px green border around all of it. The `$>` sigil and `SEND ↵` button are in their own bordered columns.

### Modal
1px green border, glow shadow, scanline overlay still applies through it.

---

## 5. App handbook — "~/notes" (a directory)

In Pixel CRT, an app is a tmux window. Frame it that way.

### Frame
```html
<div class="app-frame">
  <header class="app-head">
    <span class="p-mono">~/notes [042]</span>
    <span class="p-chip p-chip-on">EDIT MODE</span>
    <span class="p-mono">14:32:08</span>
  </header>
  <main class="app-body"><!-- list / editor split --></main>
  <footer class="app-foot">
    <span class="p-mono">▌ MEM 142M · NET ↗ 12K/S · [ESC] EXIT</span>
  </footer>
</div>
```

### Layout
- 200px file list left, editor right
- 1px green-deep vertical divider
- Padding 12px (tighter than other themes — terminal density)

### List row
```html
<button class="entry-row">
  <span class="p-mono">▸ 042 · 2026.05.09 · A_SLOW_SUNDAY.MD</span>
  <span class="p-mono" style="color:var(--green-dim)">2.4K</span>
</button>
```
Selected: phosphor green bg, bg text, no glow.

### Editor
- Title: VT323 60px UPPER, blinking `_` cursor at end
- Body: Plex Mono 13px / 1.65, green-dim
- Caret: solid green `█`

### Empty
ASCII art box centered with text "EMPTY_DIRECTORY [N+ TO ADD]".

### Working
Footer scrolls a job log: `[14:32:08] ▸ saving · [14:32:09] ✓ saved`. Title row shows `JOB #0042 · 62%` and an ASCII progress bar `[████░░░░░░] 62%`.

---

## 6. Widget handbook — Weather

### Markup
```html
<article class="tile" data-size="1x1">
  <span class="p-mono">/WEATHER/LAGOS</span>
  <div>
    <span class="p-h2" style="font-size:64px">18°</span>
    <span class="p-mono" style="color:var(--amber)">CLOUDY</span>
  </div>
</article>
```

### Type
- Number: VT323 64px (display-size, never anti-aliased)
- Caption: mono UPPER 11 .14em
- Meta: mono UPPER 10 .16em green-dim

### Color
- Default tile: 1px green border, bg fill
- Alert tile: 1px amber border, amber glow
- Error tile: 1px magenta border

### States
- **Empty:** `[NO DATA]`
- **Live:** as above
- **Working:** caption replaced with blinking `[ FETCH._ ]`, number stays static

### Variant: 2x1
Number + 5-day strip. Each day is a column with a 1×8 vertical bar of phosphor intensity proportional to temp + a digit underneath.

### Variant: 2x2
Number + 5-day strip + bottom row of mono hours `06:00 CLR · 09:00 PCL · 12:00 OVR`

### Don'ts
- Don't anti-alias the hero number (VT323 must render pixel-perfect)
- Don't use sentence case (everything UPPER except body)
- Don't add a weather illustration — letters do the work

---

## 7. Icons & marks

### App icon — 16 × 16 pixel art
```html
<svg viewBox="0 0 16 16" class="app-icon"
     shape-rendering="crispEdges"
     style="filter: drop-shadow(0 0 6px #33FF66)">
  <rect width="16" height="16" fill="#0B0F0A"/>
  <rect x="1" y="1" width="14" height="14" fill="none" stroke="#33FF66"/>
  <!-- silhouette as pixel rectangles -->
  <rect x="4" y="4" width="8" height="1" fill="#33FF66"/>
  <rect x="4" y="6" width="8" height="1" fill="#33FF66"/>
  <rect x="4" y="8" width="6" height="1" fill="#33FF66"/>
</svg>
```

**Rules:**
- 16×16 viewBox at `shape-rendering: crispEdges`
- 1px green border around the plate
- Silhouette drawn as 1×1 / 1×N pixel rectangles only — no curves
- Phosphor drop-shadow on the SVG itself
- Special state icons use amber or magenta

### Widget thumbnail
- 480×480, scanline overlay preserved
- Replace numbers with `--`
- Glow rendered as drop-shadow filter on the export

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Terminal.** `> show me flights from lagos to london` · `▸ pinned to /today`
- **All UPPER for chrome, sentence case in bubbles.**
- **Path-style for app names.** `~/notes`, `~/files`, `~/inbox`
- **System-log error.** `! err :: provider timeout`
- **No emoji. Glyphs only.** `▸ ▌ █ ↗ ↩ ↵`

### Common mistakes
- ❌ Anti-aliasing VT323 — text-rendering: geometricPrecision; -webkit-font-smoothing: none
- ❌ Forgetting the scanline overlay
- ❌ Soft drop shadows — glow only (using box-shadow with 0 spread, large blur)
- ❌ Rounded corners
- ❌ Smooth gradients — phosphor is flat color
- ❌ Sentence-case section headers — chrome is UPPER

### Ship checklist
- [ ] Scanline overlay on page
- [ ] CRT vignette overlay on page
- [ ] Every glyph gets phosphor `text-shadow`
- [ ] Hero numbers in VT323
- [ ] Body in IBM Plex Mono
- [ ] Every metadata label UPPER mono with letter-spacing
- [ ] Zero border-radius
- [ ] Blinking `█` cursor somewhere (chat bar, working state)
- [ ] App icons rendered with `crispEdges` and pixel rects
- [ ] Working state uses ASCII progress bar `[████░░░░] 62%`

> Gut-check: if a 1992 BBS user could navigate it, ship.
