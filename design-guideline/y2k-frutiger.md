# Y2K / Frutiger Aero — Theme Handbook

> Translucent gel surfaces, sky-gradient backdrops, lime accents, water droplets.
> A soft little OS that grew up watching trailers on a Sony VAIO.

---

## 1. Mood & philosophy

Y2K is the **optimistic, glassy, 2003-corporate-but-make-it-cute** register. Every surface is a gel pill or a frosted plate. Every button has a hard top-light specular highlight and a soft drop shadow. The sky is always blue. The plants are always lime.

**Build for:** users who remember the early aughts fondly; people who like Aqua, AOL Instant Messenger, and the original iPod nano.

**Tonal anchors:** Windows XP wallpaper "Bliss", Sony VAIO 2003, the iPod nano gen 2, the Aqua dock circa 2002.

If your design starts to feel matte or analog, you've drifted. Push back toward *gloss*.

---

## 2. Tokens

### Surfaces
| Var | Hex / Gradient | Use |
|---|---|---|
| `--sky-1` | `#9ED6FF` | Top of sky gradient |
| `--sky-2` | `#3BA8FF` | Middle of sky |
| `--sky-3` | `#0066FF` | Bottom of sky |
| `--aqua` | `#00D5FF` | Aqua accent |
| `--lime` | `#A8E063` | Lime mid |
| `--lime-deep` | `#5FC92F` | Lime bottom of gel |
| `--silver` | `#C8D6E5` | Silver bottom of chrome |
| `--silver-2` | `#E6EEF6` | Silver mid |
| `--white` | `#FFFFFF` | Top of gel highlights |
| `--ink` | `#0A2A4D` | Text (a deep navy, never black) |

### Gradient recipes (memorize)
- **Sky** — `linear-gradient(180deg, #BFE7FF 0%, #7FC8FF 35%, #3BA8FF 75%, #0066FF 100%)`
- **Sky soft** — `linear-gradient(180deg, #E5F4FF 0%, #BFE7FF 60%, #9ED6FF 100%)`
- **Gel blue button** — `linear-gradient(180deg, #7FC8FF 0%, #3BA8FF 50%, #0066FF 50.1%, #003FA8 100%)` (note the 50% → 50.1% hard break — *the* defining detail)
- **Gel lime** — `linear-gradient(180deg, #D6FF9D 0%, #A8E063 50%, #5FC92F 50.1%, #3FA017 100%)`
- **Gel silver** — `linear-gradient(180deg, #FFFFFF 0%, #E1E9F2 50%, #C8D6E5 50.1%, #92A8C2 100%)`

### Type
- **Display** — `Sora`, weight 700/800
- **UI** — `Inter`, weight 400/500/600/700
- **Mono** — `JetBrains Mono`, weight 400/500

| Class | Size / Line | Use |
|---|---|---|
| `.y-h1` | 88 / .95 / -.04em (800) | Hero |
| `.y-h2` | 36 / 1.05 / -.025em (700) | Section |
| `.y-h3` | 22 / 1 / -.015em (700) | Sub |
| `.y-display` | 17 / 1.5 / Inter | Body display |
| `.y-body` | 14 / 1.6 / Inter | Body |
| `.y-mono` | 11 / .05em / mono | Metadata |
| `.y-eyebrow` | 11 / .2em UPPER (Sora 600) | Eyebrows |

### Spacing
4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Generous around gel buttons (they need air).

### Radii
- Buttons: **999** (every button is a pill — always)
- Cards: 16
- Bars/inputs: 999 (also pills)
- Modal: 20

### Shadows — gel recipe
```css
/* Gel button shadow */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.95),  /* top highlight */
  inset 0 -2px 0 rgba(0,30,90,.5),       /* bottom darken */
  0 8px 16px -2px rgba(0,40,120,.4),     /* drop shadow */
  0 1px 2px rgba(0,40,120,.3);           /* contact shadow */
```

```css
/* Glass card shadow */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.9),
  inset 0 -10px 24px rgba(0,102,255,.08),
  0 18px 40px -12px rgba(0,40,120,.28),
  0 2px 6px rgba(0,40,120,.18);
```

### Motion
- Hover: brightness 1.06, no transform
- Press: brightness 0.94 + 1px down
- 150ms ease-out — Y2K's transitions are *snappy*, not lazy

---

## 3. Layout & screen orientation

### Page background
Sky gradient is the page bg. Not optional. Add `<canvas>` motes if you want bokeh.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: 220px;
  gap: 14px;
  padding: 88px 20px 132px;
}
```
Tiles float on the sky — glass cards.

### App modal
- 920×680, glass background (`backdrop-filter: blur(40px) saturate(1.8)`), 16px radius, dual-inset highlight + dual outer shadow
- Backdrop: darken sky to 30% saturation, blur 12

### Mobile breakpoint
≤ 600px: grid 1 col, tiles still glass, padding tightens to 14px. **Keep the sky gradient on mobile** — it's the spine.

---

## 4. Component handbook

### Button — gel (the canonical recipe)
```html
<button class="gel">▶ Get Started</button>
```
```css
.gel {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border-radius: 999px;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 14px;
  border: 1px solid rgba(255,255,255,.7);
  background: var(--gel-blue); /* the gradient */
  color: #fff;
  cursor: pointer;
  box-shadow: /* gel button shadow recipe above */;
  text-shadow: 0 1px 0 rgba(0,30,90,.35);
}
.gel::before {
  content: '';
  position: absolute;
  left: 6px; right: 6px; top: 3px; height: 42%;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.15));
  pointer-events: none;
}
```
The **::before with the 42%-height highlight** is the soul of Y2K. Don't skip it.

Variants: `.gel-lime`, `.gel-silver`, `.gel-aqua`, `.gel-ghost` (transparent with light glass).

### Field
```html
<input class="y-input" placeholder="enter your handle…" />
```
- 44px tall, 999 radius, gel-light background (`linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.7))`)
- Inset top shadow + 1px white border
- Focus: outer 3px aqua glow `0 0 0 3px rgba(0,213,255,.45)`

### Chip — gel pill
30px tall, 999, gel-light bg, 1px white border, soft drop. On: gel-blue background.

### Tile — glass
Glass card recipe (not gel button). Background can be tinted with a gradient overlay; the highlight ::before still applies. Inside: tile-meta top-left (mono), big number bottom-left.

### Chat bubble
- User: gel-blue background, white text, 999 bottom-right squared to 6px
- AI: glass-light, ink text, 999 bottom-left squared to 6px
- Both have the top-light ::before

### Chat bar (gel pill)
The whole bar is a glass pill. The input is transparent inside it. Send button is a small gel circle.

### Modal
Glass card recipe at 20px radius. Header divider is a 1px white hairline.

---

## 5. App handbook — "My Stuff" (Files)

Y2K loves friendly names — *My Stuff*, *My Music*, *My Day*. Use them.

### Frame
```html
<div class="y-modal">
  <header class="y-modal-head">
    <span class="y-h3">My Stuff</span>
    <button class="gel gel-sm">＋ New</button>
    <button class="gel gel-sm gel-ghost">×</button>
  </header>
  <main class="y-app-body">…</main>
</div>
```

### Layout
- Sidebar 170px + content
- Sidebar: glass card with 5 gel pill buttons (Home, Today, Photos, Music, Network) — the selected one is `.gel`, the others are `.gel-ghost`
- Content: glass card holding a grid of folder cards

### Folder card
```html
<div class="folder-card">
  <div class="folder-icon"></div>
  <span class="folder-name">Today</span>
</div>
```
- Folder icon is a 60×48 gel-tab rectangle with a small folded tab on top (use a 8px×12px ::before)
- Each folder is colored — pick from blue/lime/pink/sky/grape

### Empty
Glass card centered, "*Drop something here to get started*" in italic Inter, with a small lime gel arrow pointing down.

### Working
A horizontal lime gel progress bar inside the glass card, with `42%` text on the right.

---

## 6. Widget handbook — Weather

### Markup
```html
<article class="glass" data-size="1x1">
  <span class="y-mono">Lagos</span>
  <div>
    <span class="hero-num">18°</span>
    <span style="font-family:var(--sans); font-weight:600; color:var(--sky-3)">partly cloudy</span>
  </div>
</article>
```

### Sizing
- 16px tile radius, glass card recipe
- 220×220, 14px padding

### Type
- Number: Sora 800 / 42–54px, ink color
- Subtitle: Inter 600 / 14px / sky-3 (the dark sky blue)
- Meta: mono 11 / .05em / lowercase / ink-2

### Color
- Glass-light bg by default
- For specific weather: tint the tile bg with the gel gradient appropriate to the condition
  - Sunny: `gel-lime` lite (lighten to 18% opacity)
  - Rainy: `gel-blue` lite
  - Snowy: `gel-silver` lite

### States
- **Empty:** `glass-ghost` tile, italic "*Set a place*" in sky-3
- **Live:** as above
- **Working:** number replaced with a lime gel pulse (3 dots that wave left-right)

### Variant: 2x1 (flight)
- Gel-blue tile, white text, two IATA codes corner-to-corner, dashed white connector

### Variant: 2x2 (week ahead)
- Glass card + 5-day strip + lime gel progress meter showing forecast confidence

### Don'ts
- Don't use flat colors on tiles — every tile is a gradient
- Don't forget the `::before` highlight — gel without highlight is dead gel
- Don't use Helvetica or anything matte — Sora and Inter only

---

## 7. Icons & marks

### App icon — 64 × 64 (gel orb)
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <defs>
    <radialGradient id="orb-blue" cx="32%" cy="28%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="22%" stop-color="#9ED6FF"/>
      <stop offset="55%" stop-color="#3BA8FF"/>
      <stop offset="100%" stop-color="#003FA8"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="28" fill="url(#orb-blue)"/>
  <!-- glossy highlight -->
  <ellipse cx="26" cy="20" rx="14" ry="6" fill="rgba(255,255,255,.85)"/>
  <!-- silhouette in white -->
  <path d="M18 18 H42 L46 22 V46 H18 Z"
        fill="none" stroke="#fff" stroke-width="2"/>
</svg>
```

**Rules:**
- Always a perfect orb, not a rounded square
- Radial gradient: white top-left → mid color → deep color bottom-right
- Highlight ellipse top-left (mandatory)
- Silhouette in white stroke

### Widget thumbnail
- 480 × 480, glass card recipe
- Replace numbers with `--`, italic style
- Sky gradient page bg behind the card

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Optimistic.** "*Welcome aboard.*" "*You're online.*" "*Looking good.*"
- **Soft glyphs OK.** ★ ♪ ✿ used sparingly
- **Exclamation points: max one per screen.**
- **First person plural welcome.** "*We pinned a flight tracker.*" Cute, not corporate.

### Common mistakes
- ❌ Flat backgrounds — every surface is a gradient
- ❌ Missing the top highlight ::before — gel needs gloss
- ❌ Square buttons — buttons are pills
- ❌ Pure black text — use deep navy `--ink`
- ❌ No outer shadow — gel without drop shadow looks pasted on
- ❌ Forgetting the sky bg on mobile

### Ship checklist
- [ ] Page bg is the sky gradient
- [ ] Every gel button has the `::before` highlight at 42% height
- [ ] Every button is a pill (999 radius)
- [ ] Tiles are glass cards (recipe applied, not just a rounded box)
- [ ] Hero numbers in Sora 800
- [ ] Body in Inter
- [ ] Headlines have soft text-shadow for blue depth
- [ ] App icons are orbs, not squares
- [ ] Widget tiles tinted with appropriate gel gradient
- [ ] No matte / flat surfaces anywhere

> Gut-check: would this fit on a Best Buy ad from 2004 next to a silver Sony VAIO? If yes, ship.
