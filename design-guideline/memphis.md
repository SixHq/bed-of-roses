# Memphis — Theme Handbook

> Milan, 1981. Bold geometric shapes in clashing brights on warm paper,
> everything outlined in navy ink with asymmetric corners. Deliberately too much.

---

## 1. Mood & philosophy

Memphis is the **postmodern pop** register — the Memphis Group's revolt against good taste. Every element is a toy block: flat clashing brights (pink, yellow, sky, mint) held together by a heavy navy-ink outline, corners that are round on one diagonal and sharp on the other, squiggles and terrazzo dots used as structure, one thing per composition rotated just enough to feel wrong on purpose.

**Build for:** users who own a Sottsass reissue or wish they did, love Saved by the Bell title cards, collect swatch books, think beige is a moral failure.

**Tonal anchors:** the Carlton bookcase, terrazzo floors, MTV idents, David Bowie's Memphis furniture collection, a laser-grid skating rink birthday.

If your design starts to feel tasteful, quiet, or coordinated, you've drifted. Push back toward *clashing, outlined, wonky*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--canvas` | `#FAF1DC` | Page background — warm cream |
| `--surface-1` | `#FFFAF0` | Paper cards, modals, bubbles (the presence's exact card color) |
| `--surface-2` | `#FFF4E2` | Layered chips / hover |
| `--surface-3` | `#F5E8CC` | Recessed / selected backdrops |
| `--ink` | `#1A1A2E` | Deep navy — every stroke and label. NEVER pure black |

### Clashing brights
| Var | Hex | Use |
|---|---|---|
| `--memphis-pink` | `#FF4FA3` | Emphasis, error blocks, the loudest voice |
| `--memphis-yellow` | `#FFE15B` | Input bars, running/busy states |
| `--memphis-sky` | `#3DB7FF` | Footer bands, cool blocks, secondary buttons |
| `--memphis-mint` | `#5FE3A1` | Status chips, done states |
| `--memphis-cream` | `#FAF1DC` | Text on ink fills |

Accents are FLAT BLOCKS — a whole footer band is sky, a whole input bar is yellow. Two accents may clash on one surface; the ink outline is what keeps the peace. Never tint, never gradient.

### The outline (non-negotiable)
Every card, button, chip, and input wears a solid navy stroke:
- Cards / bubbles / modals: `2.5px solid #1A1A2E`
- Buttons / small chips: `2px solid #1A1A2E`
No element floats without its outline. Shadows are none or flat — never blurred.

### The asymmetric corner (the signature)
```css
border-radius: 24px 4px 24px 4px;  /* cards (presence exact) */
border-radius: 20px 4px 20px 4px;  /* bars / inputs */
border-radius: 14px 4px 14px 4px;  /* buttons */
border-radius: 8px 2px 8px 2px;    /* icons / small chips */
```
Round on one diagonal, sharp on the other, always the same orientation per screen. A symmetric all-round radius on a featured card is off-language.

### Pattern kit
```css
/* terrazzo dots — background fields */
background-image: radial-gradient(circle at 6px 6px, rgba(26,26,46,.4) 2.5px, transparent 3px);
background-size: 34px 34px;

/* zigzag divider — section breaks (SVG stroke, ink, 2px) */
/* M0 6 L8 0 L16 6 L24 0 ... repeat */

/* confetti — small rotated triangles/circles/squiggles in the brights,
   absolutely positioned in card corners; 2-3 per screen, never more */
```
One rotated element per composition: `transform: rotate(-8deg)` on a badge, sticker, or triangle. One, not five.

### Type
- **Display** — `Fraunces`, weight 900, ITALIC by default
- **Sans** — `Space Grotesk`, weight 400/500/700 — body and buttons
- **Mono** — `DM Mono`, weight 400/500 — micro-labels

| Class | Size / Line | Use |
|---|---|---|
| `.mp-h1` | 52 / .95 italic (Fraunces 900) | Hero |
| `.mp-h2` | 38 / 1.0 italic (Fraunces 900) | Section |
| `.mp-h3` | 20 / 1.05 UPPER (Grotesk 700) | Sub |
| `.mp-body` | 14 / 1.5 (Grotesk 400/500) | Body |
| `.mp-mono` | 11 / .08em (DM Mono 500) | Metadata |
| `.mp-tag` | 10 / .14em UPPER (DM Mono 500) | Tags / chips |

Emphasis words inside headlines and streams are **Fraunces italic 900 in pink** (`#FF4FA3`) — the presence does exactly this.

### Radii
See the asymmetric corner recipe above — it IS the radius system. Full pills allowed only for tiny status dots.

### Motion
Toy-like. Things wobble; they don't fade.
- Hover: `translateY(-2px) rotate(-1deg)` — the pick-it-up wonk
- Working: wobble `rotate(-2deg) ↔ rotate(2deg)`, 1.2–1.4s ease-in-out (presence exact)
- Durations 140/300/520ms, ease `cubic-bezier(0.34, 1.30, 0.40, 1)` (slight overshoot)
- Never: opacity fades, blurs, glows

---

## 3. Layout & screen orientation

### Page background
`--canvas` with faint bright washes; optionally one corner of sparse terrazzo dots at low opacity. Decoration frames the grid — it never sits under text.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: 18px;
  padding: 80px 24px 132px;
}
```

### App modal
- 920×680, `--surface-1` bg, 2.5px ink border, `28px 6px 28px 6px` radius
- Flat deep shadow allowed on the modal only (`0 24px 48px rgba(26,26,46,.16)`)
- Backdrop: cream at 70%, no blur

---

## 4. Component handbook

### Button
```html
<button class="mp-btn mp-btn-ink">Do the thing</button>
```
```css
.mp-btn {
  height: 44px;
  padding: 0 20px;
  font-family: "Space Grotesk", sans-serif;
  font-weight: 700;
  font-size: 14px;
  border: 2px solid var(--ink);
  border-radius: 14px 4px 14px 4px;
  background: var(--surface-1);
  color: var(--ink);
  transition: transform .14s cubic-bezier(.34,1.3,.4,1);
}
.mp-btn:hover  { transform: translateY(-2px) rotate(-1deg); }
.mp-btn:active { transform: translateY(1px); }
.mp-btn-ink  { background: var(--ink); color: var(--memphis-cream); }
.mp-btn-sky  { background: var(--memphis-sky); }
.mp-btn-pink { background: var(--memphis-pink); color: var(--memphis-cream); }
```
Primary is the ink fill (presence send button). Accent buttons are flat bright blocks — pick the accent the zone already speaks.

### Field
- 44px tall, `2.5px` ink border, `16px 4px 16px 4px` radius
- Background is the YELLOW block (`#FFE15B`) — the presence prompt bar, exact
- Input text: Space Grotesk 700 ink; placeholder italic at 50% ink
- Focus: flat pink ring `0 0 0 3px #FF4FA3` — no glow

### Chip
- 26–30px tall, 2px ink border, `8px 2px 8px 2px` radius, DM Mono UPPER
- Default mint; running yellow (+ wobble); error pink with cream text — the presence's tool-row palette, exact

### Tile
- `--surface-1`, 2.5px ink border, `24px 4px 24px 4px`, no shadow
- Hover: `translateY(-2px) rotate(-1deg)`
- One accent block per tile (a colored footer band or corner badge)
- One confetti shape allowed in a corner, rotated

### Chat bubble
- User: ink bg, cream text, `20px 4px 20px 4px`
- AI: paper bg, 2.5px ink border, `24px 4px 24px 4px`; name in Fraunces italic 900; emphasis words pink italic
- Footer band inside a bubble: flat sky block (presence exact)

### Chat bar
Yellow block, 2.5px ink border, `20px 4px 20px 4px`. Send button is an ink block with cream glyph, `12px 3px 12px 3px`.

### Modal
2.5px ink border, `28px 6px 28px 6px`, flat deep shadow. Header divider is a 2px ink rule — or a zigzag for a featured moment.

---

## 5. App handbook — "The Showroom" (Notes as a design catalog)

Frame Notes as pieces in a furniture showroom.

### Frame
```html
<div class="mp-modal">
  <header class="mp-modal-head">
    <h1 class="mp-h2">The <em style="color:var(--memphis-pink)">Showroom</em></h1>
    <span class="mp-tag">Collection 042 · Milano</span>
    <button class="mp-btn mp-btn-ink" style="height:36px">New piece</button>
  </header>
  <main>...</main>
</div>
```

### Layout
- Two-column: 220px catalog list / spread
- Vertical divider: 2px ink rule

### List row
```html
<button class="mp-card" style="border-radius:14px 4px 14px 4px">
  <span style="font-family:Fraunces; font-style:italic; font-weight:900; font-size:17px">Tahiti lamp thoughts</span>
  <span class="mp-tag">No. 042 · Apr</span>
</button>
```
Selected: yellow block + `rotate(-1deg)`. Hover: lift-and-wonk.

### Editor (the spread)
- Title: Fraunces italic 900 / 40px, key word pink
- Body: Space Grotesk 400 / 15px / 1.55, max-width 58ch
- A sky corner-triangle pinned top-right of the page; a zigzag rule above the footer

### Empty
"*Nothing on the floor yet.*" Fraunces italic 900 / 22px, centered. Below: three flat shapes (pink circle, sky triangle, mint half-pill), one rotated.

### Working
The header badge wobbles (1.2s) and its block flips to yellow — the busy color.

---

## 6. Widget handbook — Weather as a showroom card

### Markup
```html
<article class="mp-tile" data-size="1x1">
  <span class="mp-tag">weather · lagos</span>
  <div>
    <span style="font-family:Fraunces; font-style:italic; font-weight:900; font-size:48px; color:var(--ink)">24°</span>
    <span class="mp-tag" style="background:var(--memphis-mint); border:2px solid var(--ink); border-radius:8px 2px 8px 2px; padding:2px 8px">clear</span>
  </div>
</article>
```

### Type
- Number: Fraunces italic 900 / 44–52px / ink
- Status: DM Mono UPPER tag inside a bright chip
- Meta: DM Mono 10 / .14em UPPER / ink at 50%

### Color
- Tile recipes (rotate across the grid so neighbors clash):
  - Paper + mint chip (default)
  - Yellow tile + ink text + pink chip (loud)
  - Sky tile + ink text + yellow chip (cool)
  - Pink tile + cream text + sky chip (hot)
- Every recipe keeps the 2.5px ink border; neighboring tiles should NOT match

### States
- **Empty:** "*Pick a city.*" Fraunces italic; one rotated triangle beneath
- **Live:** as above
- **Working:** the status chip flips yellow and wobbles

### Variant: 2x1 (flight)
Two IATA codes Fraunces italic 900 / 34px; route is a zigzag ink line; the plane is a small sky triangle rotated toward the destination.

### Don'ts
- Don't drop the ink outline on anything
- Don't use symmetric all-round radii on featured cards
- Don't blur a shadow or add a glow
- Don't let neighboring tiles share the same accent recipe
- Don't rotate more than one element per composition

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <!-- paper plate, asymmetric corners -->
  <path d="M22 3 H55 A6 6 0 0 1 61 9 V55 A6 6 0 0 1 55 61 H9
           A6 6 0 0 1 3 55 V22 A19 19 0 0 1 22 3 Z"
        fill="#FFFAF0" stroke="#1A1A2E" stroke-width="2.5"/>
  <!-- flat accent block -->
  <rect x="8" y="40" width="48" height="14" fill="#3DB7FF"
        stroke="#1A1A2E" stroke-width="2"/>
  <!-- silhouette in ink -->
  <path d="M18 32 L28 16 L38 32 Z" fill="#FF4FA3" stroke="#1A1A2E" stroke-width="2"
        transform="rotate(-8 28 24)"/>
  <circle cx="46" cy="22" r="7" fill="#FFE15B" stroke="#1A1A2E" stroke-width="2"/>
</svg>
```

**Rules:**
- Paper plate with one big round corner and one sharp diagonal, 2.5px ink stroke
- Flat geometric shapes in 2–3 clashing brights, each with its own 2px ink stroke
- Exactly one shape rotated
- No gradients, no shadows inside the SVG

### Widget thumbnail
- 480×480 with outline + asymmetric-corner + flat-block language preserved
- Replace numbers with em-dash `—` in Fraunces italic 900
- Rotate the accent recipe by tile index so the shelf clashes properly

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Gallerist with a wink.** "A new piece." "Collection 042."
- **Italian flourish.** "Milano", "numero", piece numbers on everything.
- **Showroom verbs.** "Unveil", "exhibit", "retire" instead of "create", "show", "delete".
- **Confidently silly.** Copy can grin; it never mumbles.

### Common mistakes
- Pure black instead of navy ink `#1A1A2E`
- Missing outlines — an element without its ink stroke is naked
- Symmetric rounded corners everywhere — the asymmetry IS the theme
- Blurred shadows or glows — Memphis light is flat
- Pastel or desaturated accents — the brights stay loud
- Tasteful monochrome restraint — that's Neo Brutalist, not Memphis
- Rotating everything — one wonky element per composition

### Ship checklist
- [ ] Every card/button/chip/input has its navy ink outline
- [ ] Asymmetric corners on all featured surfaces (24/4, 20/4, 14/4, 8/2)
- [ ] Headlines Fraunces italic 900; emphasis words pink
- [ ] Body Space Grotesk; micro-labels DM Mono UPPER
- [ ] Accents used as flat blocks; two clashing per surface, ink between them
- [ ] Yellow = busy, mint = done, pink = hot/error, sky = cool structure
- [ ] Exactly one rotated element per composition
- [ ] No black, no gradients, no blur, no grey
- [ ] App icons: outlined flat shapes, one rotated, clashing brights

> Gut-check: if Ettore Sottsass would call it sensible, add another squiggle. If it could sit on the Carlton shelf, ship.
