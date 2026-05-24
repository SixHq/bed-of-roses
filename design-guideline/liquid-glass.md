# Liquid Glass — Theme Handbook

> Frosted refraction over saturated photographic backdrops. Italic Instrument Serif headlines.
> A soft little OS held up to the light.

---

## 1. Mood & philosophy

Liquid Glass is the **Apple Vision-era, weightless, refractive** register. Every surface is a frosted glass pane floating in front of a saturated chromatic backdrop. The world behind bleeds through; specular top-light makes each plate read like a real object.

**Build for:** Apple-fluent users; people who own a Vision Pro or wish they did; minimalists who still want color.

**Tonal anchors:** Vision Pro home view, frozen pond at dawn, frosted cocktail glass, the iOS 18 Control Center.

If your design lays flat or matte, you've drifted. Add specular, add saturation behind glass.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--ink` | `#0B0F19` | Body / on-glass dark text |
| `--on-glass` | `#0E1426` | Primary text on light glass |
| `--on-glass-muted` | `rgba(14,20,38,.62)` | Body on light glass |
| `--on-dark` | `#FFFFFF` | Text on dark glass |
| `--on-dark-muted` | `rgba(255,255,255,.78)` | Body on dark glass |
| `--hairline` | `rgba(255,255,255,.55)` | Glass outline |
| `--hairline-soft` | `rgba(255,255,255,.28)` | Internal |

### Saturated backdrop palette (required behind glass)
Pick one per surface — glass is invisible over flat colors.

| Name | Recipe |
|---|---|
| Aurora | radial pink + violet top-left, sky + cyan bottom-right |
| Dusk | sunset orange top-left, deep violet bottom-right |
| Sea | aqua top-left, cyan + green bottom-right |

### Glass recipe (the soul)
```css
.glass {
  background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.08));
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  border: 1px solid rgba(255,255,255,.45);
  border-radius: 28px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.85),
    inset 0 -1px 0 rgba(255,255,255,.18),
    0 30px 60px -20px rgba(0,0,0,.55),
    0 8px 24px -8px rgba(0,0,0,.35);
}
/* the specular top highlight */
.glass::after {
  content:''; position: absolute;
  left: 8%; right: 8%; top: 6%; height: 34%;
  border-radius: 50% / 100%;
  background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
  pointer-events: none;
}
```

### Type
- **Display** — `Instrument Serif`, italic-capable, weight 400
- **UI** — `Inter Tight`, weight 400/500/600/700
- **Mono** — `JetBrains Mono`, weight 400/500

| Class | Size / Line | Use |
|---|---|---|
| `.lg-h1` | 120 / .92 / -.025em italic (Instrument Serif) | Hero |
| `.lg-h2` | 48 / 1.02 / -.02em italic | Section |
| `.lg-h2-sans` | 34 / 1.05 / -.025em (Inter Tight 600) | Section, sans variant |
| `.lg-h3` | 18 / 1 / -.01em (Inter Tight 600) | Sub |
| `.lg-display` | 17 / 1.5 (Inter Tight 400) | Display body |
| `.lg-body` | 14 / 1.6 | Body |
| `.lg-mono` | 11 / .06em (mono 500) | Metadata |
| `.lg-eyebrow` | 11 / .22em UPPER (mono 500) | Eyebrows |

### Radii (generous)
- Buttons: 999 (pill)
- Cards / tiles: 22–28
- Modals: 28
- Chat bubbles: 22

### Motion
- Hover: `filter: brightness(1.1)` — subtle, glass reacts to light
- Press: brightness 0.94 + 1px down
- 250ms ease-out — glass is *unhurried*

---

## 3. Layout & screen orientation

### Page
**A saturated backdrop is mandatory.** Either a stock Aurora/Dusk/Sea gradient (use the recipes in `liquidglass/kit.jsx`), a photo, or a user-set wallpaper. Without a backdrop, glass disappears.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: 16px;
  padding: 96px 28px 132px;
}
```
Tiles are independent glass plates floating on the wallpaper. Don't fight gravity — let them drift on the saturated bg.

### App modal
- 920×680, glass recipe (the full one), 28px radius
- Backdrop: `rgba(0,0,0,.4)` + `backdrop-filter: blur(8px)` — glass-on-glass
- Opens at 320ms ease-out from `translateY(20px) scale(0.96)`

---

## 4. Component handbook

### Button — primary (white glass pill)
```html
<button class="lg-btn lg-btn-pri">Begin</button>
```
```css
.lg-btn-pri {
  background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.7));
  color: var(--on-glass);
  border-color: rgba(255,255,255,.7);
  height: 46px; padding: 0 22px;
  border-radius: 999px;
  font-weight: 500;
  font-size: 14px;
  border: 1px solid rgba(255,255,255,.45);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.85),
    inset 0 -1px 0 rgba(255,255,255,.15),
    0 12px 24px -8px rgba(0,0,0,.45);
  position: relative;
  overflow: hidden;
}
.lg-btn-pri::before {
  /* same 38% highlight as glass card */
  content:''; position: absolute; left: 8%; right: 8%; top: 6%; height: 38%;
  border-radius: 50% / 100%;
  background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
}
```
Variants: `.lg-btn-cool`, `.lg-btn-warm` (tinted glass with cool/warm chroma), `.lg-btn-ghost` (almost transparent).

### Field
- 46px tall, 999 radius, glass-light recipe
- Inset top highlight + 1px white border
- Focus: outer 3px white glow `0 0 0 3px rgba(255,255,255,.45)`

### Chip
- 30px tall, 999 radius, glass recipe with `backdrop-filter: blur(16px)`
- Specular ::before highlight applied
- On: white glass with on-glass text

### Tile — glass plate
Glass recipe at 22px radius. Inside: meta top-left in mono on-dark-muted, hero number bottom-left in Instrument Serif italic 54px in white.

### Chat bubble
- User: white glass pill (`.lg-btn-pri` recipe), on-glass text
- AI: standard glass with `::after` highlight
- AI name in mono UPPER 11 .12em / on-dark-muted

### Chat bar
Glass plate at 999 radius, top highlight, white glass send button.

### Modal
Full glass recipe at 28px radius. Header has a 1px white hairline-soft divider.

---

## 5. App handbook — "Today" (Notes as a daily letter)

In Liquid Glass, Notes is called *Today* and each note is a letter to yourself.

### Frame
```html
<div class="glass" style="border-radius:28px">
  <header class="modal-head">
    <h1 class="lg-h2"><i>Today</i></h1>
    <button class="lg-btn lg-btn-pri">＋ New letter</button>
  </header>
  <main>…</main>
</div>
```

### Layout
- Single column app (not split) — center column max-width 680px
- The list of past letters is a glass card *below* the active letter, scrollable
- Padding 40px top/bottom, 32px sides

### Past letters list
Each item is a small glass card, 60px tall, with date (mono UPPER) + first line (italic Instrument Serif) on the same row. Hover: brightness 1.08. Selected: white glass.

### Editor
- Title: Instrument Serif italic 64px (yes, that big), contenteditable, no background
- Body: Inter Tight 17/26, max-width 56ch
- Caret is a soft white block

### Empty
Italic Instrument Serif, 32px: *"A small letter."* — centered, faded.

### Working
Title's italic phrase gets a soft pulsing underline (white at 45% opacity, 2px). The whole glass card breathes (opacity 0.95 → 1.0) at 2.4s.

---

## 6. Widget handbook — Weather

### Markup
```html
<article class="glass" data-size="1x1" style="border-radius:22px">
  <span class="lg-mono">lagos</span>
  <div>
    <span style="font-family:var(--display); font-style:italic; font-size:54px">18°</span>
    <span style="font-family:var(--sans); font-weight:500">partly cloudy</span>
  </div>
</article>
```

### Sizing & padding
- 22px radius (uniform), 14px padding
- Glass recipe + specular ::after highlight applied

### Type
- Number: Instrument Serif italic 54px / white
- Sub: Inter Tight 500 / 14px / on-dark-muted
- Meta: mono 10 / .14em / lowercase / on-dark-muted

### Color
- Tile bg is the glass recipe (don't fill)
- Optionally tint with `--glass-tint-cool` or `--glass-tint-warm` overlays for state communication

### States
- **Empty:** italic *"Set a place"*
- **Live:** as above
- **Working:** number wrapped in a slow opacity pulse (0.6 → 1.0 over 2.4s)

### Variant: 2x1 (flight)
Two IATA codes Instrument Serif italic 36px, dashed white connector, mono caption below

### Variant: 2x2 (week ahead)
Number + 5-day strip + low-contrast line chart (white at 30%)

### Don'ts
- Don't put glass on a flat color — needs saturated backdrop
- Don't forget the `::after` highlight — flat glass reads as a sticker, not glass
- Don't use Helvetica or Inter for the hero — italic Instrument Serif is signature

---

## 7. Icons & marks

### App icon — 64 × 64 (frosted dome)
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <defs>
    <linearGradient id="lgls" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,.6)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,.18)"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="18"
        fill="url(#lgls)" stroke="rgba(255,255,255,.7)"/>
  <!-- inner colored core -->
  <rect x="10" y="10" width="44" height="44" rx="12"
        fill="linear-gradient(180deg, var(--c1), var(--c2))"/>
  <!-- silhouette in white -->
  <path d="M22 22 H40 L44 26 V46 H22 Z" stroke="#fff" stroke-width="1.6" fill="none"/>
  <!-- top-light specular -->
  <ellipse cx="22" cy="14" rx="16" ry="6" fill="rgba(255,255,255,.55)"/>
</svg>
```

**Rules:**
- Outer plate is glass (18px radius, gradient fill)
- Inner colored core uses two genre-specific stops
- Silhouette in white stroke
- Top-left specular ellipse mandatory
- Drop shadow on the SVG itself for the float

### Widget thumbnail
- 480 × 480, glass card recipe baked
- Saturated backdrop visible at the edges
- Numbers replaced with `—` in italic Instrument Serif

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Calm Apple.** *"Weightless."* *"One moment."* *"Already on it."*
- **Italic noun phrases.** *Today.* *A small letter.* *One small thing.*
- **No emoji except ✿ in chrome.**
- **Naming things lightly.** Notes → *Today*. Files → *Library*. Music → *Listening*.

### Common mistakes
- ❌ Glass on a flat color — make sure the backdrop is saturated
- ❌ Missing the `::after` top highlight — glass needs gloss
- ❌ Square corners — every shape is generously rounded
- ❌ Helvetica for the hero — Instrument Serif italic only
- ❌ Solid white surfaces — even "white" buttons have a glass recipe

### Ship checklist
- [ ] Saturated backdrop behind every glass surface (Aurora/Dusk/Sea or photo)
- [ ] Every glass surface has the `::after` specular highlight
- [ ] Buttons are pills (999 radius)
- [ ] Hero text is Instrument Serif italic
- [ ] Body text in Inter Tight
- [ ] Mono labels lowercase 10/.14em (not UPPER — glass is softer)
- [ ] Drop shadow on every glass surface (the long 30px shadow, not contact)
- [ ] App icons are glass plates with inner colored core
- [ ] Widget thumbnail has the saturated bg visible at edges

> Gut-check: if Tim Cook would put it on a WWDC slide, ship.
