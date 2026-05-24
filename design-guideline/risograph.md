# Risograph — Theme Handbook

> Three spot inks on warm cream stock. Halftone fills, intentional misregistration, paper grain.
> A soft little OS that prints itself, one color at a time.

---

## 1. Mood & philosophy

Risograph is the **hand-pulled, zine, art-school print shop** register. Each visual element looks like it was printed in fluoro pink, federal blue, or sun yellow on a Riso machine — overlapping colors *multiply*, edges are *slightly* off-register, and the paper grain shows through everything.

**Build for:** users who buy zines, follow indie publishers, send postcards by hand, get excited about Pantone swatches.

**Tonal anchors:** It's Nice That, AA Files, a freshly-pulled poster on a clothesline, the smell of fixer.

If your design starts to feel digital-perfect, you've drifted. Push back toward *off-register, halftone, hand-pulled*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--paper` | `#F4ECD8` | Page background — warm cream stock |
| `--paper-2` | `#FAF3E0` | Cards (slightly lighter cream) |
| `--ink` | `#1A1F3D` | Deep federal blue, used as ink (never pure black) |
| `--ink-soft` | `#3F4880` | Body text |

### Spot inks
| Var | Hex | Use |
|---|---|---|
| `--pink` | `#FF48B0` | Fluoro pink (primary) |
| `--blue` | `#3145C2` | Federal blue (secondary) |
| `--yellow` | `#FFE15B` | Sun yellow (tertiary) |
| `--teal` | `#2BAA8E` | Pulled green — rare 4th pass |
| `--red` | `#E53A22` | Red — alerts only |

Use 3 inks per surface, max. Adding more breaks the print-shop illusion.

### Paper grain (essential)
```css
body::before {
  content:'';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 1px 1px, rgba(26,31,61,.08) 1px, transparent 1px),
    radial-gradient(circle at 13px 7px, rgba(26,31,61,.05) 1px, transparent 1px);
  background-size: 5px 5px, 17px 17px;
  mix-blend-mode: multiply;
}
```
Never leave the page without paper grain.

### Halftone overlay (the signature)
```css
.ht::after {
  content:'';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, currentColor 20%, transparent 22%);
  background-size: 6px 6px;
  opacity: .18;
  mix-blend-mode: multiply;
}
```
Add `.ht` class to anything that should look hand-printed (tiles, buttons, swatches).

### Misregistration recipe
Element + offset duplicate of itself with a different spot-ink color.
```css
.miso::before {
  content: attr(data-text);
  position: absolute; left: 2px; top: 2px;
  color: var(--pink);
  mix-blend-mode: multiply;
  z-index: -1;
}
.miso::after {
  content: attr(data-text);
  position: absolute; left: -2px; top: -1px;
  color: var(--blue);
  mix-blend-mode: multiply;
  z-index: -1;
}
```
For shadows on cards: 3px hard offset shadow in a *contrasting* ink color (pink shadow on a yellow card, yellow shadow on a pink card, blue shadow on a paper card).

### Type
- **Display** — `Fraunces`, weight 800/900, italic-capable, with `font-variation-settings: "SOFT" 30`
- **Sans** — `Space Grotesk`, weight 400/500/600/700
- **Mono** — `JetBrains Mono`, weight 400/500

| Class | Size / Line | Use |
|---|---|---|
| `.r-h1` | 104 / .92 / -.03em italic (Fraunces 900) | Hero |
| `.r-h2` | 42 / 1.02 / -.02em italic (Fraunces 800) | Section |
| `.r-h3` | 22 / 1 / -.01em UPPER (Space Grotesk 700) | Sub |
| `.r-display` | 18 / 1.45 italic (Fraunces 500) | Display body |
| `.r-body` | 14 / 1.55 (Space Grotesk 400) | Body |
| `.r-mono` | 11 / .05em (mono 500) | Metadata |
| `.r-tag` | 10 / .16em UPPER (mono 500) | Tags |
| `.r-eyebrow` | 11 / .18em UPPER (mono 500) pink | Eyebrows |

### Radii
- Buttons: 6 (slightly soft, never sharp)
- Cards / tiles: 10–14
- Chips: 999 (pills)

### Motion
Almost none. The page is "printed", not animated.
- Hover: 1px translate up-left, shadow grows from 3/3 to 5/5
- Press: 2px translate down-right
- Never use opacity or blur transitions

---

## 3. Layout & screen orientation

### Page background
`--paper` + the paper grain overlay (mandatory).

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: 18px; /* generous — like a poster wall */
  padding: 80px 24px 132px;
}
```

### App modal
- 920×680, paper-2 bg, 2px ink border, 14px radius, 6/6 pink hard shadow
- Backdrop: paper at 70%, no blur

---

## 4. Component handbook

### Button
```html
<button class="r-btn r-btn-pink">★ Subscribe</button>
```
```css
.r-btn {
  height: 46px;
  padding: 0 22px;
  font-family: var(--sans);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: .02em;
  text-transform: uppercase;
  border: 2px solid var(--ink);
  border-radius: 6px;
  background: var(--paper-2);
  box-shadow: 3px 3px 0 var(--pink);
  transition: transform .1s, box-shadow .1s;
}
.r-btn:hover { transform: translate(-1px,-1px); box-shadow: 5px 5px 0 var(--pink); }
.r-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--pink); }
```
Variants by spot ink: `.r-btn-pink`, `.r-btn-blue`, `.r-btn-yellow`. Shadow is always a *different* ink color than the button background.

### Field
- 46px tall, 2px ink border, 6px radius, paper-2 bg
- Focus: 3px hard pink shadow + soft pink inner glow
- Placeholder: Fraunces italic, ink-soft color

### Chip
- 30px tall, 2px ink border, pill, mono UPPER
- Selected: tinted with one spot ink + paper text

### Tile
- 2px ink border, 14px radius, 4px hard offset shadow in a *contrasting* spot ink (pink on yellow, etc.)
- The whole tile can be paper-2, pink, blue, yellow — never neutral grey
- Halftone `.ht` overlay on important tiles
- Hover: translate -1/-1 + shadow grows to 6/6

### Chat bubble
- User: federal blue bg, paper text, 14px radius, 3px hard yellow shadow
- AI: paper-2 bg, 2px ink border, 3px hard pink shadow, name in Fraunces italic pink

### Chat bar
2px ink border, 14px radius, 4px hard pink shadow, paper-2 bg. Send button is `.r-btn-blue`.

### Modal
2px ink border, 14px radius, 6px hard pink shadow. Header divider is 2px ink (not hairline).

---

## 5. App handbook — "The Magazine" (Notes as a zine)

Frame Notes as a zine you publish to yourself.

### Frame
```html
<div class="r-modal">
  <header class="r-modal-head">
    <h1 class="r-h2"><span class="miso" data-text="The Magazine">The Magazine</span></h1>
    <span class="r-tag">Issue 042 · Spring 2026</span>
    <button class="r-btn r-btn-pink" style="height:36px">Pull a new issue</button>
  </header>
  <main>...</main>
</div>
```

### Layout
- Two-column: 200px contents list / spread editor
- Vertical divider: 2px ink

### List row
```html
<button class="r-card" style="background:var(--paper-2); box-shadow:3px 3px 0 var(--pink)">
  <span class="r-h3" style="font-size:18px; font-style:italic; font-family:var(--serif)">A slow Sunday</span>
  <span class="r-tag">2 min · Spring '26</span>
</button>
```
Selected: shadow flips to blue.

### Editor (zine spread)
- Title: Fraunces italic 800 / 48px
- Body: Space Grotesk 400 / 16px, max-width 56ch
- Page background has a faint 1px ink ruler at column 60 (vertical hairline)

### Empty
"Print your first issue." in Fraunces italic 24px, centered, ink-soft. A small pink Riso machine illustration (drawn or 3 layered rectangles) beneath.

### Working
Three-pass print animation in the header — pink dot, blue dot, yellow dot light up sequentially each 600ms.

---

## 6. Widget handbook — Weather as a poster card

### Markup
```html
<article class="r-card ht" data-size="1x1" style="background:var(--paper-2); box-shadow:4px 4px 0 var(--pink)">
  <span class="r-mono">weather · lagos</span>
  <div>
    <span class="r-h2" style="font-size:48px; font-style:italic; font-family:var(--serif)">18°</span>
    <span class="r-mono" style="color:var(--pink)">cloudy</span>
  </div>
</article>
```

### Type
- Number: Fraunces italic 900 / 48–54px / ink
- Caption: mono UPPER 10 / .16em, tinted with a spot ink
- Meta: mono 10 / .14em UPPER / ink-soft

### Color
- Three tile recipes:
  - Paper-2 bg + pink shadow (default)
  - Pink bg + paper text + blue shadow (loud)
  - Yellow bg + ink text + blue shadow (warm)
  - Blue bg + paper text + yellow shadow (cool)
- Halftone overlay (`.ht`) on at least every other tile

### States
- **Empty:** Italic "*Pull a place.*"
- **Live:** as above
- **Working:** Pink / Blue / Yellow checkboxes appear in sequence — the "print run" indicator

### Variant: 2x1 (flight)
Two IATA codes Fraunces italic 36px, dashed connector (2px ink), plane glyph at 50% with `.miso` chromatic offset

### Don'ts
- Don't use a regular black drop shadow — shadows are spot-ink, hard offset
- Don't use sans-serif for the hero number — Fraunces italic is essential
- Don't forget the halftone overlay on at least half the tiles
- Don't put more than 3 inks on one surface

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <!-- offset duplicate plate -->
  <rect x="6" y="6" width="58" height="58" rx="10"
        fill="var(--pink)" opacity=".55" style="mix-blend-mode:multiply"/>
  <rect x="3" y="3" width="58" height="58" rx="10"
        fill="var(--yellow)" stroke="var(--ink)" stroke-width="2"/>
  <!-- halftone overlay -->
  <rect x="3" y="3" width="58" height="58" rx="10" fill="url(#dots)"/>
  <!-- silhouette in ink -->
  <path d="M18 18 H42 L46 22 V48 H18 Z M38 18 V24 H44"
        fill="none" stroke="var(--ink)" stroke-width="2"/>
</svg>
```

**Rules:**
- Two plate layers, offset 3px, in two different spot inks, multiply blend
- 2px ink border on the top plate
- Silhouette in ink, 2px stroke
- Dots pattern overlay at 25% opacity

### Widget thumbnail
- 480×480 with paper grain + halftone preserved
- Replace numbers with em-dash `—` set in Fraunces italic
- Hard offset shadow in pink/blue/yellow rotated by tile index

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Zine-editor.** "Issue 042. Spring 2026."
- **Italic noun phrases.** *A slow Sunday.* *Three small things.*
- **Print-shop verbs.** "Pull", "print", "publish", instead of "save", "sync", "publish".
- **Date and issue numbers everywhere.** Even on tiny widgets.

### Common mistakes
- ❌ Black instead of deep blue ink (`#1A1F3D`)
- ❌ Forgetting the paper grain overlay
- ❌ Forgetting the misregistration shadow (regular dropshadow is wrong)
- ❌ Sharp-corner Helvetica vibes — Fraunces italic is the heart
- ❌ Using more than 3 inks on one surface
- ❌ Anti-aliased perfect alignment — embrace the 1-2px offset

### Ship checklist
- [ ] Paper grain `body::before` is on the page
- [ ] Headlines in Fraunces italic 800/900
- [ ] Body in Space Grotesk
- [ ] Mono labels UPPER .14–.18em
- [ ] Every card has a 3–6px hard offset shadow in a *contrasting* spot ink
- [ ] Halftone overlay on at least half the tiles
- [ ] No black anywhere — only `--ink` (federal blue)
- [ ] App icons have offset duplicate plates in two inks
- [ ] Widget thumbnails preserve grain + halftone
- [ ] Issue number / date appears at least once per screen

> Gut-check: if it could be tacked to a print-shop bulletin board, ship.
