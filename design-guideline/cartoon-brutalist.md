# Cartoon Brutalist — Theme Handbook

> Heavy 3px ink strokes, hard offset shadows (no blur), saturated pop palette on cream.
> A soft little OS that wears a sticker on its lapel.

---

## 1. Mood & philosophy

Cartoon Brutalist is the **loud, friendly, sticker-energy** register. Where Bloom whispers, Cartoon Brutalist shouts in a fun way. Everything is opaque flat color, every container has a thick black stroke, every elevation is a hard offset shadow with no blur.

**Build for:** users who want their tools to feel like a Tumblr dashboard from 2014, a Casetify phone case, or a Risograph poster — playful, primary, hand-stamped energy.

**Tonal anchors:**
- A puffy sticker on a notebook
- A children's-book illustration done with a 1mm fineliner
- An MTV bumper, 1992
- A bag of jelly beans

If your design starts to feel sleek or quiet, you've drifted. Push back toward *loud*.

---

## 2. Tokens

All tokens are inlined in `Bed of Roses — Cartoon Brutalist.html` and in `brutalist/kit.jsx`. Read them from CSS variables; don't paste hex codes into JS styles.

### Surfaces (light, opaque)
| Var | Hex | Use |
|---|---|---|
| `--cream` | `#FFF4DC` | Page background |
| `--paper` | `#FFFAF0` | Cards, buttons, surfaces |
| `--ink` | `#0A0A0A` | All strokes + ink text |
| `--ink-2` | `#2A2620` | Walnut, used very rarely |

### Pop accents (use freely, never blend)
| Var | Hex | Notes |
|---|---|---|
| `--pink` | `#FF4FA3` | Stickers, "default" tags, primary fun |
| `--yellow` | `#FFD93D` | CTAs, chat-bar background |
| `--sky` | `#6BCEFF` | Chat user bubbles, secondary tiles |
| `--mint` | `#5FE3A1` | Affirmative, "done" states |
| `--purple` | `#9B5DE5` | Eyebrows, rare emphasis |
| `--tomato` | `#FF6B45` | Alert (not error — alerts are still fun) |
| `--lilac` | `#C4A8F0` | Decorative |

### Strokes (the whole show)
| Var | Value | When |
|---|---|---|
| `--stroke-thin` | `2px solid var(--ink)` | Chips, small tags |
| `--stroke` | `3px solid var(--ink)` | Everything else |
| `--stroke-fat` | `4px solid var(--ink)` | Avatar, big stamps |

### Shadows — hard offset, no blur
| Var | Value | Use |
|---|---|---|
| `--pop-1` | `4px 4px 0 0 var(--ink)` | Chips |
| `--pop-2` | `6px 6px 0 0 var(--ink)` | Buttons, cards |
| `--pop-3` | `8px 8px 0 0 var(--ink)` | Tiles, modals |
| `--pop-4` | `10px 10px 0 0 var(--ink)` | Hero stamps |

**Rule:** the shadow color is always `--ink` — except on a sticker, where it's the *opposite* pop color (pink shadow on yellow card, yellow shadow on pink card).

### Type
- **Display** — `Archivo Black` (only weight). Always uppercase.
- **Sub display** — `Bricolage Grotesque` weight 700/800.
- **UI** — `Space Grotesk` weight 400/500/600/700.
- **Mono** — `Space Mono` weight 700.

Headlines never use sentence case — they shout. UI body stays mixed-case.

| Class | Size / Line | Use |
|---|---|---|
| `.br-h1` | 84 / .92 / -.02em UPPER | Hero |
| `.br-h2` | 48 / .95 / -.02em UPPER | Section titles |
| `.br-h3` | 32 / 1 / -.02em (Bricolage 800) | Sub-section |
| `.br-display` | 24 / 1.05 / -.015em (Bricolage 700) | Tile titles |
| `.br-body` | 16 / 1.45 / Space Grotesk 500 | Body |
| `.br-tag` | 11 / .12em UPPER (Space Mono 700) | Tile meta |
| `.br-eyebrow` | 13 / .18em UPPER (Space Mono 700) | Section eyebrows |

### Spacing
4px base. Use 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Generous gaps — buttons in rows get 14px gap, cards 12px.

### Radii (asymmetric)
- Buttons: 14px (sometimes asymmetric `14px 4px 14px 4px`)
- Cards / tiles: 18px (square corners are intentional in some places)
- Chips: 999px (pill)
- Avatar: 50% (perfect circle, but stroke is 4px so it reads as a stamp)

### Motion
- Hover: lifts up-left 2px, shadow grows from 6/6 to 8/8 — `transition: transform .12s, box-shadow .12s`.
- Press: pushes down-right 2px, shadow shrinks to 2/2.
- Never use blur, opacity-fade, or sliding for state changes. Things *clack*.

---

## 3. Layout & screen orientation

### Z-stack (same as Bloom, but flatter)
| z | Layer |
|---|---|
| 0 | Page background (cream) |
| 1 | Screens |
| 5 | Home chrome (wordmark in stroke-edged pill) |
| 6 | Chat bar (chunky yellow pill) |
| 100 | Modal |

No ambient field, no HUD layer (the corner stickers replace it).

### Home grid
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: 220px;
  gap: 14px;
  padding: 80px 20px 110px;
}
```

### App modal
- 960×720 max, `--paper` background, 3px ink stroke, 22px radius, `--pop-4` shadow
- Backdrop: `rgba(10, 10, 10, .55)` — opaque, no blur (Cartoon Brutalist doesn't blur)
- Open animation: 280ms snap from `translateY(20px) rotate(-1deg)` to `translateY(0) rotate(0)` — a slight comedy tilt as it lands

### Mobile breakpoint
≤ 600px: home grid → 150px columns, padding tightens to 14px. Stickers stay rotated; they look better small.

### Safe areas
Honor `env(safe-area-inset-*)`. The chat bar gets `+ env(safe-area-inset-bottom)` added to its bottom inset.

---

## 4. Component handbook

### Button
```html
<button class="br-btn br-btn-pri">▸ Begin</button>
```
```css
.br-btn {
  height: 54px;
  padding: 0 22px;
  font-family: var(--grotesque);
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -.005em;
  text-transform: uppercase;
  border: var(--stroke);
  border-radius: 14px;
  background: var(--paper);
  box-shadow: var(--pop-2);
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease;
}
.br-btn:hover { transform: translate(-2px,-2px); box-shadow: 8px 8px 0 0 var(--ink); }
.br-btn:active { transform: translate(2px,2px); box-shadow: 2px 2px 0 0 var(--ink); }
```
Variants by background color: `.br-btn-pri` (ink/cream inverted), `.br-btn-yel`, `.br-btn-pink`, `.br-btn-sky`, `.br-btn-mint`, `.br-btn-ghost`.

Disabled: opacity .3, hover/press disabled, cursor not-allowed.

### Field
```html
<div class="br-field">
  <label>Your key <span class="br-sticker br-sticker-mint">focused</span></label>
  <input class="br-input br-input-focus" type="password" />
</div>
```
- Label is mono 700 / .14em uppercase
- Input: 56px tall, `--paper` background, 3px stroke, 14px radius, 6/6 shadow
- Focus state: shadow turns pink with a 3px ink underlay (`6px 6px 0 var(--pink), 6px 6px 0 3px var(--ink)`) and bg shifts to a faint pink wash

### Chip
38px tall, pill, 2px stroke, 3/3 shadow. Selected: bg flips to a pop color (`--yellow` for "concise", `--pink` for "starred").

### Sticker
The signature decoration. Use these as tags, status, and accents.
```html
<span class="br-sticker br-sticker-pink">★ NEW</span>
```
- 5–11px padding, 2px stroke, pill, mono 700 / .12em uppercase
- **Always rotated ±2–6°** — never axis-aligned
- 2/2 shadow

### Tile
```html
<div class="br-tile" data-size="1x1" style="background: var(--sky)">
  <span class="br-tile-meta">weather · lagos</span>
  <div>
    <span class="br-tile-title">18°</span>
    <span style="opacity:.7">cloudy</span>
  </div>
</div>
```
- 3px stroke, 18px radius, 6/6 ink shadow
- The whole tile is colored — pick from the pop palette, not paper
- Hover: lifts -2/-2 with 8/8 shadow

### Chat bubble
- User: yellow background, ink stroke, ink text, bottom-right corner squared 6px
- AI: paper background, named with display text "★ Rose" in pink at top, body in body weight
- Bubbles always have a 6/6 ink shadow

### Chat bar (chunky yellow pill)
- Yellow background, 3px ink stroke, 22px radius, 8/8 ink shadow
- Input is transparent, 18px Bricolage 600
- Send button: 50px circle, ink fill, cream arrow, double-ring shadow (`3px 3px 0 var(--cream), 3px 3px 0 3px var(--ink)`)

### Modal
- 3px stroke, 22px radius, 10/10 shadow
- Header: 60px tall, divider is a 2px ink line (no soft hairline), title in Archivo Black 22px UPPER

---

## 5. App handbook — building Notes

### Frame
```html
<div class="br-modal-frame">
  <header class="br-modal-head">
    <h1 class="br-h3">NOTES.</h1>
    <button class="br-btn br-btn-pink" style="height:38px">+ NEW</button>
    <button class="br-icon-btn">×</button>
  </header>
  <main>...</main>
</div>
```

### Layout
- Two columns: 220px list / editor
- Vertical divider: a 3px ink line (not hairline)
- List background: paper, editor: cream
- Padding 20px each column

### List item
```html
<button class="note-item br-card">
  <span class="br-display" style="font-size:18px">A slow Sunday</span>
  <span class="br-tag" style="opacity:.7">2 min · 14:32</span>
</button>
```
- 3px stroke, 14px radius, 4/4 shadow
- Selected: shadow flips to yellow `(4px 4px 0 var(--yellow))` and a sticker reading `★ open` appears top-right rotated -4°
- Hover: lifts 2px

### Editor
- Title is `<h1 contenteditable>` styled `.br-h2` (48px Archivo Black UPPER) — yes, the user types in shouty caps; that's the theme's promise
- Body: `<div contenteditable class="br-body">` at 17px / 1.6, Space Grotesk 500
- Cursor color is pink

### Empty state
A single sticker at center: `★ NOTHING YET — TAP +` rotated -3°. No other UI.

### Working
The title's first letter becomes a spinning circle (the same border-spin used on the working screen) while the AI regenerates. Body fades to .6 opacity.

---

## 6. Widget handbook — building Weather

### Markup
```html
<article class="br-tile" data-size="1x1" style="background: var(--sky)">
  <span class="br-tile-meta">WEATHER · LAGOS</span>
  <div>
    <span class="br-tile-title" style="font-size:36px">18°</span>
    <span class="br-tile-meta" style="opacity:.7">CLOUDY</span>
  </div>
</article>
```

### Sizing & padding
- 220×220 at 1×1, 16px internal padding
- Meta sits flush top-left, big number bottom-left

### Type
- Number: Archivo Black, 36–48px, UPPER (numbers don't have case but it sets the visual register)
- Caption: Space Mono 700, 10px, .14em, UPPER, opacity .7

### Color
- Whole tile is colored — sky for weather, yellow for flights, mint for calendar, pink for messages
- Never use paper as the main tile background; that reads as empty

### States
- **Empty:** Sticker reading `★ ADD A PLACE` rotated -3° at center, tile remains sky
- **Live:** as above
- **Working:** number is replaced with a 3-dot bounce `● ● ●` in ink

### Variant: 2x1
- Number on left, five-day strip on right
- Each day is a 36×56 paper sticker rotated alternately ±3°
- Day initial in Archivo 16px UPPER, number in Space Grotesk 700 14px

### Variant: 2x2
- Number + 5-day strip + a thick-step line chart at bottom (3px ink stroke, no fill)

### Don'ts
- Don't use opacity-fade for hover — the hover is a *clack* (transform + shadow shift)
- Don't add a drop shadow with blur — Cartoon Brutalist shadows are 0-blur
- Don't put a weather icon on the tile — the prose says it

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <rect x="3" y="3" width="58" height="58" rx="14"
        fill="var(--yellow)" stroke="var(--ink)" stroke-width="3"/>
  <!-- silhouette in ink, 3px stroke, round caps -->
  <path d="M18 18 H42 L46 22 V46 H18 Z M38 18 V24 H44"
        fill="none" stroke="var(--ink)" stroke-width="3"
        stroke-linejoin="round" stroke-linecap="round"/>
</svg>
```

**Rules:**
- Plate is a pop color (rotate genres through pink / yellow / sky / mint / purple)
- 3px ink stroke around the plate AND around the silhouette
- No accent dot — the bright fill *is* the accent
- 14px corner radius (consistent with cards)

### Widget thumbnail
- 480 × 480, exported on first paint
- Same as live widget but the number replaced with `★` — let the sticker do the talking
- File saved with a 0-blur ink drop shadow baked in if exported for marketplace use

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Caps for headlines.** "BED OF ROSES." "HELLO, FRIEND."
- **Casual mixed case for body.** "I pinned a flight tracker to today."
- **Stickers are part of voice.** `★ NEW`, `★ DEFAULT`, `★ TODAY` — generous, not stingy
- **Exclamation points are allowed but rare.** Once per screen, max.
- **Emoji: only the rose ✿ and the star ★.** No others.

### Common mistakes
- ❌ Soft shadows with blur — Cartoon Brutalist shadows have 0 blur
- ❌ Body text in Archivo Black — that face is for shouting only
- ❌ Translucent surfaces — everything is opaque flat color
- ❌ Sentence-case headlines — they SHOUT
- ❌ Axis-aligned stickers — always rotated ±2–6°
- ❌ Hover that fades opacity — the hover is a clack

### Ship checklist
- [ ] Every stroke is `--stroke` (3px ink)
- [ ] Every shadow is hard offset, 0 blur, ink color (or pop color on stickers)
- [ ] Tile background is a pop color, not paper
- [ ] Headlines uppercase, Archivo Black
- [ ] Body in Space Grotesk
- [ ] Meta labels in Space Mono 700 UPPER .12em
- [ ] At least one sticker on the screen, rotated ±2–6°
- [ ] No drop-shadow blur, anywhere
- [ ] Hover is a clack (transform + shadow shift), not a fade
- [ ] Empty state is a sticker, not a sentence
- [ ] Thumbnail uses `★` placeholder instead of fake data

> Final gut-check: if you put a real puffy sticker over your design, would it feel at home? If yes, ship.
