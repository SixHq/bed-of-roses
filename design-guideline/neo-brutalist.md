# Neo Brutalist — Theme Handbook

> Paper-white surfaces, walnut-black ink, 1px hairlines, sharp 90° corners.
> One hot red accent, rationed like a stamp.

---

## 1. Mood & philosophy

Neo Brutalist is the **structural, technical, file-system** register. Where Cartoon Brutalist celebrates ornament, Neo Brutalist refuses it. No radius. No shadow. One accent color. Monospace metadata everywhere. The point is to look like *proper software* — Linux command line, a directory listing, a Git diff.

**Build for:** power users, developers, terminal-lovers, the person who reads RFCs for fun.

**Tonal anchors:** a printed RFC document, the side of a file cabinet, the index of an art book, a single-column zine.

If your design starts to feel decorative or playful, you've drifted. Strip back to structure.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--paper` | `#F4F2ED` | Page background — slightly off-white |
| `--paper-2` | `#FFFFFF` | Cards, inputs |
| `--ink` | `#0A0A0A` | All text, all strokes |
| `--ink-2` | `rgba(10,10,10,.72)` | Body |
| `--ink-3` | `rgba(10,10,10,.48)` | Hints |
| `--ink-4` | `rgba(10,10,10,.20)` | Disabled |

### Accents (rationed)
| Var | Hex | When |
|---|---|---|
| `--hot` | `#FF3B00` | State changes ONLY (active, error, "live") — never decoration |
| `--acid` | `#D6FF3B` | "Acknowledged", "draft" — used 1× per screen max |

### Hairlines
| Var | Value | Use |
|---|---|---|
| `--hair` | `rgba(10,10,10,.18)` | Default |
| `--hair-2` | `rgba(10,10,10,.32)` | Strong, but still hairline |

### Strokes & shadows
- **Everything is 1px solid ink.** Hairlines (`--hair`) for internal dividers.
- **Zero shadows.** None. Hierarchy comes from line position, not depth.

### Type
- **Sans** — `Inter Tight`, weight 400/500/600/700/800
- **Mono** — `JetBrains Mono`, weight 400/500/700

| Class | Size / Line | Use |
|---|---|---|
| `.n-h1` | 96 / .92 / -.04em (800) | Hero — UPPERCASE |
| `.n-h2` | 42 / 1 / -.03em (700 UPPER) | Section title |
| `.n-h3` | 24 / 1.1 / -.02em (700 UPPER) | Sub |
| `.n-display` | 20 / 1.35 / -.012em | Body display |
| `.n-body` | 14 / 1.55 (400) | Body |
| `.n-mono` | 12 / .04em (mono 500) | Metadata, paths |
| `.n-tag` | 10 / .16em UPPER (mono 500) | Tags |
| `.n-eyebrow` | 11 / .18em UPPER (mono 500) hot | Eyebrows |

### Spacing
4 / 8 / 12 / 16 / 24 / 32. Tighter than other themes — Neo Brutalist is dense.

### Radii
**Zero everywhere.** No exceptions. Don't round a corner. Pills become squared. The avatar is a square.

### Motion
- Hover: background inverts (paper → ink). 120ms linear.
- Press: no transform — just the background swap.
- No fades. No slides. Things click on and off like switches.

---

## 3. Layout & screen orientation

### Page
Background: `--paper` with a 1px grid overlay at 64px (drawn via `linear-gradient`, not SVG). Helps the eye lock to structure. Center 30% of viewport has a radial mask that fades the grid out (so content reads clean over a hint of structure).

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: 220px;
  gap: 0;
  border: 1px solid var(--ink);
}
.tile {
  border-right: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
  /* outer borders drawn by the parent */
}
```
Tiles share edges — no gap. Looks like a spreadsheet.

### App modal
- 900×680, paper-2 background, 1px ink border, **no radius, no shadow**
- Backdrop: paper with 80% opacity, no blur
- Opens at 200ms linear from `opacity: 0` — no transform

### Mobile breakpoint
≤ 600px: grid → 1 column, modal becomes full-screen.

---

## 4. Component handbook

### Button
```html
<button class="n-btn n-btn-pri">▸ Initialize</button>
```
```css
.n-btn {
  height: 44px;
  padding: 0 20px;
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0;
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--paper-2);
  color: var(--ink);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.n-btn:hover { background: var(--ink); color: var(--paper-2); }
.n-btn-pri { background: var(--ink); color: var(--paper-2); }
.n-btn-pri:hover { background: var(--hot); border-color: var(--hot); }
.n-btn-hot { background: var(--hot); color: var(--paper-2); border-color: var(--hot); }
.n-btn-ghost { border: none; background: transparent; text-transform: none; padding: 0 8px; }
```

Disabled: opacity .35, no hover.

### Field
```html
<div class="n-field">
  <label>NAME</label>
  <input class="n-input" placeholder="enter handle…" />
</div>
```
- Label: mono UPPER 11 .16em
- Input: 44px tall, 1px ink border, paper-2 bg, mono 14px text, no radius
- Focus: inset 2px hot border via outline `outline: 2px solid var(--hot); outline-offset: -3px`

### Chip
- 28px tall, 1px ink border, **squared corners**, mono 11 UPPER .08em
- Selected: invert (ink bg, paper text)

### Tile
- 1px ink border, paper-2 bg
- Hover: invert
- The label is at the top (`tile-meta`), the value at the bottom — never centered. Density.

### Chat bubble
- User: ink bg, paper text, squared corners
- AI: paper-2 bg, 1px ink border, AI name (`[ROSE]`) in mono hot 10 UPPER

### Chat bar (sectioned)
```html
<form class="prompt-bar">
  <span class="prompt-sigil">$</span>
  <input placeholder="enter prompt…" />
  <button>SEND ↵</button>
</form>
```
1px ink border around the whole thing. The `$` sigil is in a 44px column with a 1px ink right-divider — looks like a terminal prompt.

### Modal
1px ink border, no radius, no shadow. Header has a 1px ink bottom border. Title is `.n-h3` UPPER.

---

## 5. App handbook — Notes (`./notes`)

The app is conceptually a directory, not a "Notes app". Frame it that way.

### Frame
```html
<div class="app-frame">
  <header class="app-head">
    <span class="n-mono">~/notes [042]</span>
    <span class="n-mono">14:32:08</span>
  </header>
  <main class="app-body"><!-- columns --></main>
  <footer class="app-foot"><span class="n-tag">PID 2402 · 14 ENTRIES · 218KB</span></footer>
</div>
```

### Layout
- 220px file list on left, editor on right, 1px ink divider
- List items are rows, not cards — like an `ls -l` table

### List row
```html
<button class="entry-row">
  <span class="n-mono">042</span>
  <span class="n-mono">2026.05.09</span>
  <span class="entry-title">A SLOW SUNDAY</span>
  <span class="n-mono">2.4K</span>
</button>
```
- 4-column grid: id / date / title / size
- Hover: invert
- Selected: invert + 2px hot left border

### Editor
- Title: contenteditable `.n-h2` (uppercase enforced via CSS `text-transform: uppercase`)
- Body: contenteditable `.n-body`, max-width 64ch, mono caret
- Status bar at bottom: word count, characters, last save — mono 11 UPPER

### Empty
A single line: `[empty] use ⌘N to add` — mono, paper-2 bg, ink-3 text.

### Working
Title gets an underscore cursor `_` blinking at end. Footer line scrolls a log: `[14:32:08] regenerating…`

---

## 6. Widget handbook — Weather

### Markup
```html
<article class="n-tile" data-size="1x1">
  <span class="n-mono">/WEATHER/LAGOS</span>
  <div>
    <span class="hero-num">18°</span>
    <span class="n-mono">CLOUDY</span>
  </div>
</article>
```

### Sizing
- 1px ink border, no radius, no shadow
- 220×220 at 1x1, 14px padding

### Type
- Number: Inter Tight 800 / 36–48px, **not uppercase** (numbers don't have case)
- Caption: mono UPPER 11 .16em

### Color
- 90% of tiles use paper-2 bg. The *one* hot-bg tile per home grid is the "active" one (the alert, the live state). Ration discipline.

### States
- **Empty:** `/WEATHER/[NULL]` — that's all
- **Live:** as above
- **Working:** caption replaced with `[ FETCH... ]` — square brackets, mono UPPER, no spinner

### Variant: 2x1
- Number + 5-day strip on the right
- Days in 1px-bordered cells, day letter + temp stacked, mono

### Variant: 2x2
- Number + 5-day strip + bottom-row text log of conditions per hour: `06:00 CLR · 09:00 PCL · 12:00 OVR`

### Don'ts
- Don't add a sun icon — the word CLOUDY says it
- Don't color-code temperature — leave it ink

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <rect x="0.5" y="0.5" width="63" height="63"
        fill="var(--paper-2)" stroke="var(--ink)" stroke-width="1"/>
  <!-- one ink silhouette, 1.5px stroke -->
  <path d="M18 18 H42 L46 22 V48 H18 Z M38 18 V24 H44"
        fill="none" stroke="var(--ink)" stroke-width="1.5"
        stroke-linejoin="miter" stroke-linecap="butt"/>
  <!-- the only color: a 4px hot square in the corner -->
  <rect x="50" y="50" width="6" height="6" fill="var(--hot)"/>
</svg>
```

**Rules:**
- Square plate, 1px ink border
- Silhouette is 1.5px ink — round caps are *off*, butt caps and miter joins (sharp)
- One 4–6px hot square in a corner is the only color on the icon

### Widget thumbnail
- 480×480, 1px ink border, no shadow
- Replace numbers with `--` (two em-dashes) — never em-dash single character

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Metadata UPPER, body sentence case.** *"WORKING."* in headlines, *"Pinned a flight tracker to today."* in body
- **Job-log voice.** `[14:32:08] ▸ parsing prompt`
- **No exclamation points.** Period.
- **Path-style for app names.** `~/notes`, `~/files`, `~/inbox`

### Common mistakes
- ❌ Rounding a corner — anywhere, ever
- ❌ Adding a shadow with blur — Neo Brutalist has zero shadows
- ❌ Using hot or acid as a decoration — they're state colors only
- ❌ Lowercase headlines — they SHOUT
- ❌ Pure black — use `--ink` (`#0A0A0A`)
- ❌ Cards with gaps between them on the home grid — tiles share edges

### Ship checklist
- [ ] Zero border-radius on every element
- [ ] Zero box-shadow on every element
- [ ] Headlines UPPERCASE
- [ ] Metadata in JetBrains Mono UPPER .16em
- [ ] Body in Inter Tight (mixed case)
- [ ] Hot color used ≤ 1× per visible screen
- [ ] Tiles share edges, not gaps
- [ ] No drop shadows, ever
- [ ] Empty states use bracketed placeholders `[null]`
- [ ] App icon has the single hot square corner mark

> Final gut-check: would this look at home printed in a 1980s technical manual? If yes, ship.
