# Warm & Earthy — Theme Handbook

> Sun-bleached paper, walnut ink, terracotta + olive + mustard accents.
> A field journal kept on a kitchen table.

---

## 1. Mood & philosophy

Warm & Earthy is the **lived-in, observational, golden-hour** register. Everything looks faintly aged, like it was printed on warm cream stock and left near a window for a week. Italic serif carries the voice. The color palette is borrowed from old kitchens, gardens, and long walks.

**Build for:** users who keep a paper journal, cook from a notebook, read at dusk, plant herbs on a balcony.

**Tonal anchors:** olive oil bottles, terracotta pots, beeswax candles, a wooden bowl of tomatoes, a folded linen napkin.

If your design feels clinical or chrome-bright, you've drifted. Pull back toward *worn*.

---

## 2. Tokens

### Surfaces
| Var | Hex | Use |
|---|---|---|
| `--sand` | `#EDE2CD` | Page background |
| `--paper` | `#FAF3E3` | Cards |
| `--paper-warm` | `#F5E9D0` | Lifted (hover, modal) |
| `--ink` | `#2A1F14` | Walnut — primary text |

### Earth accents
| Var | Hex | Use |
|---|---|---|
| `--terra` | `#C8553D` | Primary action, accent |
| `--rust` | `#A65A3A` | Hover/pressed terra |
| `--mustard` | `#D4A24C` | Highlight, "saved" |
| `--honey` | `#E8B86F` | Warmth, weather sun |
| `--olive` | `#7A8450` | Affirmative, "connected" |
| `--sage` | `#9CAF88` | Backgrounds, calm |
| `--clay` | `#B47148` | Earthen, rare |
| `--plum` | `#6B3F4A` | Evening, alert |
| `--moss` | `#5D6B3A` | Deep, used for stamps |

### Labels
| Var | Value | Use |
|---|---|---|
| `--ink` | `#2A1F14` | Primary |
| `--ink-2` | `rgba(42,31,20,.72)` | Body |
| `--ink-3` | `rgba(42,31,20,.50)` | Hints |
| `--ink-4` | `rgba(42,31,20,.30)` | Disabled |

### Hairlines
| Var | Value | Use |
|---|---|---|
| `--hair-soft` | `rgba(42,31,20,.08)` | Internal |
| `--hair` | `rgba(42,31,20,.16)` | Default |
| `--hair-strong` | `rgba(42,31,20,.28)` | Selected |

### Shadows
Soft, warm, brown-tinted (never pure black).
- `--shadow-soft`: `0 1px 0 rgba(42,31,20,.04), 0 8px 24px rgba(82,55,28,.10)`
- `--shadow-lift`: `0 2px 0 rgba(42,31,20,.05), 0 18px 40px rgba(82,55,28,.14)`
- `--shadow-inset`: `inset 0 1px 0 rgba(255,250,235,.6), inset 0 0 0 1px rgba(42,31,20,.06)`

### Type
- **Serif** — `Newsreader`, italic-capable, weight 500/600
- **Sans** — `Plus Jakarta Sans`, weight 400/500/600/700
- **Mono** — `JetBrains Mono`, weight 400/500

| Class | Size / Line | Use |
|---|---|---|
| `.e-h1` | 84 / .96 / -.022em (Newsreader 500) | Hero |
| `.e-h2` | 42 / 1 / -.018em (Newsreader 500) | Section titles — `em` for emphasis |
| `.e-h3` | 22 / 1.2 / -.012em (Jakarta 600) | Sub titles |
| `.e-display` | 24 / 1.25 italic (Newsreader 400) | Pull quotes, captions |
| `.e-body` | 15 / 1.55 (Jakarta 400) | Body |
| `.e-tag` | 10 / .16em UPPER (mono) | Tile meta |
| `.e-eyebrow` | 11 / .22em UPPER (mono) terra | Section eyebrows |

**Italic rule:** Newsreader italic is the warm voice. Wrap one to three words per surface in `<em>` (e.g., *A slow Sunday*). Never italicize a whole paragraph.

### Spacing
4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64. Generous outer pads (32–48px on apps), tight internal stacks (8–12px between items).

### Radii (rounded but understated)
- Input: 14
- Button: 99 (pill) — *the* defining feature
- Tile: 18–20
- Modal: 22

### Motion
- Hover: 1px lift, shadow grows from soft to lift, 200ms ease-out
- Press: 1px down, shadow returns to soft, 100ms
- Never use bouncy easing. Easy ease-outs only.

---

## 3. Layout & screen orientation

### Page background
A soft three-stop atmospheric wash:
```css
background:
  radial-gradient(circle at 12% 18%, rgba(196,113,72,.06), transparent 40%),
  radial-gradient(circle at 88% 80%, rgba(122,132,80,.06), transparent 45%),
  radial-gradient(rgba(42,31,20,.04) 1px, transparent 1.2px) 0 0 / 4px 4px,
  var(--sand);
```
The dotted paper grain is essential — never leave it off.

### Home grid
```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 220px;
  gap: 14px;
  padding: 96px 32px 132px;
}
```
Padding is generous — Warm & Earthy is *unhurried*.

### App modal
- 880×680 max, `--paper` background, 1px `--hair` border, 22px radius, `--shadow-lift`
- Backdrop: `rgba(42,31,20,.45)` + `backdrop-filter: blur(12px)` — softer than Bloom's blur
- Opens at 320ms ease-out from `translateY(12px)` — no scale

### Mobile breakpoint
≤ 600px: padding tightens to 20px, hero size shrinks from 84 → 56, two-column app layouts collapse to a stack with the list above the editor.

---

## 4. Component handbook

### Button (pill)
```html
<button class="e-btn e-btn-pri">Begin →</button>
```
```css
.e-btn {
  height: 48px;
  padding: 0 22px;
  border-radius: 99px;
  font-weight: 600;
  font-size: 15px;
  border: 1px solid var(--hair-strong);
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  transition: transform .15s, box-shadow .15s;
}
.e-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-lift); }
.e-btn-pri { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.e-btn-terra { background: var(--terra); color: var(--paper); border-color: rgba(42,31,20,.2); }
.e-btn-mustard { background: var(--mustard); color: var(--ink); }
.e-btn-olive { background: var(--olive); color: var(--paper); }
.e-btn-ghost { background: transparent; border: 0; color: var(--ink-2); box-shadow: none; }
```

### Field
```html
<div class="e-field">
  <label>What should I call you?</label>
  <input class="e-input" placeholder="say a name…" />
</div>
```
- Label is Newsreader italic 15px / `--ink-2` — *not* mono
- Input: 50px tall, `rgba(255,250,235,.6)` background, 1px hair border, 14px radius, inset highlight
- Focus: border → terra, outer halo `0 0 0 3px rgba(200,85,61,.15)`
- Placeholder: italic Newsreader 16px / `--ink-3`

### Chip
- 32px tall, pill, 1px hair border, paper background
- Two styles: **default** (italic Newsreader 15px) and **monospace** (Jakarta 13px)
- Selected: ink background, paper text, ink border

### Tile
- 18px radius, 1px hair border, soft shadow
- Padding 16px
- Hover: shadow grows soft → lift, no transform

### Chat bubble
- User: ink background, paper text, 18px radius (bottom-right squared 6)
- AI: paper background, 1px hair border, ink text, AI name in Newsreader italic terracotta
- System: centered pill in paper, mono 10px

### Chat bar (pill)
- `--paper-warm` background, 99px radius, 1px hair border, soft shadow
- Padding 8 / 22, input is Jakarta 500 / 16px
- Send button: 42px circle, terra fill, paper arrow, no shadow

### Modal
22px radius, 1px hair, lift shadow. Header: 56px tall, title in Newsreader 28px italic, close is a 32px circle button-ghost style.

---

## 5. App handbook — Notes / "Journal"

Apps in this theme are titled with a *journal* register. Notes is called *Journal* in copy if you want; both work.

### Frame
```html
<div class="e-modal">
  <header class="e-modal-head">
    <h1 class="e-h2"><em>Journal</em></h1>
    <button class="e-btn e-btn-terra" style="height:36px">New entry</button>
    <button class="e-icon-btn">×</button>
  </header>
  <main class="e-app-body">…</main>
</div>
```

### Layout
- Two-column split: 240px list / editor
- Vertical divider: 1px `--hair`
- List bg: `--paper-warm`. Editor bg: `--paper`.
- Padding: 24px on the list, 32–48px on the editor (yes, that much — give the writing room)

### List item
```html
<button class="entry-item">
  <span class="entry-title">A slow Sunday</span>
  <span class="entry-meta">2 min · 14:32</span>
</button>
```
- Title: Newsreader italic 17 / 1.2
- Meta: mono 10 / .16em UPPER / `--ink-3`
- 56px tall, 12px radius, hover bg → `--paper`
- Selected: terracotta 1px left border (4px wide), bg `--paper-warm`

### Editor
- Title: Newsreader italic 36px, contenteditable, no border, cursor terracotta
- Body: Jakarta 16 / 1.7, max-width **60ch** (essential for readability), color `--ink-2`
- Page background is `--paper` with a faint vertical 1px hairline at column 64ch (decorative — like a notebook ruler)

### Empty
A single italic line, Newsreader 18px, `--ink-3`: *"Start when you're ready."* No CTA.

### Working
Title's `<em>` text gets a soft pulsing underline (terra at 30% opacity, 2px). Body stays at full opacity — the user keeps reading while you regenerate.

---

## 6. Widget handbook — Weather

### Markup
```html
<article class="e-tile" data-size="1x1" style="background: var(--paper-warm)">
  <span class="e-tag">weather · lagos</span>
  <div>
    <span class="hero-num" style="font-family:var(--serif); font-style:italic; font-size:50px; line-height:1">26°</span>
    <span class="hero-sub" style="font-family:var(--serif); font-style:italic; color:var(--terra)">golden hour</span>
  </div>
</article>
```

### Sizing & padding
- 240×220 at 1×1, 18px padding (slightly more than Bloom — earthy is unhurried)

### Type
- Number: Newsreader italic 50px / 1
- Sub: Newsreader italic 14px in `--terra` for warm conditions, `--olive` for cool, `--plum` for rain
- Meta: mono 10px / .16em UPPER / `--ink-3`

### Color
- Background can be `--paper-warm`, `--terra` (for flight), `--olive` (for productivity), `--mustard` (for notes)
- Pair: when the tile is colored, the meta drops to `rgba(255,255,255,.7)` and the title goes `--paper`

### States
- **Empty:** italic "*Set a place.*"
- **Live:** as above
- **Working:** sub line replaced with "*reading the sky…*" in italic / `--ink-3`

### Variant: 2x1 (flight)
Two endpoint codes (IATA), Newsreader italic 24px, dashed line connector (1px `--hair-strong`), tiny plane glyph at center using the ✈ character

### Variant: 2x2 (week ahead)
Five-day strip below the hero number. Days as Newsreader italic 13px, temps as Jakarta 500 14px.

### Don'ts
- Don't use bold sans for the hero number — Newsreader italic is what makes Earthy *Earthy*
- Don't draw a weather illustration — the italic caption ("golden hour") says everything
- Don't tint the meta with the accent color — meta stays `--ink-3` always

---

## 7. Icons & marks

### App icon — 64 × 64
```html
<svg viewBox="0 0 64 64" class="app-icon">
  <rect x="2" y="2" width="60" height="60" rx="16"
        fill="var(--paper-warm)" stroke="var(--hair)" stroke-width="1"/>
  <!-- silhouette in terracotta 2px stroke -->
  <path d="M18 18 H42 L46 22 V48 H18 Z M38 18 V24 H44"
        fill="none" stroke="var(--terra)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- small olive leaf in corner -->
  <path d="M48 48 q 4 -2 6 -6"
        stroke="var(--olive)" stroke-width="1.5" fill="none"/>
</svg>
```

**Rules:**
- Plate: `--paper-warm`, 16px radius, 1px hair border
- Silhouette stroke: terracotta or moss (genre-dependent — productivity = terra, system = moss, media = mustard)
- One small organic flourish (a leaf, a tendril) in the bottom-right corner, 1.5px stroke

### Widget thumbnail
- 480×480, exported on first paint
- Same as live widget but numbers replaced with an em-dash `—`
- Background is the live tile's background (don't default to paper)

---

## 8. Voice, mistakes, ship checklist

### Voice dialect
- **Observational.** *"I made coffee. The light was good."*
- **Italic for warmth.** *"a slow Sunday"*, *"the basil is taking"*
- **No exclamation points. No emoji.** A single ✿ in chrome is permitted.
- **Naming things gently.** Notes is *Journal*. Calendar is *Today*. Files is *Filing*. Music is *Listening*.

### Common mistakes
- ❌ Pure black text — use walnut `--ink`
- ❌ Cold grey hairlines — they're brown-tinted alpha
- ❌ Square buttons — buttons are pills here
- ❌ Italicizing whole paragraphs — italic is for emphasis only
- ❌ Big shadows — shadows are soft and warm
- ❌ Forgetting the paper grain — it's the secret sauce

### Ship checklist
- [ ] Page bg uses the dotted grain
- [ ] Hairlines use `rgba(42,31,20, …)`, not white
- [ ] Buttons are pills (99px radius)
- [ ] Headlines use Newsreader, italic on one to three words
- [ ] Body in Plus Jakarta Sans 15/24
- [ ] Mono meta is .16em UPPER 10px
- [ ] Tile padding is 18px (a hair more than other themes)
- [ ] No exclamation points in copy
- [ ] One small organic flourish on each app icon (leaf, tendril, dot)
- [ ] Widget thumbnail uses em-dash for missing data
- [ ] Empty states are italic statements, not buttons

> Gut-check: if your screen could be a page in a kitchen-table journal, ship.
