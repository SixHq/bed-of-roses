# Cyberpunk — Theme Handbook

> Violet-black panels wireframed in glowing cyan. Notched bezels, magenta
> signal, acid-lime confirmations, dense mono telemetry. The OS is a rig.

---

## 1. Mood & philosophy

Cyberpunk is the **neon-noir terminal** register. Every surface is a console pane bolted into a night-city rig: violet-shifted black (never neutral), a 1px cyan wireframe tracing every panel, corners cut off like machined bezels, and a constant low hum of glow. Cyan is the structure. Magenta is the hot signal — the thing that's live, urgent, or selected. Lime appears only when something succeeds.

**Build for:** users who theme their terminals, play Cyberpunk 2077 with the HUD maxed, keep btop open on a second monitor, want the OS to feel like gear.

**Tonal anchors:** a netrunner's deck, Blade Runner street signage, synthwave album consoles, the cockpit of something illegal.

If your design starts to feel soft, warm, or rounded, you've drifted. Push back toward *wireframe, notched, glowing*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--canvas` | `#0A0612` | The void — page background, violet-shifted black |
| `--surface-1` | `#13091F` | Panels, cards, fields (the presence's exact panel color) |
| `--surface-2` | `#1A0E2A` | Elevated chips / hover |
| `--surface-3` | `#221336` | Highest lift — selected backdrops |

### Neon channels
| Var | Hex | Use |
|---|---|---|
| `--neon-cyan` | `#00E5FF` | Structure: borders, primary actions, instrument text |
| `--neon-magenta` | `#FF2D9C` | Hot channel: active, alerts, emphasis, errors |
| `--neon-lime` | `#A8FF3E` | Success / confirm ONLY |
| `--on-neon` | `#0A0612` | Text on a filled neon surface |
| body text | `#EDE5FF` | Pale violet-white prose |

Three channels, strict roles. Cyan builds, magenta burns, lime confirms. A screen with magenta everywhere has no hot signal — ration it.

### The notch (the signature)
Corners are never rounded; they're cut. Always the top-left / bottom-right pair:
```css
/* panels: 12px cut */
clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px),
                   calc(100% - 12px) 100%, 0 100%, 0 12px);
/* buttons: 6px cut · small marks: 4px cut */
```
Pair every notched panel with a 1px solid cyan border and `border-radius: 0`.

### The glow
```css
/* panel glow — presence exact */
box-shadow: inset 0 0 18px rgba(0, 229, 255, 0.08),
            0 0 32px rgba(0, 229, 255, 0.30);
/* key text glows */
text-shadow: 0 0 6px rgba(0, 229, 255, 0.45);   /* cyan copy */
text-shadow: 0 0 8px rgba(255, 45, 156, 0.60);  /* magenta emphasis */
```
Glow is emissive light from the element itself — never a grey drop shadow.

### Type
- **Display** — `Chakra Petch`, weight 700, ALWAYS UPPERCASE, cyan text-glow
- **Sans** — `Space Grotesk`, weight 400/500/600 — body prose in `#EDE5FF`
- **Mono** — `JetBrains Mono`, weight 400/500/700 — telemetry, coordinates, stamps

| Class | Size / Line | Use |
|---|---|---|
| `.cy-h1` | 44 / 1.0 UPPER .04em (Chakra 700) | Hero |
| `.cy-h2` | 28 / 1.05 UPPER .05em (Chakra 700) | Section |
| `.cy-h3` | 18 / 1.1 UPPER .06em (Chakra 700) | Sub |
| `.cy-body` | 14 / 1.5 (Grotesk 400) | Body |
| `.cy-tele` | 11 / .10em UPPER (mono 500) cyan | Telemetry |
| `.cy-stamp` | 10 / .16em UPPER (mono 700) | `[OK]` `[ERR]` `[SYNC]` stamps |

Telemetry is a first-class citizen: timestamps, coordinates, version strings, byte counts. A cyberpunk surface without mono micro-text is under-dressed.

### Radii
Zero. Everywhere. Corners notch; they never round.

### Motion
Electrical — quick snaps, no floating.
- Hover: background charges to `rgba(0,229,255,0.12)`, glow intensifies
- Working: the magenta element spins or blinks (presence: diamond spins 2.5s linear)
- Durations 100/240/420ms, ease `cubic-bezier(0.20, 0, 0, 1)`
- A scanline sweep (thin cyan line, 3s linear) is allowed once per screen on a live panel
- Never: gentle fades, springy bounces, parallax

---

## 3. Layout & screen orientation

### Page background
`--canvas` plus the city-glow atmosphere: faint magenta smog upper-right, faint cyan uplight lower-left. Both dim — the neon borders carry the light.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 240px;
  gap: 14px; /* tight — racked equipment, not floating cards */
  padding: 80px 24px 132px;
}
```

### App modal
- 920×680, `--surface-1` bg, 1px cyan border, 12px notch, panel glow
- Backdrop: void at 75%, no blur
- Title bar carries a `.cy-tele` readout on the right (time, session id — real data only)

---

## 4. Component handbook

### Button
```html
<button class="cy-btn cy-btn-pri">Jack in</button>
```
```css
.cy-btn {
  height: 40px;
  padding: 0 20px;
  font-family: "Chakra Petch", sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .06em;
  text-transform: uppercase;
  border: 1px solid var(--neon-cyan);
  border-radius: 0;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px),
                     calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: transparent;
  color: var(--neon-cyan);
  box-shadow: inset 0 0 12px rgba(0, 229, 255, 0.10);
  transition: background .1s, box-shadow .1s;
}
.cy-btn:hover { background: rgba(0,229,255,.12); }
.cy-btn-pri { background: var(--neon-cyan); color: var(--on-neon); }
```
Danger variant swaps every cyan for magenta. Confirm variant (rare) uses lime.

### Field
- 40px tall, 1px cyan border at 45%, notch 6px, `--surface-1` bg
- Text: JetBrains Mono, cyan, with the cyan text-glow; caret magenta
- Focus: full-strength cyan border + `0 0 24px rgba(0,229,255,0.25)`
- Placeholder: mono UPPERCASE, `rgba(237,229,255,0.4)`, no glow

### Chip
- 26px tall, 1px cyan at 45%, notch 4px, `rgba(0,229,255,0.08)` fill, mono UPPER
- Active chip flips to magenta border + `rgba(255,45,156,0.12)` fill

### Tile
- `--surface-1`, 1px cyan border, 12px notch, inset glow
- One telemetry row (mono, cyan) is mandatory per tile
- Status stamps in brackets: `[LIVE]` cyan, `[HOT]` magenta, `[OK]` lime

### Chat bubble
- User: cyan-filled panel, void text, 6px notch
- AI: `--surface-1`, cyan border, 12px notch, name as `.cy-tele`; emphasis words magenta with glow

### Chat bar
Notched panel, cyan border, inset glow. The leading cell is a magenta glyph
(the presence puts its + control there, magenta with drop-glow). Send button is
cyan-filled with void text.

### Modal
1px cyan border, 12px notch, panel glow. Header divider `rgba(0,229,255,0.25)`.

---

## 5. App handbook — "The Deck" (Notes as a data terminal)

Frame Notes as encrypted records on a street deck.

### Frame
```html
<div class="cy-modal">
  <header class="cy-modal-head">
    <h1 class="cy-h2">The Deck</h1>
    <span class="cy-tele">REC 042 · NODE LAG-03 · 23:41:07</span>
    <button class="cy-btn cy-btn-pri" style="height:34px">New record</button>
  </header>
  <main>...</main>
</div>
```

### Layout
- Two-column: 220px record list / editor
- Vertical divider: 1px `rgba(0,229,255,0.25)`

### List row
```html
<button class="cy-row">
  <span class="cy-stamp" style="color:var(--neon-cyan)">[042]</span>
  <span class="cy-h3" style="font-size:14px">midnight run notes</span>
  <span class="cy-tele">2.1KB · 23:41</span>
</button>
```
Selected: magenta left rail (2px) + `--surface-3` backdrop. Hover: cyan fill at 8%.

### Editor
- Title: Chakra Petch 700 / 24px UPPER, cyan glow
- Body: Space Grotesk 400 / 15px / 1.55, `#EDE5FF`, max-width 60ch
- A mono status line pinned at the bottom: `LN 12 · COL 8 · 412 WORDS · SAVED [OK]`

### Empty
`NO RECORDS ON THIS NODE` in Chakra Petch 700 / 18px, cyan at 45%, centered. Under it a `.cy-stamp`: `[ AWAITING INPUT_ ]` with a blinking underscore.

### Working
The magenta diamond spins (2.5s linear) beside the title; telemetry row ticks.

---

## 6. Widget handbook — Weather as an atmo readout

### Markup
```html
<article class="cy-tile" data-size="1x1">
  <span class="cy-tele">ATMO · LAG-03</span>
  <div>
    <span style="font-family:'Chakra Petch'; font-weight:700; font-size:44px;
                 color:var(--neon-cyan); text-shadow:0 0 8px rgba(0,229,255,.5)">24°</span>
    <span class="cy-stamp" style="color:var(--neon-magenta)">[STORM INBOUND]</span>
  </div>
</article>
```

### Type
- Number: Chakra Petch 700 / 40–48px / cyan with glow
- Alert: mono bracket-stamp, magenta when hot, lime when clear
- Meta: `.cy-tele` — sensor id, timestamp, always present

### Color
- Tile recipes:
  - Panel + cyan reading (default)
  - Panel + magenta reading and border (alerting — at most one per grid)
  - Cyan-filled tile with void text (the anchor tile, at most one per grid)
- Lime appears only inside `[OK]`-class stamps

### States
- **Empty:** `NO SIGNAL` + `[ SCANNING_ ]` blinking stamp
- **Live:** as above; readings update with a 100ms cyan flash
- **Working:** thin cyan scanline sweeps the tile (3s linear)

### Variant: 2x1 (flight)
Two IATA codes Chakra Petch 700 / 32px cyan; route drawn as a 1px dashed cyan line with a magenta diamond at current position; mono telemetry row underneath.

### Don'ts
- Don't round a single corner — notch or nothing
- Don't use grey drop shadows — all light is emissive neon
- Don't let magenta exceed roughly a tenth of the surface — it's the signal, not the wall
- Don't use lime for anything but success
- Don't ship a tile without a mono telemetry row

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <!-- notched bezel plate -->
  <path d="M12 2 H62 V50 L52 62 H2 V12 Z"
        fill="#13091F" stroke="#00E5FF" stroke-width="1.5"/>
  <!-- silhouette in cyan -->
  <path d="M20 22 H44 M20 32 H38 M20 42 H44"
        fill="none" stroke="#00E5FF" stroke-width="2.5" stroke-linecap="square"/>
  <!-- hot pixel -->
  <rect x="44" y="40" width="5" height="5" fill="#FF2D9C"/>
</svg>
```

**Rules:**
- Notched plate (two opposite corners cut), `#13091F` fill, 1.5px cyan stroke
- Silhouette in cyan, square linecaps — schematic, not illustrative
- Exactly one magenta hot-pixel accent
- No rounding, no gradients, no glow baked into the SVG (CSS supplies glow)

### Widget thumbnail
- 480×480 with the notch + wireframe + glow language preserved
- Replace numbers with em-dash `—` in Chakra Petch 700 cyan
- Keep one magenta element so the thumbnail carries the hot channel

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Operator.** "Jacked in." "Node synced." "Signal lost."
- **Bracket stamps.** `[OK]`, `[ERR]`, `[SYNC]`, `[HOT]` as status grammar.
- **Rig verbs.** "Jack in", "patch", "flush", "burn" instead of "log in", "update", "clear", "delete".
- **Terse.** Telemetry doesn't editorialize. "STORM INBOUND · 8 MIN."

### Common mistakes
- Rounded corners anywhere — the notch is the identity
- Neutral black (`#000`/`#111`) instead of violet-shifted `#0A0612`/`#13091F`
- Grey drop shadows — every shadow is emissive cyan or magenta light
- Magenta used as decoration until nothing reads urgent
- Display type in lowercase or without Chakra Petch
- Panels without borders — the wireframe is what makes it a rig

### Ship checklist
- [ ] Every panel: 1px cyan border, radius 0, notched corners, inset glow
- [ ] Display type Chakra Petch 700 UPPERCASE with cyan text-glow
- [ ] Body in Space Grotesk `#EDE5FF`; telemetry in JetBrains Mono
- [ ] Cyan structure / magenta signal / lime success — roles never mixed
- [ ] At least one mono telemetry row per surface
- [ ] One magenta hot element maximum per view
- [ ] App icons: notched plate, cyan schematic stroke, one magenta pixel
- [ ] No rounded corners, no grey shadows, no warm tones anywhere

> Gut-check: if it could be bolted into a netrunner's deck and boot with a hum, ship.
