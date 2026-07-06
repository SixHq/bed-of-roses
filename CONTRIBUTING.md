# Contributing to Bed of Roses

Thanks for your interest in improving Bed of Roses (BOR) — an Apache-2.0,
AI-native macOS companion. This guide covers everything you need to get a
local build running and land a change that fits the project's conventions.

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **macOS** — BOR is darwin-only (it owns an always-on-top presence window and
  applies macOS wallpapers via the Electron host).
- **Node.js >= 20** — the runtime is stdlib-only; check with `node --version`.
- **npm** — for installing the small dependency set (`electron`, the MCP SDK,
  Playwright MCP, `croner`).

```bash
git clone https://github.com/SixHq/bed-of-roses.git
cd bed-of-roses
npm install
```

## Running it

BOR has two surfaces that share the same Node runtime:

```bash
npm run v2     # v2 Mac host: launches the Electron presence (spawns the runtime)
npx bor        # alias of `npm run v2`
npm start      # classic browser shell: runtime on http://localhost:7777
npm run dev    # classic shell with --watch
```

The classic shell is now used mainly for onboarding; the v2 Electron host in
`v2/host/` is the primary product surface.

Useful env overrides while hacking:

- `PORT` — runtime HTTP port (default `7777`)
- `BOR_RUNTIME_URL=http://127.0.0.1:7777 npm run v2` — attach the host to an
  already-running runtime instead of spawning a new one
- `BOR_LEGACY_LLM=1` — fall back to the legacy XML-tool harness (the native
  tool-calling harness in `server/llm/` is the default)

The CLI surface mirrors the host commands:

```bash
bor onboard            # first-run setup
bor create [name]      # create a new presence
bor list               # list presences
bor delete <presence_id>
```

## Project layout

The real code lives in three trees (see `CLAUDE.md` for the full map):

- `server/` — the Node runtime: stdlib-only HTTP server, LLM proxy, state
  persistence, and tool execution.
- `shell/` — the classic vanilla HTML/CSS/JS browser display.
- `v2/host/` — the Electron Mac host (presence window, native surfaces,
  wallpaper).

## Conventions (please read before opening a PR)

These are non-negotiable house rules. PRs that violate them will be asked to
change before review.

- **Strict black-and-white aesthetic.** No emojis, gradients, or color in
  product UI code. Apple-grade only.
- **Audit every state mutation.** Any handler that changes state must call
  `ctx.audit({ kind, … })`. The append-only audit log is part of the security
  model.
- **Validate surface IDs.** All routes that touch user surfaces go through
  `validateSurfaceId` and the JSON-pointer helpers — preserve those guards when
  adding routes.
- **No new runtime dependencies.** The runtime is intentionally stdlib-only
  except for `electron`, `@modelcontextprotocol/sdk`, `@playwright/mcp`, and
  `croner`. Don't reach for a library where stdlib will do.
- **AI-generated HTML is untrusted.** Widgets and apps are sandboxed iframes
  with no DOM access outside their frame; all I/O goes through
  `parent.postMessage` and is validated server-side. Keep it that way.
- **LLM model IDs go stale.** Before editing provider adapters in
  `server/providers/*.js` or `server/llm/providers/*.js`, fetch live docs for
  the current model names.

## Extending the tool & provider surface

**Tools.** `server/protocol/registry.js` is the single source of truth for the
LLM tool surface — *both* harnesses read it. To add a tool:

1. Add a handler module under `server/protocol/handlers/` exporting
   `execute(block, ctx)` that returns `{ ok, event, payload, llmEcho }`.
2. Add an entry to the `TAGS` map in `server/protocol/registry.js` with
   `description`, `params`, `examples`, `voiced`, and optionally `feedsBack`.

The legacy prompt docs/executor and the new harness shim
(`server/llm/tools/registry.js`) both pick it up automatically.

**Providers.** Register a legacy provider by adding it to `ALL_PROVIDERS` in
`server/providers/index.js`; each exports
`{ id, label, defaultModel, models, signupUrl, needsBaseUrl, chat }`. The new
harness has matching adapters under `server/llm/providers/`. All providers are
first-class — never optimize for one provider at the expense of others.

## Testing

There is **no test suite, lint config, or build step** in this repo. The
expected baseline check for any change is a syntax pass:

```bash
# syntax-check the files you touched
node --check server/index.js

# or sweep the whole runtime
find server v2/host bin -name '*.js' -o -name '*.cjs' | while read -r f; do
  node --check "$f" || echo "FAILED: $f"
done
```

CI on `macos-latest` (Node 20 and 22) runs exactly this syntax sweep, so keep
it green. Manually exercise UI-affecting changes via `npm run v2` and, for
onboarding/shell changes, `npm start`.

## Pull request process

1. Fork and branch off `main` (use a descriptive branch name).
2. Keep PRs focused — one logical change per PR.
3. Run `node --check` on every file you touched (and exercise the app for UI
   changes).
4. Fill out the PR template: summary, type of change, testing notes,
   screenshots for any UI change, and the checklist.
5. Make sure no secrets, API keys, or `os-data/` artifacts are committed.

## Commit style

- Write clear, imperative-mood subject lines (e.g. "Add cron handler",
  "Fix presence drag jitter").
- Keep the subject under ~72 characters; use the body to explain *why*.
- Group related work into logical commits rather than one giant blob.

## Questions

Open a [Discussion or issue](https://github.com/SixHq/bed-of-roses/issues) if
anything here is unclear — improvements to this guide are welcome too.
