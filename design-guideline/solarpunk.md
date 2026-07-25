# Solarpunk — Theme Handbook

> Sun-bleached cream, deep leaf-green ink, moss and terracotta. A greenhouse
> OS with daylight in it — technology that reads grown, not manufactured.

---

## 1. Mood & philosophy

Solarpunk is the **optimistic ecological future** register. Every surface looks like it was made by someone who keeps plants alive: warm cream panels like sun-bleached wood, deep leaf-green ink instead of black, moss-filled buttons, terracotta highlights like clay pots on a windowsill. The interface photosynthesizes — soft daylight shadows, dashed botanical rings, pill-round shapes worn smooth like river stones.

**Build for:** users who grow herbs on the balcony, read about passive houses, ride cargo bikes, believe the future is worth wanting.

**Tonal anchors:** a greenhouse at 9am, Studio Ghibli machinery overgrown with vines, seed catalogs, a hand-thrown mug of tea next to a solar monitor.

If your design starts to feel cold, digital, or urgent, you've drifted. Push back toward *warm, grown, unhurried*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--canvas` | `#F5EBCF` | Page background — deep sun-bleached cream |
| `--surface-1` | `#FAF1DB` | Panels, cards, fields (the presence's exact panel color) |
| `--surface-2` | `#FFF7E4` | Brightest sheet — hover, elevated chips |
| `--surface-3` | `#EFE2BF` | Recessed / selected backdrops |
| `--leaf` | `#1F2A1A` | Ink — deep leaf-green, stands in for black everywhere |

### Botanical accents
| Var | Hex | Use |
|---|---|---|
| `--moss` | `#3F5D3A` | Primary action — filled buttons, active states |
| `--terracotta` | `#C66B4A` | Highlight — emphasis words, live readings, warm markers |
| `--terracotta-deep` | `#8B3F22` | Sun-gradient tail, pressed terracotta |
| `--sun` | `#F2D58A` | Sun-gradient head, selection wash |

Moss acts, terracotta highlights, sun warms. Never swap those roles.

### The sun gradient (the signature)
```css
.sun-disc {
  background: radial-gradient(circle at 32% 28%,
    #FFFFFF 0%, #F2D58A 30%, #C66B4A 70%, #8B3F22 100%);
  border-radius: 50%;
  box-shadow: 0 8px 18px rgba(31, 42, 26, 0.18);
}
```
This is the presence orb's exact recipe. Reserve it for solar/energy/live-status motifs — one sun per screen, maximum.

### The dashed orbit (botanical detailing)
```css
.orbit::after {
  content: '';
  position: absolute;
  inset: -12%;
  border: 1px dashed rgba(31, 42, 26, 0.3);
  border-radius: 50%;
}
```
Dashed 1px leaf-green rings around round elements — avatars, gauges, icons. It reads as a trellis, a seed-packet diagram. Use it instead of glows.

### Shadows
Soft, warm, always downward — daylight through glass:
```css
--halo-soft:   0 10px 24px rgba(31, 42, 26, 0.10);  /* chips, fields */
--halo-medium: 0 18px 40px rgba(31, 42, 26, 0.14);  /* cards (presence exact) */
--halo-strong: 0 24px 56px rgba(31, 42, 26, 0.18);  /* modals */
```
Never hard offsets, never cold grey, never glow.

### Type
- **Display** — `DM Serif Display`, italic by default, weight 400
- **Sans** — `Geist`, weight 300/400/500/600
- **Mono** — `JetBrains Mono`, weight 400/500

| Class | Size / Line | Use |
|---|---|---|
| `.sp-h1` | 56 / 1.02 italic (DM Serif 400) | Hero |
| `.sp-h2` | 40 / 1.05 italic (DM Serif 400) | Section |
| `.sp-h3` | 22 / 1.15 (Geist 600) | Sub |
| `.sp-body` | 15 / 1.55 (Geist 400) | Body — always breathes |
| `.sp-mono` | 11 / .08em (mono 500) | Readings, metadata |
| `.sp-eyebrow` | 10 / .18em UPPER (mono 500) moss | Eyebrows |

Emphasis words inside headlines are terracotta italic: `<em>` stays serif, colors `#C66B4A`.

### Radii
- Inputs / single-line fields / buttons: 999 (full pill)
- Textareas: 18
- Cards / tiles: 22
- Modals: 26

### Motion
Unhurried, organic — things grow into place.
- Hover: translateY(-2px), shadow deepens one tier
- Working: slow breath (scale 1 → 1.03 → 1, 1.8s ease-in-out) — the presence's thinking animation
- Durations 200/380/640ms, ease `cubic-bezier(0.32, 0.72, 0, 1)`
- Never: hard snaps, spins, flashes

---

## 3. Layout & screen orientation

### Page background
`--canvas` plus the daylight atmosphere: a sun wash radiating from the top corner, a faint moss breath from below. Never a flat sterile fill.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: 20px; /* generous — beds in a garden, not cells in a table */
  padding: 80px 24px 132px;
}
```

### App modal
- 920×680, `--surface-1` bg, 1px hairline border, 26px radius, `--halo-strong` shadow
- Backdrop: canvas at 60%, no blur

---

## 4. Component handbook

### Button
```html
<button class="sp-btn sp-btn-moss">Plant it</button>
```
```css
.sp-btn {
  height: 44px;
  padding: 0 24px;
  font-family: var(--font-system);
  font-weight: 600;
  font-size: 14px;
  border: 1px solid rgba(31, 42, 26, 0.2);
  border-radius: 999px;
  background: var(--surface-1);
  color: var(--leaf);
  box-shadow: 0 10px 24px rgba(31, 42, 26, 0.10);
  transition: transform .2s, box-shadow .2s;
}
.sp-btn:hover { transform: translateY(-1px); box-shadow: 0 18px 40px rgba(31,42,26,.14); }
.sp-btn-moss { background: var(--moss); border-color: var(--moss); color: var(--surface-1); }
```
One moss button per view — it's the action. Everything else stays cream.

### Field
- 44px tall, 1px hairline border, full pill, `--surface-1` bg
- Focus: moss border + `0 0 0 3px rgba(63,93,58,0.18)` ring
- Placeholder: DM Serif Display italic, `--label-3` — a handwritten label on a seed packet

### Chip
- 28px tall, 1px hairline, pill, mono UPPER eyebrow text
- Selected: sun wash (`--sun` at 60%) with leaf text
- Live/status chips may wear the dashed orbit ring

### Tile
- `--surface-1` bg, 1px hairline, 22px radius, `--halo-soft`
- Hover: lift to `--halo-medium`
- One reading per tile rendered as a serif italic number; caption as moss eyebrow
- A tile representing energy/sun/growth may carry one small sun-disc

### Chat bubble
- User: moss bg, cream text, 20px radius (one bottom corner 6px)
- AI: `--surface-1` bg, 1px hairline, `--halo-soft`, name in DM Serif italic terracotta

### Chat bar
Full pill, `--surface-1`, 1px hairline, `--halo-medium`. Send button is a moss circle.

### Modal
1px hairline, 26px radius, `--halo-strong`. Header title DM Serif italic; divider is the soft hairline, never a hard rule.

---

## 5. App handbook — "The Greenhouse" (Notes as a garden journal)

Frame Notes as a journal kept on a potting bench.

### Frame
```html
<div class="sp-modal">
  <header class="sp-modal-head">
    <h1 class="sp-h2">The <em>Greenhouse</em></h1>
    <span class="sp-eyebrow">Season 03 · Early Spring</span>
    <button class="sp-btn sp-btn-moss" style="height:36px">New entry</button>
  </header>
  <main>...</main>
</div>
```

### Layout
- Two-column: 220px entry list / journal page
- Vertical divider: 1px soft hairline (a pane muntin, not a wall)

### List row
```html
<button class="sp-card">
  <span class="sp-h3" style="font-family:var(--font-display); font-style:italic">Tomatoes, finally</span>
  <span class="sp-eyebrow">Apr 12 · 2 min</span>
</button>
```
Selected: `--surface-3` backdrop + moss left edge (3px inset rule).

### Editor (journal page)
- Title: DM Serif Display italic 400 / 40px
- Body: Geist 400 / 16px / 1.6, max-width 58ch
- A faint dashed vertical rule at the left margin — the seed-row line

### Empty
"*Nothing planted yet.*" in DM Serif italic 22px, centered, `--label-3`. A small dashed circle (empty pot) beneath.

### Working
The sun-disc breathes (scale 1 → 1.03, 1.8s) in the header — photosynthesis in progress.

---

## 6. Widget handbook — Weather as a greenhouse gauge

### Markup
```html
<article class="sp-card" data-size="1x1">
  <span class="sp-eyebrow">weather · lagos</span>
  <div>
    <span style="font-family:var(--font-display); font-style:italic; font-size:48px; color:var(--leaf)">24°</span>
    <span class="sp-mono" style="color:var(--terracotta)">clear morning</span>
  </div>
</article>
```

### Type
- Number: DM Serif Display italic / 48–54px / leaf
- Caption: mono 11 / terracotta when live, moss when calm
- Meta: mono UPPER 10 / .18em / `--label-3`

### Color
- Tile recipes:
  - Cream `--surface-1` + moss eyebrow (default)
  - Sun-washed (`--sun` 40% over surface) + terracotta reading (warm data)
  - Moss bg + cream text (one per grid, maximum — the anchor tile)
- Sun-disc appears only on the energy/UV/solar tile

### States
- **Empty:** italic "*Waiting on the sky.*"
- **Live:** as above; live readings tick in terracotta
- **Working:** the dashed orbit ring rotates slowly around the reading (8s linear)

### Variant: 2x1 (forecast)
Five small dashed circles across the bottom, each filling with sun gradient proportional to the day's warmth; serif italic high/low pairs above.

### Don'ts
- Don't use black or grey — every dark pixel is `--leaf`
- Don't use glows or neon — light here is daylight, not LED
- Don't put two moss-filled elements side by side
- Don't sharpen corners below 18px except inside diagrams

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <!-- cream pot -->
  <rect x="4" y="4" width="56" height="56" rx="18"
        fill="#FAF1DB" stroke="#1F2A1A" stroke-width="1.5"/>
  <!-- dashed orbit -->
  <circle cx="32" cy="32" r="22" fill="none"
          stroke="rgba(31,42,26,0.3)" stroke-width="1" stroke-dasharray="3 4"/>
  <!-- silhouette in leaf ink -->
  <path d="M32 44 V28 M32 34 C26 34 22 30 22 24 C28 24 32 28 32 34
           M32 30 C38 30 42 26 42 20 C36 20 32 24 32 30"
        fill="none" stroke="#1F2A1A" stroke-width="2" stroke-linecap="round"/>
</svg>
```

**Rules:**
- Cream plate, 18px radius, 1.5px leaf stroke
- One dashed orbit ring
- Silhouette in leaf ink, 2px rounded stroke — drawn like a botanical diagram
- At most one terracotta or sun accent dot

### Widget thumbnail
- 480×480 with the cream surface + daylight shadow language preserved
- Replace numbers with em-dash `—` set in DM Serif italic
- Keep one moss element and one dashed ring so the thumbnail reads solarpunk at a glance

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Gardener.** "Planted." "Ready to harvest." "Growing."
- **Seasons and light.** "Early spring", "golden hour", "overcast" as ambient metadata.
- **Growing verbs.** "Plant", "tend", "prune", "harvest" instead of "create", "manage", "delete", "export".
- **Gentle, never urgent.** Errors are weather: "Couldn't reach the network — try again when the signal clears."

### Common mistakes
- Black or cold-grey text — every dark pixel must be leaf-green `#1F2A1A`
- Hard offset shadows or glows — light is soft daylight only
- More than one moss-filled action per view
- Sun gradient used decoratively on non-solar elements
- Cramped line-height — solarpunk body always breathes (1.5+)
- Sterile flat backgrounds — the canvas always carries the sun wash

### Ship checklist
- [ ] Headlines in DM Serif Display italic; emphasis words terracotta
- [ ] Body in Geist, line-height 1.5+
- [ ] Mono eyebrows UPPER .14–.18em
- [ ] All ink is `#1F2A1A` — zero black, zero grey
- [ ] One moss action per view; terracotta only highlights
- [ ] Pills for inputs/buttons, 22px cards, soft warm shadows
- [ ] At least one dashed botanical ring somewhere on screen
- [ ] Sun gradient only on solar/energy/live motifs, one per screen
- [ ] App icons: cream plate, leaf stroke, dashed orbit

> Gut-check: if it could hang in a greenhouse and not look like an intruder, ship.
