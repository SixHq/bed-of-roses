# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bed of Roses (BOR) — an AI-native macOS companion. A draggable presence lives above the user's real desktop; chat turns produce generated apps, widgets, files, theme changes, or tool calls via an XML protocol.

The repo has two surfaces:
- **Classic browser shell** (`shell/` + `server/`) — original browser-hosted "empty OS" served at http://localhost:7777. Still used for onboarding.
- **v2 Mac host** (`host/`) — Electron wrapper that owns a frameless always-on-top presence window, opens generated surfaces as native windows, and applies macOS wallpapers. Reuses the same Node runtime under the hood.

See `README.md` for product framing and `HANDOFF-2026-05-20-v2-mac-presence-lifecycle.md` for the v2 migration context.

## Commands

```bash
npm start              # launch BOR: Electron host (spawns the Node runtime itself)
npx bor                # alias of npm start
npm run server         # run just the Node runtime on :7777 (open http://localhost:7777)
npm run server:dev     # same with --watch
npm run browser:install  # install Playwright Chromium for MCP browser automation
npm run browser:mcp    # run the Playwright MCP browser service standalone
```

No build step, no test suite, no lint config. Node ≥ 20. Runtime dependencies are minimal: `electron`, `@modelcontextprotocol/sdk` + `@playwright/mcp`, `croner`, and the file-extraction stack ported from Sixth (`pdf-parse`, `mammoth`, `exceljs`, `jschardet`, `iconv-lite`, `isbinaryfile`).

The user's other project at `/Users/mac/sixth-vscode-v2` (the "Sixth" AI VSCode extension) is the standing reference implementation — when building or overhauling agent capabilities (tools, file handling, context management, result formatting), scan the corresponding mechanism there first and port the proven approach.

Useful env overrides:
- `PORT` — runtime HTTP port (default 7777)
- `BOR_RUNTIME_URL=http://127.0.0.1:7777 npm start` — attach the host to an already-running runtime instead of spawning one
- `BOR_BROWSER_HEADLESS=1`, `BOR_BROWSER_EXECUTABLE_PATH=…`, `BOR_BROWSER_CHANNEL=chrome` — control the user-facing Browser app
- `BOR_CHAT_MAX_PASSES`, `BOR_CHAT_STREAM_ATTEMPTS`, `BOR_TOOL_MAX_ATTEMPTS`, `BOR_STREAM_IDLE_TIMEOUT_MS` — chat loop tuning (see `server/ai.js`, `server/retry.js`)

## Architecture

Five conceptual layers, but the real code is in three trees:

### `server/` — Node runtime (the brain)

Stdlib-only HTTP server. Single process serves the shell, proxies LLM calls, persists state, and executes tools.

**Two LLM harnesses coexist during migration.** The new native-tool-calling harness in `server/llm/` is the **default**; set `BOR_LEGACY_LLM=1` to fall back to the legacy XML-tool harness (`server/ai.js` + `server/protocol/` + `server/providers/{anthropic,openai,gemini,openai-compatible}.js`). The dispatch lives in `server/index.js` around the `/api/chat` route. Both paths share the same tool *handlers* in `server/protocol/handlers/` — the new path adapts them via a shim. Legacy code will be deleted once the new path has burned in.

- `server/index.js` — HTTP server. Routes for `/api/chat`, `/api/widgets/:id/state`, `/api/widget-llm`, `/api/widget-search`, `/api/widget-fetch`, `/api/widget-image-gen`, files, config, audit log. All paths are validated via `validateSurfaceId` and JSON-pointer helpers — preserve those guards when adding routes.
- `server/ai.js` — **legacy** harness. Builds the system prompt, runs the LLM stream, pipes parsed tag blocks through the executor, emits SSE events to the client. The chat loop is multi-pass: tool results feed back into the model until it emits `<attempt_completion/>` or hits `BOR_CHAT_MAX_PASSES`. Will be deleted in Stage 5 after the new harness ships as default.
- `server/providers/` — **legacy** LLM provider adapters. `anthropic.js`, `openai.js`, `gemini.js`, `openai-compatible.js`. Each exports `{ id, label, defaultModel, models, signupUrl, needsBaseUrl, chat }`. Register new providers by adding to `ALL_PROVIDERS` in `providers/index.js`. `providers/index.js#publicCatalog` is still used by onboarding and must survive the eventual legacy deletion. `providers/{multimodal,sse-util,limits}.js` are shared utilities — both harnesses depend on them.
- `server/llm/` — **new** native-tool-calling harness (gated by `BOR_NEW_LLM=1`).
  - `llm/types.js` — JSDoc typedefs for `ContentBlock`, `Message`, `Tool`, `ProviderEvent`.
  - `llm/providers/{anthropic,openai,gemini,openai_compatible}.js` — adapters that yield normalized `ProviderEvent`s (`text`, `tool_call_delta`, `tool_call_complete`, `turn_complete`). Each translates the canonical ContentBlock messages to its provider-native wire shape (including `tool_use` / `tool_result` blocks) and consumes its native function-calling stream.
  - `llm/providers/base.js` — `ToolCallAssembler` coalesces per-provider partial tool-call deltas into one assembled call.
  - `llm/tools/{schema,shim,registry}.js` — derives a JSON Schema from each legacy `TAG.params.{attrs,children,body}` shape and shims `execute(input, ctx)` → legacy `execute(block, ctx)`. `say` is intentionally excluded — it stays inline in assistant text.
  - `llm/stream/say_extractor.js` — small streaming parser that pulls `<say>…</say>` out of assistant text deltas and emits `say_start` / `say_delta` / `say_end` SSE events.
  - `llm/prompt/{build,cache}.js` — builder returns `{staticPrefix, dynamicSuffix}`. Caching: Anthropic via `cache_control: {type:'ephemeral'}` on the last static block + last tool; OpenAI via byte-stable prefix; Gemini via `cachedContents` with an in-process LRU keyed on sha256(staticPrefix). Static-prefix hash is audit-logged every turn (`kind: 'prompt.prefix'`).
  - `llm/loop/run.js` — the pass loop. One exit rule: assistant turn had zero `tool_use` blocks. No action-count heuristics, no completion-deferral classifiers. `chatMaxPasses` is a safety ceiling only.
  - `llm/index.js` — re-exports `runChatTurn` for `/api/chat`.
- `server/protocol/` — the XML tool protocol (Sixth-style streaming parser).
  - `parser.js` — streaming index-based parser. Supports tag attributes (`<say tone="warm">`) and CDATA payloads. `ProtocolParser.feed()`/`drain()`/`flush()` is the API.
  - `registry.js` — **single source of truth for the LLM tool surface**. Adding a tool = one entry here + one handler module. Each entry has `description`, `params`, `examples`, `voiced`, `feedsBack`, `execute`. `buildToolDocs()` renders the registry into the system prompt.
  - `executor.js` — invokes the registered handler with a per-request ctx, retries on transient failures, formats `<tool_results>` for the next pass.
  - `handlers/` — one file per family: `widget.js` (apps + widgets), `file.js`, `exec.js`, `theme.js`, `memory.js`, `computer.js` (mouse/keyboard), `tools.js` (web search/fetch/image), `surface-data.js`, `svg.js`, `ux-guidelines.js`, `agent.js`, `say.js`.
- `server/validator.js` — static checks for AI-generated widget/app HTML and shell commands. Blocks `eval`, `Function`, `parent.*` (except `parent.postMessage`), `localStorage`, external `<script src>`, heredocs, etc. Belt-and-suspenders alongside the iframe sandbox.
- `server/widget-host.js` — bridge API the iframe widgets call via `parent.postMessage` → server.
- `server/memory/` — `sessions.js`, `widgets.js`, `profile.js`, plus dream/consolidation (currently disabled in `index.js`).
- `server/runtime/` — `skills.js` (loads `.bed-of-roses/skills/`), `mcp.js` (loads `.bed-of-roses/mcp/servers.json` + per-presence `.bor/mcp.json`, dispatches MCP tool calls, `upsertBorMcpServer`/`removeBorMcpServer`), `browser.js` (resolves Chrome/Chromium + profile dirs), `browser-agent.js` (**the ambient browser** — in-process `@playwright/mcp` `createConnection` over an InMemory transport; a11y-snapshot + `[ref=eN]` tool surface behind the `browser_*` tags; persistent profile `.bed-of-roses/browser/profile`), `connectors.js` (the "Connect BOR to your daily life" catalog — declarative manifests drive the onboarding gallery, live probes, verify-then-persist storage under config `connectors`, Composio-managed Google OAuth for gmail/gcalendar with MCP wiring into `.bor/mcp.json`, `connectorEnv()` injected into `execute_command` env, `renderConnectorsBlock()` in the system prompt), `browser-use.js` (detection for the now **fallback-only** browser-use CLI).
- `server/tools/` — `web-search.js`, `web-fetch.js`, `images.js` (generate_image).
- `server/connectivity.js`, `server/retry.js` — network status + retry/backoff helpers shared by chat loop and tool executor.
- `server/api-registry.md` — Markdown reference of public web APIs the LLM is told about. Loaded into the system prompt by `ai.js`.

### `shell/` — classic browser display

Vanilla HTML/CSS/JS served by the Node runtime. No build, no framework.

- `shell/app.js` — main client. Onboarding, presence, chat input, widget grid, system apps. Connects to `/api/chat` via SSE.
- `shell/widget-bridge.js` — bootstrap script injected into widget iframes. Routes `getState/setState/askAI/webSearch/webFetch/generateImage` through `parent.postMessage` to `widget-host.js`.
- `shell/themes/` — theme handbooks + CSS. `themes/index.js` lists base themes; `design-guideline/<theme>.md` is the canonical handbook the LLM must read before generating a surface for that theme.
- `shell/memoji.js` — avatar wrapper around DiceBear `avataaars`. Never reintroduce canvas drawing here.

### `host/` — Electron Mac host

- `host/main.cjs` — Electron main process. Spawns or attaches to the Node runtime, owns the onboarding window + draggable presence window, opens generated apps/widgets as native windows, applies macOS wallpaper best-effort. Runs a small local "host control" HTTP server (`BOR_HOST_CONTROL_URL` / `BOR_HOST_CONTROL_TOKEN`) so the runtime can call back into the host.
- `host/presence.{html,js,css}` — the always-on-top presence. Collapsed orb, expanded prompt, thought bubble, tool-call visualization. This is the v2 product surface — the browser shell is reduced to onboarding.
- `host/surface-preload.cjs` — lets a generated app/widget loaded as a top-level BrowserWindow keep using the same `parent.postMessage` bridge by forwarding messages to `/api/widgets/:id/state` etc.
- `host/preload.cjs` — exposes `window.borHost` to the presence renderer.

### User data

Everything user-generated is gitignored:

- `os-data/widgets/<id>/` — one folder per app or widget. Contains `index.html`, `surface.md` (doc), `state.json`, plus thumbnail/manifest. IDs are `widget-…` or `app-…`.
- `os-data/files/` — BOR Home (the desktop files surface).
- `os-data/memory/sessions/`, `os-data/logs/audit.jsonl`, `os-data/config.json` — sessions, append-only audit, config (including API keys until the planned Keychain migration).
- `.bor/` — agent working directory: default artifact root for files the AI creates without an explicit path (`workspaces`, `files`, `images`, `downloads`, `reports`, `exports`, `scratch`).
- `.bed-of-roses/skills/` (project) and `~/.bed-of-roses/skills/` (global) — Markdown skill files, loaded into the prompt.
- `.bed-of-roses/mcp/servers.json` — MCP server config. `browserbase` is the bundled Playwright automation browser; its profile lives at `.bed-of-roses/browser/profile`. The user-facing Browser app uses a separate profile at `.bed-of-roses/browser/user-profile`.

## Adding to the LLM tool surface

The legacy XML registry in `server/protocol/registry.js` is still the single source of truth for tools — **both harnesses read it**. The new harness builds its `Tool[]` from the same `TAGS` map via `server/llm/tools/registry.js` (the shim converts legacy `execute(block, ctx)` to new `execute(input, ctx)` automatically).

To add a tool:

1. Add a handler module under `server/protocol/handlers/` exporting `execute(block, ctx)` returning `{ ok, event, payload, llmEcho }`.
2. Add an entry in `server/protocol/registry.js` `TAGS`: `description`, `params` schema, `examples`, `voiced`, optional `feedsBack: true` (legacy harness only — the new harness loops on tool-use blocks instead).
3. The legacy prompt docs + executor and the new shim/registry both pick it up automatically.

Top-level tags currently include: `say` (stream-only — never a tool), `attempt_completion`, `get_ux_ui_strict_guidelines`, `create_app`/`update_app`/`launch_app`/`delete_app`, `create_widget`/`update_widget`/`launch_widget`/`delete_widget`/`rename_widget`, `create_svg`, `set_theme`/`reset_theme`, `set_ai_name`, `reset_chat`, `list_surfaces`, `read_surface_data`/`mutate_surface_data`, file ops (`read_file`, `read_file_in_chunks`, `read_batch`, `write_file`, `write_to_file`, `replace_in_file`, `delete_file`, `list_files`, `search_files`, `list_code_definition_names`), `remember`/`recall`/`forget`, `use_skill`, MCP (`list_mcp_servers`, `list_mcp_tools`, `use_mcp_tool`, `access_mcp_resource`), computer-use (`screen_capture`, `locate_screen_element`, `computer_click`, `computer_type`, `computer_key`, `open_app`, `computer_use`), ambient browser (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_press_key`, `browser_select`, `browser_fill_form`, `browser_back`, `browser_tabs`, `browser_screenshot`, `browser_wait`, `browser_end` — act ONLY on refs from the latest snapshot; default path for interactive/signed-in web work, ahead of browser-use CLI and computer-use), `web_search`, `web_fetch`, `view_image`, `generate_image`, `execute_command` (now supports `timeout_seconds`, default 5 min, up to 30 min, stdout cap 64 KB, stderr cap 32 KB), `read_command_tail`, `list_recent_commands`.

### New-harness shim limitations

The shim treats every child as a flat string property. Tags whose children carry XML attributes (`set_theme`'s `<wallpaper from_prompt="..." size="..."/>` and `<fonts display="..." system="..." mono="..."/>`) currently work only in their string-body form via native tool calling — the `from_prompt` and `fonts` attribute forms need handler-side schema overrides. Track this for the Stage 5 cleanup if you touch `theme.js`.

## Cross-platform (Windows/Linux beta)

BOR runs on macOS (primary), Windows, and Linux. The port rules:

- **Window primitives** live in `host/platform.cjs` (`raiseAlwaysOnTop`, `ignoreMouse`, `pinToAllWorkspaces`, `setWallpaper`, `getCurrentWallpaper`) — never call `setAlwaysOnTop('screen-saver')`/`setIgnoreMouseEvents(..., {forward})` directly in `host/main.cjs`. On Linux click-through has no mousemove forwarding; the global cursor poll in `main.cjs` is the primary hover signal — don't gate it.
- **Shell**: `execute_command` runs bash (POSIX) / PowerShell (win32) via `execShell()` in `server/protocol/handlers/exec.js`; kill-tree is POSIX group-kill / `taskkill /T`. `server/validator.js` carries both POSIX and Windows danger patterns.
- **Computer-use tags are darwin-only** — gated in `server/protocol/registry.js` (`DARWIN_ONLY_TAGS`): hidden from the prompt and stubbed to a refusal off-mac. `open_app` is cross-platform. The iMessage connector card is darwin-only via `platforms: ['darwin']` in `server/runtime/connectors.js`.
- **App shortcuts**: per-platform backends in `host/native-apps.cjs` (mac .app bundles / linux .desktop / windows Start-Menu .lnk) sharing a Node launcher + `~/.bed-of-roses/host-control.json` discovery.
- **Wallpaper**: compose is shared (offscreen render); apply is helper/osascript (mac), SystemParametersInfo (win), gsettings/plasma (linux). The user's original wallpaper is snapshotted before first apply and restored on `reset_theme`.
- Prompt copy is parametrized via `PLATFORM_NOUNS` in `server/ai.js` — don't hardcode "Mac"/"Finder" in doctrine or always-on tool docs.
- Tests: `npm test` (`test/platform-port.test.mjs`) fakes `process.platform` in child processes; CI (`.github/workflows/ci.yml`) runs tests + runtime/Electron boot smokes on ubuntu/windows/macos.

## Conventions

- **Strict B&W aesthetic.** No emojis, gradients, or color in UI code. Apple-grade only. Run the design skill before any UI redesign — see `feedback_visual_taste.md` in memory.
- **LLM model IDs go stale.** Before editing `server/providers/*.js`, fetch live docs (Gemini 2.5/3.1, GPT-5.x, Anthropic 4.x). See `feedback_model_freshness.md`.
- **Avatar = DiceBear avataaars only.** Extend `shell/memoji.js`; never hand-roll canvas drawing.
- The default file root for AI-created files (when the user didn't supply a path) is `.bor/`, not the project tree.
- Widgets/apps are sandboxed iframes. They have no DOM access outside their frame; all I/O goes through `parent.postMessage` → `widget-host.js` and is validated server-side.
- **Web-access priority order** (baked into the prompt doctrine in `ai.js`): connected MCP/connector tools first (never a browser for email when a mail tool exists) → `web_fetch` for plain readable pages → ambient `browser_*` tags for interactive/JS/signed-in work → browser-use CLI (opt-in fallback, only when installed) → computer-use. The final onboarding pane is the connectors gallery (`/api/connectors` routes; `?connectors=1` deep link reopens it).
- Audit everything that mutates state — call `ctx.audit({ kind, … })` from handlers.
