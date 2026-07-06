<div align="center">

<!-- MAINTAINER: drop a wordmark at docs/assets/bor-logo.svg (and -dark.svg) and the <picture> below lights up. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bor-logo-dark.svg">
  <img src="docs/assets/bor-logo.svg" alt="Bed of Roses" width="460" onerror="this.style.display='none'">
</picture>

# 🌹 Bed of Roses

**An AI-native companion for macOS.** A draggable presence lives above your real desktop. You talk to it; it builds the interface back — apps, shortcuts, files, theme changes, real Mac actions — on the fly. No pre-installed apps. Your desktop fills up with software purpose-built for how *you* work.

<p>
  <a href="https://github.com/SixHq/bed-of-roses/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/SixHq/bed-of-roses/ci.yml?branch=main&style=for-the-badge&label=CI&color=000000" alt="CI"></a>
  <a href="https://www.npmjs.com/package/bed-of-roses"><img src="https://img.shields.io/npm/v/bed-of-roses?style=for-the-badge&color=000000" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-000000?style=for-the-badge" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-000000?style=for-the-badge" alt="Node >= 20">
  <img src="https://img.shields.io/badge/platform-macOS-000000?style=for-the-badge" alt="Platform: macOS">
  <a href="https://github.com/SixHq/bed-of-roses/stargazers"><img src="https://img.shields.io/github/stars/SixHq/bed-of-roses?style=for-the-badge&color=000000" alt="Stars"></a>
</p>

[Quickstart](#quickstart) · [What it can do](#what-bed-of-roses-can-do) · [The presence](#the-presence) · [Providers](#providers--models) · [Security](#security-model) · [CLI](#cli-reference) · [Architecture](#architecture) · [Configuration](#configuration) · [Contributing](CONTRIBUTING.md)

</div>

---

**Bed of Roses (BOR)** is a single-user, local-first AI companion you run on your own Mac. It is not a chat window — it's an ambient runtime. A frameless orb floats over your actual desktop; when you ask for something, BOR generates and renders the software to do it: a full-screen **app**, a small live **shortcut** card, a file, an SVG, a new theme, or a sequence of real **computer actions** (clicking, typing, opening apps). It brings its own browser, runs scheduled jobs, remembers what matters, talks to MCP servers, and can run **many isolated presences** side by side.

You bring your own model. BOR speaks to **Anthropic (Claude), OpenAI (GPT), Google (Gemini), and any OpenAI-compatible endpoint** (DeepSeek, Groq, OpenRouter, Together, Mistral, Ollama, LM Studio, …), or you can buy **BOR credits** and skip per-provider keys entirely.

If you want a personal assistant that feels local, fast, always-on, and *builds you tools instead of just answering*, this is it.

> **Platform:** macOS only · **Runtime:** Node ≥ 20 · **License:** Apache-2.0

---

## Quickstart

```bash
# Install (recommended)
npm install -g bed-of-roses

# Create your first presence and run guided onboarding
bor onboard
```

`bor onboard` spins up a fresh presence and walks you through naming your AI, picking an avatar + theme, and connecting a model (paste a provider API key, or sign in for BOR credits). That's it — the orb appears over your desktop and you start talking.

No global install? Use `npx bor`. Prefer running from source? See [From source](#from-source-development).

---

## What Bed of Roses can do

BOR's surface area is wide. Everything below is a real capability in this repo — the LLM drives it through a single tool registry (`server/protocol/registry.js`), every generated surface is sandboxed, and every state change is audited.

### It builds surfaces

| Surface | What it is |
|---|---|
| **App** | A full-screen native Mac window you return to — dashboards, CRUD tools, multi-screen workflows, settings. Persists state, mirrored to `~/Applications` as a launchable `.app`. |
| **Shortcut** | A small, live iframe card that renders *inside the presence's thought bubble* — a converter, a pay input, a one-shot API caller, a toggle. |
| **SVG decoration** | Raw inline SVG stickers/logos/mascots placed as background decoration. |
| **Theme** | Accent color, Google fonts, atmosphere, and macOS wallpaper (including an image generated from a prompt). |
| **Files** | Real files written to your disk (default artifact root `.bor/`, or anywhere in your home). |

### It uses tools

- **Files & code** — read/write/replace/search files, list directories, extract code definitions, batch-read up to 20 paths.
- **Shell** — run real single-line commands (5-min default timeout, up to 30 min; 64 KB stdout captured, paginated).
- **Computer use** — screenshot your real screen, locate UI elements with a vision model, then click/type/press-keys/open-apps to drive any Mac app.
- **Web & images** — web search, web fetch (server-rendered text), image generation, and vision description of external images.
- **Memory** — remember / recall / forget durable first-person facts, re-injected every session.
- **MCP** — list, inspect, and call tools/resources on any [Model Context Protocol](https://modelcontextprotocol.io) server you configure.
- **Skills** — load Markdown skill playbooks from `.bed-of-roses/skills/` on demand.
- **Scheduled tasks (cron)** — `at` / `every` / cron-expression jobs that run real agent turns or post reminders, with no polling.
- **Notifications** — a persistent inbox behind the bell in the presence bubble for background/scheduled results.
- **Media** — embed tweets, YouTube/Vimeo, TikTok/Instagram reels, and images as cards.

### It comes with apps

- **Files** — browse BOR Home (`os-data/files`) *and* your real home folder through the local bridge.
- **Browser** — a real Chrome/Chromium window with its own profile, separate from automation.
- **Browser automation** — a bundled Playwright MCP browser (`browserbase`) for logins, scraping, screenshots, and authenticated dashboards.

### It runs many of itself

- **Multi-presence** — each presence is a fully isolated BOR: its own runtime process, port, data root, config, memory, cron, notifications, and orb. Manage them all from the **Main app**.

---

## The presence

<!-- MAINTAINER: a short screen-recording here sells the project. Drop it at docs/assets/demo.gif. -->
<div align="center">
  <img src="docs/assets/demo.png" alt="Bed of Roses presence over the desktop" width="720" onerror="this.style.display='none'">
</div>

The presence is a transparent, always-on-top, click-through orb pinned across all spaces (including full-screen apps). It has four states:

- **Orb** (collapsed) — idle / thinking / busy. Sleeps after 5 minutes. Toggle anytime with **⌘⌥Space**.
- **Prompt** (expanded) — a `$>` composer with attachments (drag-drop files, folders, or images) and send.
- **Thought bubble** (thinking) — a live activity stream: streamed thoughts, a thinking timer, tool-call cards, media cards, and any shortcut surfaces — resizable on all eight edges, minimizable to a task chip.
- **Notification chip** — unread results from background and scheduled work.

It applies your chosen **wallpaper** to the real macOS desktop, hides itself during screen captures, and visualizes each tool call inline as it happens.

---

## Highlights

- **Talk → build → render.** Every turn can produce apps, shortcuts, files, themes, or real actions — not just text.
- **Bring any model.** Claude, GPT, Gemini, or any OpenAI-compatible endpoint — or BOR credits with no keys.
- **Computer use.** BOR can see your screen and operate real Mac apps (Screen Recording + Accessibility permissions).
- **Browser automation.** Bundled Playwright MCP browser with a dedicated profile.
- **MCP-native.** Connect external tool servers via stdio / SSE / streamable-HTTP.
- **Skills.** Drop a `SKILL.md` in `.bed-of-roses/skills/` and the agent can load it on demand.
- **Scheduled agents.** Real cron jobs that run agent turns and notify you — built for unattended work.
- **Multi-presence.** Run isolated assistants in parallel, each with its own data and orb.
- **Native app wrappers.** Generated apps show up in Finder and Spotlight as real `.app`s.
- **Local-first & audited.** Everything runs on `127.0.0.1`; every state change lands in an append-only audit log.

---

## The full tool surface

The LLM speaks an XML tool protocol; `server/protocol/registry.js` is the single source of truth. A tour of every family:

<details>
<summary><strong>Apps &amp; shortcuts</strong></summary>

| Tool | Does |
|---|---|
| `create_app` / `update_app` / `launch_app` / `delete_app` | Create, evolve, open, or remove a full-screen Mac app. |
| `create_shortcut` / `update_shortcut` / `launch_shortcut` / `delete_shortcut` | Create, evolve, mount, or remove a thought-bubble shortcut card (`bubbleHeight` 160–600px). |
| `get_ux_ui_strict_guidelines` | **Required before any app/shortcut** — loads the active theme handbook + the shortcut-card contract. |

Both surface types are sandboxed iframes that reach state/LLM/web/images/cron/notifications through a validated `parent.postMessage` bridge.
</details>

<details>
<summary><strong>Surfaces &amp; data</strong></summary>

| Tool | Does |
|---|---|
| `list_surfaces` | List every app/shortcut with ids and paths. |
| `read_surface_data` / `mutate_surface_data` | Read or JSON-Patch a surface's persisted `state.json` (read-before-write enforced). |
| `create_svg` | Save inline `<svg>` as background decoration. |
</details>

<details>
<summary><strong>Files</strong></summary>

`read_file`, `read_file_in_chunks`, `read_batch` (≤20 paths), `write_file`, `write_to_file`, `replace_in_file` (SEARCH/REPLACE), `delete_file`, `list_files`, `search_files` (regex), `list_code_definition_names`. Reads support virtual roots `device:/` (home) and `bor:/` (BOR files); writes are refused in reserved areas (`server/`, `shell/`, `.git/`, outside `$HOME`). Default artifact root: **`.bor/`**.
</details>

<details>
<summary><strong>Shell, theme, memory</strong></summary>

- **Shell:** `execute_command` (single-line; default 5-min / max 30-min timeout; 64 KB stdout / 32 KB stderr captured for the last 8 runs), `read_command_tail`, `list_recent_commands`.
- **Theme:** `set_theme` (accent · fonts · atmosphere · wallpaper, including `from_prompt` generation), `reset_theme`, `set_ai_name`, `reset_chat`.
- **Memory:** `remember`, `recall`, `forget` (durable first-person facts).
</details>

<details>
<summary><strong>Computer use</strong></summary>

`screen_capture`, `locate_screen_element` (vision), `computer_click`, `computer_type`, `computer_key`, `open_app`, and `computer_use` (a bounded screenshot→action loop, `max_steps` 1–20). Requires Screen Recording + Accessibility permissions and a vision-capable provider.
</details>

<details>
<summary><strong>Web, images, media, MCP, skills, scheduling</strong></summary>

- **Web/images:** `web_search`, `web_fetch`, `view_image` (external URLs only), `generate_image` (OpenAI / Gemini).
- **Media cards:** `display_tweet`, `display_media`.
- **MCP:** `list_mcp_servers`, `list_mcp_tools`, `use_mcp_tool`, `access_mcp_resource`.
- **Skills:** `use_skill`.
- **Scheduling:** `cron` (`status`/`list`/`get`/`add`/`update`/`remove`/`run`; `at`/`every`/`cron` schedules; `agentTurn` or `systemEvent` payloads), `push_notification`.
- **Loop control:** `attempt_completion` (stop signal), `wait_for_human_input` (OTP/MFA/credentials/confirmation barrier). `say` is stream-only — it renders thoughts and is never a callable tool.
</details>

---

## Providers & models

You configure a provider during onboarding (or in the Main app). Models currently exposed by each:

| Provider | Billing | Models |
|---|---|---|
| **Bed of Roses credits** | BOR account (no API key) | Claude Opus 4.8, Claude Sonnet 4.5, GPT-5.4, GPT-5.4 mini, DeepSeek V3, DeepSeek R1 |
| **Anthropic** | Your API key | Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5 |
| **OpenAI** | Your API key | GPT-5.5, GPT-5.4 / mini / nano, GPT-4o (legacy) |
| **Google Gemini** | Your API key | Gemini 3.x / 2.5 Pro / Flash / Flash-Lite |
| **OpenAI-compatible** | Your API key (or none, local) | Any model id — presets for Groq, OpenRouter, Together, Mistral, Perplexity, Fireworks, DeepInfra, Cerebras, Ollama, LM Studio |

**BOR credits** stream through a metered proxy that deducts your balance server-side as the response runs (BOR is open source, so the client is never trusted to self-report spend), with per-presence spend attribution. Image generation is available on OpenAI and Gemini.

> Model ids reflect the current build and evolve quickly — see `server/providers/` for the live list.

---

## Security model

BOR runs an LLM that writes HTML, executes shell commands, and can drive your real desktop. The defaults are conservative:

- **Sandboxed surfaces.** Every generated app/shortcut runs in a sandboxed iframe with no DOM access outside its frame. All I/O goes through `parent.postMessage` → server, validated server-side.
- **Static validator** (`server/validator.js`) rejects AI-generated HTML containing `eval`, `new Function`, `document.cookie`, `window.parent`/`top`/`opener`, any `parent.*` except `parent.postMessage`, external `<script src>`, dynamic `import()`, `localStorage`/`sessionStorage`/`indexedDB`, and `setInterval` faster than 5s; surfaces are capped at 200 KB.
- **Shell guards.** Commands are single-line only; heredocs, piped-to-shell network installs, `rm -rf /` / `~`, fork bombs, `mkfs`, `dd` to disk, and any command that would restart the BOR host are blocked.
- **Audit log.** Every state-mutating action is appended to `os-data/logs/audit.jsonl`.
- **Local-first.** Everything binds to `127.0.0.1`; the host-control server rejects non-loopback callers and requires a per-boot token.
- **Bring-your-own keys.** Provider API keys you enter are stored locally in `os-data/config.json` (a Keychain migration is planned — treat the data dir as sensitive today).

Found a vulnerability? See [SECURITY.md](SECURITY.md) — please report privately.

---

## CLI reference

```text
bor                        Launch the host (the presence over your desktop)
bor onboard                Create a new presence and run guided onboarding
bor create [name]          Register a new presence (headless); prints its id
bor delete <presence_id>   Delete a presence and its data
bor list                   List presences (id, nickname, onboarded)   (alias: ls)
bor --help | -h            Show help
```

`create` / `delete` / `list` are headless registry operations and never launch the app. If the host is already running, restart it to pick up those changes.

---

## Architecture

BOR has **two display surfaces** over **one Node runtime**:

- **Classic browser shell** (`shell/` + `server/`) — vanilla HTML/CSS/JS served at `http://localhost:7777`, now used for onboarding.
- **v2 Electron Mac host** (`v2/host/`) — the real product: the frameless presence, generated surfaces as native windows, macOS wallpaper, and native `.app` wrappers.

The code lives in three trees:

| Tree | Layer | Responsibility |
|---|---|---|
| `server/` | The runtime ("brain") | Stdlib-only HTTP server: serves the shell, proxies LLM calls, executes tools (`protocol/handlers/`), persists state, audits everything. |
| `shell/` | Display shell | Onboarding + classic browser UI. No build, no framework. |
| `v2/host/` | Electron Mac host | Presence lifecycle, multi-presence, native windows, wallpaper, `.app` wrappers, host-control server. |

**Multi-presence:** each presence gets `os-data/presences/<id>/` (its own config, surfaces, memory, cron, notifications, logs, images, files), its own runtime process, and its own port — coordinated by the host-global registry `os-data/presences.json`.

**User data** (all gitignored): `os-data/` (surfaces, files, memory, logs, config), `.bor/` (agent artifacts), `.bed-of-roses/` (skills, MCP config, browser profiles).

---

## Configuration

BOR is configured through onboarding; everything else is environment overrides. The most useful:

| Variable | Controls | Default |
|---|---|---|
| `PORT` | Runtime HTTP port | `7777` |
| `BOR_PROVIDER_MAX_OUTPUT_TOKENS` | Max output tokens (floor 1024) | `32768` |
| `BOR_PROVIDER_REASONING_EFFORT` | Reasoning effort: `none`…`max` | `max` |
| `BOR_CHAT_MAX_PASSES` | Safety ceiling on the tool loop | unlimited |
| `BOR_STREAM_IDLE_TIMEOUT_MS` | Abort a stream after N ms idle (`0` disables) | `60000` |
| `BOR_TOOL_MAX_ATTEMPTS` | Tool retry attempts on transient failures | `2` |
| `BOR_BROWSER_HEADLESS` | Run the automation browser headless | off |
| `BOR_BROWSER_EXECUTABLE_PATH` | Chrome/Chromium binary path | auto |
| `BOR_BROWSER_CHANNEL` | Browser channel (e.g. `chrome`) | Playwright Chromium |
| `BOR_PRESENCE_ID` / `BOR_PRESENCE_NAME` | Per-presence spend attribution (set by the host) | — |

There are many more (per-provider tuning, browser automation flags, connectivity probes, host-control ports) — grep `process.env.BOR_` under `server/` and `v2/`.

### Browser automation

```bash
npm run browser:install     # install Playwright Chromium for the MCP browser
npm run browser:mcp         # run the automation browser service standalone
```

The user-facing **Browser** app and the **automation** browser use separate profiles (`.bed-of-roses/browser/user-profile` vs `.bed-of-roses/browser/profile`) so they never collide.

---

## From source (development)

```bash
git clone https://github.com/SixHq/bed-of-roses.git
cd bed-of-roses
npm install

npm run v2      # launch the Electron Mac host (spawns the runtime itself)
# or
npm start       # run just the Node runtime + classic shell on http://localhost:7777
npm run dev     # same, with --watch
```

No build step, no bundler. The runtime is stdlib-only except `electron` and the MCP/Playwright packages. Verify changes with `node --check` (there's no test suite yet — see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Roadmap

| Status | Item |
|---|---|
| ✅ Shipped | v2 Electron presence, multi-presence, generated apps/shortcuts, multi-provider LLM, computer use, browser automation, MCP, skills, cron + notifications, native `.app` wrappers, the `bor` CLI |
| 🔬 In progress | BOR credits, native Swift window/wallpaper helper, Keychain key storage |
| 🗺️ Planned | Memory consolidation ("dreaming"), voice, a richer app marketplace |

---

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions (strict B&W UI, audit state changes, no new deps), and how to extend the tool/provider surface. Be kind: [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately per [SECURITY.md](SECURITY.md). Please don't open public issues for security problems.

## License

[Apache-2.0](LICENSE) © SixHq. See [NOTICE](NOTICE).

## Acknowledgements

Built on [Electron](https://www.electronjs.org/), [Playwright](https://playwright.dev/) + the [Model Context Protocol](https://modelcontextprotocol.io), [DiceBear](https://www.dicebear.com/) avatars, and the Anthropic / OpenAI / Google / DeepSeek model ecosystems.

<div align="center">
🌹 <em>Open source. Contributions welcome.</em>
</div>
