# Bed of Roses v2

v2 changes the product shape from a browser-hosted "empty OS" into a Mac-first
ambient runtime.

The existing Node server remains the brain: providers, protocol parsing,
app/widget generation, files, browser launching, image generation, and long
tasks still live in `server/`.

The new v2 host in `host/` wraps that runtime with Electron so Bed of Roses
can behave like a real desktop companion:

- first launch opens the existing onboarding window
- after onboarding, only the draggable presence remains
- generated apps open as normal resizable desktop windows
- generated widgets open as smaller floating windows
- widget/app bridge calls still route through the local runtime
- `set_theme` wallpaper and SVG decoration changes are composited into a real
  macOS wallpaper image when running on macOS

## Run

```bash
npm install
npm start
```

or, once linked/published:

```bash
npx bor
```

`BOR_RUNTIME_URL=http://127.0.0.1:7777 npm start` attaches the host to an
already-running runtime instead of spawning a new one.

## Architecture

`host/main.cjs`

Starts or attaches to the Node runtime, owns native windows, streams chat over
IPC, opens generated surfaces, and applies macOS wallpapers.

`host/presence.html`

The only always-present UI after onboarding. It is a transparent, frameless,
always-on-top draggable window. It sends chat turns to the runtime and opens
generated surfaces when the model creates them.

`host/surface-preload.cjs`

Lets generated apps/widgets run as top-level desktop windows. It intercepts the
same `postMessage` bridge calls generated surfaces already use and forwards them
to `/api/widgets/:id/state`, `/api/widget-llm`, `/api/widget-search`,
`/api/widget-fetch`, and `/api/widget-image-gen`.

## Current Caveats

- Electron is the v2 host for npm visibility. A later signed Swift/AppKit host
  can replace it if we need deeper macOS integration.
- The existing browser onboarding is reused, so the old home screen still exists
  as a setup surface. v2 closes that window after provider setup.
- macOS wallpaper application is best-effort and only runs on Darwin.
- API keys are still stored by the existing runtime config path. Moving secrets
  to Keychain is the next security migration.
