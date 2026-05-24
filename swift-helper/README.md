# Bed of Roses Helper

Native macOS companion that hosts every BOR widget + app window in its own
`NSWindow` with a `WKWebView` inside. Replaces Electron's `BrowserWindow`
for surfaces so widgets pin to the home desktop Space, use system-native
window chrome, and consume ~10× less memory than Electron equivalents.

This is the "Swift helper" referenced from the LLM's plan at
`/Users/Opeyemi/.claude/plans/precious-knitting-hummingbird.md`.

## Build (local dev, ad-hoc signed)

```bash
cd swift-helper
swift build -c release
```

Output binary: `swift-helper/.build/release/BedOfRosesHelper`.

This binary is **not** a bundled `.app` — running it directly works for
Phase 1 acceptance (control-server HTTP endpoints, opening unsigned
`NSWindow`s) but most permission-dependent features (screen capture,
wallpaper) need the bundled `.app` with `Info.plist` and a code signature.

The bundled-app build script lives at `scripts/build-helper-app.sh`
(landed in Phase 7) and wraps this binary in a proper `.app` structure
with `Info.plist` + entitlements + Developer ID signature.

## Run (manual, for testing)

```bash
TOKEN=$(uuidgen)
.build/release/BedOfRosesHelper \
  --bor-helper-token=$TOKEN \
  --bor-helper-port=7798 \
  --bor-runtime-url=http://127.0.0.1:7777
```

Then in another terminal:

```bash
# Liveness probe (no auth required for this round; lol, kidding — auth IS required):
curl -s -H "x-bor-host-token: $TOKEN" http://127.0.0.1:7798/health | jq .

# Open a window with example.com inside it:
curl -sS -X POST http://127.0.0.1:7798/window/open \
  -H "x-bor-host-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"surfaceId":"test-1","kind":"widget","url":"https://example.com","bounds":{"x":200,"y":200,"width":420,"height":188}}' | jq .

# List currently-open windows:
curl -sS -H "x-bor-host-token: $TOKEN" http://127.0.0.1:7798/windows | jq .

# Close it:
curl -sS -X POST http://127.0.0.1:7798/window/close \
  -H "x-bor-host-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"surfaceId":"test-1"}' | jq .
```

## Phase status

- [x] **Phase 1** — scaffold + HTTP control server + `/window/open` (this commit)
- [ ] Phase 2 — launcher boot integration (`bin/bed-of-roses.cjs` spawns this)
- [ ] Phase 3 — full WKWebView bridge wired to the Node runtime
- [ ] Phase 4 — widget-preview cutover
- [ ] Phase 5 — wallpaper + screen capture migration
- [ ] Phase 6 — delete legacy Electron paths
- [ ] Phase 7 — distribution (sign + notarize + npm postinstall)

## Architecture

See `/Users/Opeyemi/.claude/plans/precious-knitting-hummingbird.md` for the
full plan: three sibling processes (Electron presence/onboarding, Node
runtime, this Swift helper) wired by two HTTP transports.
