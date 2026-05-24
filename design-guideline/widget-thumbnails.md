# Widget Thumbnail UX Spec — Bed of Roses

Strict guidelines for designing and authoring widget thumbnails. Every widget
the LLM builds via `<create_widget>` MUST conform to this spec.

## What a widget thumbnail IS

A widget thumbnail is a **glanceable entry point** to the widget's full
surface. Think of it the way macOS WidgetKit thumbnails work, or the way
an iOS Home Screen widget previews the app behind it:

- The thumbnail lives on the **macOS desktop** at a small, fixed pixel
  size. It shows the most important value the user wants to glance at —
  the temp, the next event, the unread count, the current track.
- Clicking the thumbnail background **opens the full widget surface**, a
  larger interactive window with the same HTML rendered at surface size.
  The state is shared (bridge `getState`/`setState`); the larger surface
  is where deeper interaction happens.
- Interactive elements **inside** the thumbnail (a `<button>`, a `<a>`,
  an `<input>`) still work in place — the user can toggle a switch or
  type a quick note without opening the larger surface. The
  background-tap-to-open rule applies only to empty areas of the widget.

In short: **thumbnail = launcher + live glance, surface = full interaction.**
Both are the same widget HTML, rendered at different sizes.

## 1. The five canonical sizes

Five widget thumbnail dimensions. Each maps directly to a BOR size key.
No other dimensions are allowed.

| Size key | Name              | Pixels (W × H) | Aspect | What it is for |
|----------|-------------------|----------------|--------|----------------|
| `2x05`   | Compact banner    | 240 × 80       | 3 : 1  | A single value or status. *"28°"*, *"5 unread"*, *"Backups on"*, *"6 mins to next"*. One row of text + maybe one icon. |
| `2x1`    | Standard banner   | 240 × 144      | 5 : 3  | Title + value. *"Lagos · 28° · Clear"*, *"Inbox · 5 unread"*, *"Today · 3 events"*. Two-line layout, a small chart, or a row of 2–3 icons. |
| `2x3`    | Card              | 240 × 200      | 6 : 5  | A few related data points in one compact card. *"3-day forecast"*, *"Top 3 tracks"*, *"Today's agenda (3 rows)"*. |
| `1x2`    | Tall column       | 144 × 240      | 3 : 5  | A vertical list — 4 to 6 rows. *"Top 4 todos"*, *"Recent DMs"*, *"Watchlist stocks"*. |
| `3x2`    | Dashboard         | 360 × 200      | 9 : 5  | A wider information surface with a real chart or grid. *"7-day weather strip"*, *"This week's calendar"*, *"Portfolio chart + numbers"*. |

**Default to `2x1`.** Pick a different size only when the content genuinely
demands it. Square shapes are not allowed — widgets must be rectangles.

## 2. Internal padding

| Size                     | Padding |
|--------------------------|---------|
| Compact banner (`2x05`)  | 16 px   |
| Standard banner (`2x1`)  | 16 px   |
| Tall column (`1x2`)      | 16 px   |
| Card (`2x3`)             | 20 px   |
| Dashboard (`3x2`)        | 20 px   |

The widget root sets `padding` to the value above. All content lives inside.
Never let content touch the visible edge.

## 3. Typography

**Four font sizes only.** Pick from this scale per widget; do not introduce
intermediate sizes.

| Size  | Use                                                       |
|-------|-----------------------------------------------------------|
| 12 px | Labels, captions, meta-info ("AS OF 12:32 PM", row keys). |
| 14 px | Body text, list items, secondary values.                  |
| 18 px | Subheads, widget titles, secondary numerals.              |
| 28 px | The hero value — only one per widget.                     |

Compact banners use 18 px max — the whole widget IS one value, there's no
room for a 28 px hero plus another line.

Use the theme's display + system + mono fonts via CSS vars:
- `font-family: var(--font-system)` for default
- `font-family: var(--font-display)` for hero numerals + titles
- `font-family: var(--font-mono)` for tabular numerals + units

Never specify a font name directly — always go through the theme variable.

## 4. One hero per widget

Each widget has **one** primary thing it shows. That's the hero.

| Size              | Hero rule                                                       |
|-------------------|-----------------------------------------------------------------|
| Compact banner    | The hero IS the entire widget. One value, one row.              |
| Standard banner   | Hero left, secondary info right. OR hero top, label bottom.     |
| Card              | Hero at top (1 line, 28 px). Up to 3 supporting rows below.     |
| Tall column       | No hero numeral. The hero is the *list itself*; max 6 rows.     |
| Dashboard         | One bold chart OR one grouped grid + supporting numerals.       |

If you ever feel a widget needs two heroes, pick a bigger size — or
ship two separate widgets, or build it as an app instead.

## 5. Color + theme tokens

Use the theme tokens. Never hard-code hex colors.

| Token                  | Use                                  |
|------------------------|--------------------------------------|
| `var(--surface-0)`     | The widget body's background.        |
| `var(--surface-1)`     | A subtle inset block within the body. |
| `var(--label)`         | Primary text.                        |
| `var(--label-2)`       | Secondary text (40-70% strength).    |
| `var(--label-3)`       | Tertiary / disabled text (30-50%).   |
| `var(--accent)`        | The active theme accent.             |
| `var(--accent-strong)` | Hover / active emphasis.             |
| `var(--hairline-soft)` | Dividers, faint borders.             |

Contrast: primary text on background ≥ 4.5 : 1. Secondary text ≥ 3 : 1.

## 6. Live data

Widget thumbnails ARE live. They:

- Run inside the widget window as actual HTML/CSS/JS, not as a snapshot.
- Should call `getState()` on mount and re-render whenever state changes.
- Update via `setInterval` or `requestAnimationFrame` for clocks /
  countdowns / live values. Keep the cadence reasonable (≥ 250 ms).
- Use the bridge (`parent.postMessage`) for fresh data: `llm-request` for
  natural-language pulls, `web-search` / `web-fetch` for external sources,
  `image-generate` for visuals. Never embed an `<img src="https://...">`
  for a third-party hosted image; route through the bridge.

## 7. Allowed primitives

- Native `<div>`, `<span>`, `<p>`, `<ol>/<ul>/<li>`, `<table>`, `<button>`.
- Inline SVG for icons, sparkline charts, decorative marks. Single stroke,
  `stroke-width: 1.5`, `currentColor`.
- CSS animations for subtle motion (≤ 400 ms per cycle, never strobe).
- `requestAnimationFrame` for any custom animation.

## 8. Forbidden

- **Emojis.** Use inline SVG icons styled with `currentColor`.
- **Full-bleed photographs.** No background images that fill the widget.
- **Third-party logos.** No vendor logos (Apple, Google, OpenAI, etc.).
- **Drop shadows on the widget root.** The window itself is transparent;
  any shadow comes from the window's macOS-native shadow, not from CSS
  `box-shadow` on the widget body.
- **More than one font family.** Pick from the theme tokens. One display
  font, one system font. Mono is only for numerals/units.
- **Off-grid spacing.** Use multiples of 4 px for padding, gaps, margins.
- **External `<script src>` and `import()`.** Already enforced by the
  HTML validator. All JS is inline.
- **`localStorage` / `sessionStorage` / `indexedDB`.** Already enforced.
  Use the bridge's `getState` / `setState` for persistence.
- **`<say>` tags inside widget HTML.** Already enforced. `<say>` belongs
  in the model's response text, never in widget code.

## 9. Click-through behavior — thumbnail is the entry point

The widget thumbnail IS the launcher for the full widget surface.
Tapping the widget background — anywhere that isn't a `<button>`,
`<input>`, `<textarea>`, `<a>`, `<select>`, or `[contenteditable]`
element — opens the widget's full surface. A larger window appears
running the same widget HTML, with state shared via the bridge.

The whole widget background is the expand affordance:

- ❌ Do NOT add an explicit "Open" or "Expand" button.
- ❌ Do NOT put `cursor: pointer` on the widget root — macOS handles the
  cursor; adding `pointer` undermines the "this whole surface is
  tappable" feel.
- ✅ Keep at least 60% of the widget background as plain non-interactive
  surface so the user has somewhere to tap without hitting a control.
- ✅ Interactive controls inside the thumbnail (toggle, +/- buttons,
  small input) still work in place — they don't accidentally open the
  surface.

If a widget feels like it needs a dedicated "Open" button, the answer
is: it's not a widget. Build it as a `<create_app>` instead, or make
the widget's content less interactive so the background-tap pattern
applies cleanly.

## 10. Documentation requirement

Every widget MUST ship with a `<doc>` block covering:

- **Purpose.** One sentence.
- **Hero element.** What the widget points at.
- **State schema.** The exact JSON shape `getState()` returns and
  `setState()` writes.
- **Bridge calls.** Which of `llm-request` / `web-search` / `web-fetch` /
  `image-generate` the widget uses, and how often.
- **Loading + empty + error states.** What the widget shows when state
  hasn't loaded, when there's no data, when a bridge call fails.
- **Changelog.** Initial build, plus any subsequent updates.

This doc is the contract for `<update_widget>` — future updates have to
preserve and extend it, not rewrite from scratch.
