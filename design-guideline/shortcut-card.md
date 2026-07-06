# Shortcut Card UX Spec — Bed of Roses

Strict guidelines for designing and authoring shortcuts. Every shortcut the
LLM builds via `<create_shortcut>` MUST conform to this spec.

## What a shortcut IS

A shortcut is a **stateful iframe card that lives INSIDE the thought
bubble** — not on the macOS desktop, not in its own Mac window. It scrolls
with the conversation thread and persists across turns. Think of it as a
mini-app the user can act on **right where they're talking** to Bed of
Roses: a Pay button, a translator input + output, a tiny travel itinerary
that streams its own AI, a waveform player, a one-step API caller, a
settings toggle.

Two principles:

1. **Adjacent to the conversation.** The user looks at the result without
   leaving the bubble. No window-switching, no Mission Control trip, no
   Cmd-Tab.
2. **Connected to real things.** A shortcut can call APIs, ask its own
   AI, generate images, persist its own state, and trigger a full BOR
   app to open via `launchApp()`. It is not a dummy preview.

If the surface deserves its own dock-presented Mac window the user will
return to day-over-day, use `<create_app>` instead. If the result fits
in a sentence, just use `<say>`.

## 1. Bubble height ranges

Shortcuts ship at a fixed pixel height inside the bubble. The width is
controlled by the bubble (the user can drag-resize, default ~520-560 px
content area). Pick the smallest height that fits the content cleanly.

| Height key | Pixels | Use |
|------------|--------|-----|
| Compact    | 160    | One value + one action. *"$50 → Lagos"* + Pay button. *"28° Lagos"* + refresh. A single toggle. |
| Standard   | 240    | Title + a few fields + primary action. Translator input + output. Two-field form. Three-row list. |
| Tall       | 320    | Multi-field form, list of 5-7 items, single chart with caption. |
| Dashboard  | 480    | Multi-section card: tabs, chart + numbers, settings + state, or 8-12 row list. |
| Maximum    | 600    | Absolute ceiling. Use only when the content genuinely needs it — most surfaces taller than this should be `<create_app>`. |

Pass the height via the `bubbleHeight` attribute on `<create_shortcut>`.
Default 280 if omitted. Clamped to [160, 600] by the executor.

## 2. Layout patterns

The iframe is rendered with:
- transparent background (the bubble's atmosphere shows through),
- the active theme's CSS tokens injected as a `<style>` prefix (`--label`, `--accent`, `--hairline`, font families),
- `box-sizing: border-box` and zero margin reset assumed inside the iframe HTML.

Recommended patterns:

- **Single-row card (160-200px):** label on the left, primary action on the right. ~16px padding all around.
- **Form card (240-320px):** stack — title row, 1-3 input rows, action row at the bottom. ~16px padding.
- **List card (240-480px):** title + meta row at top, scrollable list of rows below (`overflow-y: auto`), action row at the bottom.
- **Tabbed card (320-480px):** tab row at top, switching panel below. Use a single CSS class toggle, not router state.

## 3. Typography

Same scale as the rest of the OS. Four sizes only:

| Size  | Use |
|-------|-----|
| 11 px | Mono micro-labels (timestamps, key-status, telemetry, captions). |
| 13 px | Body, list items, secondary values. |
| 18 px | Section headings, important values. |
| 28 px | The hero value — at most one per card. Compact (160 px) cards may use 22 px instead. |

Use the theme's display + system + mono fonts via CSS vars:
- `font-family: var(--font-system)` for default
- `font-family: var(--font-display)` for hero numerals + titles
- `font-family: var(--font-mono)` for tabular numerals + timestamps

Never hard-code a font name.

## 4. Color + theme tokens

All injected by the host. Use the tokens, never hex literals.

| Token              | Use |
|--------------------|-----|
| `var(--label)`     | Primary text. |
| `var(--label-2)`   | Secondary text (40-70% strength). |
| `var(--label-3)`   | Tertiary / disabled text (30-50%). |
| `var(--accent)`    | Active theme accent — for primary action buttons, focus rings. |
| `var(--hairline)`  | Borders, dividers, soft separators. |
| `var(--surface-1)` | A subtle inset block within the card. |
| `var(--error)`     | Error states only. |

## 5. The API-key UI is the first POC

If the shortcut uses any third-party API requiring a key/token/client id,
the very first thing the user sees on first render is the **key setup
state** — not a fake demo, not an error, not a "configure me" toast. Pattern:

1. Initial render checks `getState().apiKey`. If absent, render the
   key-needed state directly.
2. Key-needed state shows:
   - A short title ("Add your X API key to continue").
   - One masked `<input type="password">`.
   - A **Save** button and a **Where do I get a key?** link/button that
     reveals a 2-3 line how-to.
3. On save: validate (call the API with the key), persist via
   `setState({...state, apiKey})`, then transition to the live state.
4. The "live" state shows the actual feature (translator, pay button,
   tracker, etc.).
5. The key can be cleared from a small settings affordance in the live
   state (gear icon, "Forget key" link).

## 6. Bridge calls

The shortcut runs in a sandboxed iframe with `parent.postMessage` as the
only host channel. Use the six primitives identically to apps:

```html
<script>
const _bridge = (msg) => new Promise((resolve, reject) => {
  const id = Math.random().toString(36).slice(2);
  const onMsg = (e) => {
    if (e.data?.requestId !== id) return;
    window.removeEventListener('message', onMsg);
    if (e.data.error) reject(new Error(e.data.error));
    else resolve(e.data);
  };
  window.addEventListener('message', onMsg);
  parent.postMessage({ ...msg, requestId: id }, '*');
});
const getState     = ()                       => _bridge({type:'state-get'}).then(r => r.state || {});
const setState     = (state)                  => _bridge({type:'state-set', state});
const askAI        = (prompt, opts = {})      => _bridge({type:'llm-request', prompt, system: opts.system, images: opts.images}).then(r => r.text);
const searchWeb    = (query, limit = 5)       => _bridge({type:'web-search', query, limit}).then(r => r.results);
const fetchUrl     = (url)                    => _bridge({type:'web-fetch', url}).then(r => ({title: r.title, text: r.text, truncated: r.truncated}));
const generateImage = (prompt, size = '1024x1024') => _bridge({type:'image-generate', prompt, size}).then(r => ({url: r.url, model: r.model, bytes: r.bytes}));
const launchApp    = (appId)                  => _bridge({type:'launch-app', appId});
const cron         = (action)                 => _bridge({type:'cron', ...action});
const pushNotification = ({subject, title, body, level = 'info', source = 'shortcut'}) => _bridge({type:'notification-push', subject, title, body, level, source});
const listNotifications = ()                  => _bridge({type:'notifications-list'}).then(r => ({notifications: r.notifications || [], unread: r.unread || 0}));
</script>
```

When you call `pushNotification`, include a short `subject` for the collapsed presence chip and use `body` for the full detail text.

`launchApp(appId)` opens an existing BOR app full-screen via the Swift
helper. Use this when the shortcut is a launcher for a deeper experience
(e.g. "Send Lagos $" → opens the full Payments app on tap of the row).

## 7. State

State is JSON, persisted via `setState/getState`. Schema is yours to
design — be conservative and document it in the `<doc>`. Common patterns:

- `apiKey: string` — when third-party APIs are involved.
- `lastInput: string` / `lastOutput: string` — for translators, AI prompts.
- `entries: Array<{...}>` — for lists.
- `prefs: { … }` — for settings/toggles.

## 8. Allowed primitives

- Native HTML elements only (`<div>`, `<button>`, `<input>`, `<select>`,
  `<a>`, `<img>`, `<svg>`, `<canvas>`).
- Inline `<style>` and inline `<script>`. NO external `<script src>`.
- Inline SVG for icons. `currentColor` for stroke/fill.
- CSS animations for subtle motion (≤ 400ms per cycle, never strobing).
- `setInterval` / `setTimeout` are allowed but the validator REJECTS
  `setInterval(fn, N)` where `N < 5000` (5 seconds). Polling more
  often than that wastes bridge budget. For real-time UI, use the
  iframe's own UI state — don't poll.

## 9. Forbidden

- **Emojis.** Use inline SVG icons styled with `currentColor`.
- **Full-bleed photographs.** Background must stay transparent.
- **Third-party logos.** No Apple, Google, OpenAI, Stripe, etc. wordmarks.
- **`localStorage` / `sessionStorage` / `indexedDB` / `document.cookie`** —
  the validator rejects these. Use `getState/setState` only.
- **`eval` / `new Function`** — validator rejects.
- **External `<script src="…">`** — validator rejects.
- **`<say>` tags inside the iframe HTML** — that's the chat layer, not yours.
- **`parent.location`, `parent.foo`, `window.top`** — only
  `parent.postMessage` is allowed. Validator rejects the rest.
- **`box-shadow` on the shortcut root.** The bubble already has its own
  shadow language. Use hairlines/borders for separation.

## 10. Accessibility

- Focus-visible outline on every interactive element (`outline: 2px solid var(--accent); outline-offset: 2px`).
- `aria-label` on icon-only buttons.
- Honor `@media (prefers-reduced-motion: reduce)` — disable all animation.

## 11. When the LLM should reuse vs create

The LLM sees existing shortcuts in the system prompt. Before
`<create_shortcut>`, check if a similar shortcut already exists:

- Same recurring task → `<launch_shortcut id="…"/>` (cheap, reuses state).
- Variant of the same task → `<update_shortcut id="…"/>` to generalize
  (e.g. "Send Lagos $" → "Send money" with a recipient picker).
- Genuinely new task → `<create_shortcut>`.

## 12. The `<suggest_shortcut>` flow (Phase 2)

When the LLM thinks a recurring task would benefit from a shortcut but
isn't sure a text reply is enough, emit:

```
<suggest_shortcut summary="…" reason="…"/>
```

This renders a small Yes/No card in the bubble. Click Yes → synthetic
user message injected → LLM creates the shortcut next pass. Click No →
card dismisses, no LLM round-trip. Use this whenever a shortcut would
help but the user hasn't explicitly asked for one.
