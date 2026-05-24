# Bed of Roses OS — UI Kit

A high-fidelity, click-thru recreation of the Bed of Roses shell. Splash → onboarding → empty home with avatar, chat bar, ambient field, and HUD. Components are factored small and importable.

## Files

- `index.html` — runs the full prototype (splash → onboarding → home)
- `App.jsx` — top-level state machine
- `MemojiCanvas.jsx` — the AI presence (CSS-only stand-in for `shell/memoji.js`)
- `AmbientCanvas.jsx` — drifting motes + soft sun (lightweight version of `shell/ambient.js`)
- `Hud.jsx` — diegetic corner telemetry
- `LogoMark.jsx` — geometric four-fold rose
- `OnboardingPane.jsx` — shared pane shell with per-character title reveal
- `Welcome.jsx`, `NamePane.jsx`, `PresencePane.jsx`, `ConnectPane.jsx`, `ReadyPane.jsx` — onboarding screens
- `PresenceCard.jsx`, `ProviderCard.jsx` — pickers
- `Home.jsx`, `ChatBar.jsx`, `WidgetTile.jsx`, `Modal.jsx` — post-onboarding desktop

## Caveats

- `MemojiCanvas` is a **faithful CSS stand-in** — the real engine in `shell/memoji.js` runs on `<canvas>` with shader-style noise + parametric petal drawing. Lift the original if you need the actual renderer.
- `AmbientCanvas` runs the full canvas mote-field but with ~80 motes (vs ~140) and a single sun for cost.
- This kit is **visual only** — no real AI, no real provider connection. Form submits are local-state.

## Loading

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
<script type="text/babel" src="MemojiCanvas.jsx"></script>
<!-- ...other components in order... -->
<script type="text/babel" src="App.jsx"></script>
```

Each component file ends with `Object.assign(window, { ... })` so cross-file imports work without modules.
