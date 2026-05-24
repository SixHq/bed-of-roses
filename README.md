# 🌹 Bed of Roses

**An AI-native operating system.** The OS boots into an empty canvas with a customizable AI companion. You talk; the AI builds the UI on the fly. There are no pre-installed apps — your desktop fills up organically with widgets purpose-built for how *you* use a computer.

This repository is **Phase 1 — Proof of Concept**. The full vision (dreaming/memory consolidation, voice, mobile PWA, bootable Linux ISO) is mapped out in the design document and implemented incrementally.

## What works today

- Five-layer architecture scaffold (Base OS / Display Shell / System Bridge / AI Core / Widget Runtime)
- Onboarding flow: name your AI → pick an avatar style → enter an Anthropic API key
- Homepage with animated avatar, chat input, responsive widget tiles, and seeded Files / Browser system apps
- Structured AI protocol: every model response is `chat`, `widget`, or `command`
- Widgets are self-contained HTML files saved to `os-data/widgets/<id>/`, rendered in sandboxed iframes
- Files app opens the user’s real home folder through the local Node bridge, with `os-data/files/` pinned as BOR Home for native BOR-created files
- Browser app opens a real Chrome/Chromium window with its own BOR profile, separate from browser automation
- Persistence across reloads — widgets and config survive restarts
- Bundled Playwright MCP browser service for real browser automation, login flows, screenshots, and authenticated dashboards
- Static code validation blocks dangerous patterns (`eval`, `Function`, `parent` access, etc.)
- Audit log of every AI action under `os-data/logs/audit.jsonl`

## Run it

```bash
node --version    # need >= 20
npm start
```

Open <http://localhost:7777>. First boot drops you into onboarding. Bring your own Anthropic API key.

### Browser automation

BOR ships with two browser surfaces:

- **Browser app** — the user-facing default browser tile. It launches installed Chrome/Edge/Chromium or bundled Playwright Chromium with a dedicated profile at `.bed-of-roses/browser/user-profile`.
- **Playwright MCP browser** — the agent automation browser configured as `browserbase` in `.bed-of-roses/mcp/servers.json`. It uses a separate profile at `.bed-of-roses/browser/profile`, so automation and user browsing do not lock or overwrite each other.

Runtime files under `.bed-of-roses/browser/` are ignored by git.

Useful overrides:

```bash
npm run browser:install
BOR_BROWSER_HEADLESS=1 npm start
BOR_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm start
BOR_BROWSER_CHANNEL=chrome npm start
```

## Project layout

```
server/        Layer 2 — Node.js system bridge (HTTP, LLM proxy, persistence)
shell/         Layer 1 — Display shell (vanilla HTML/CSS/JS served to Chromium)
os-data/       User data — widgets, memory, logs, config (gitignored)
.bed-of-roses/ Local skills, MCP config, and generated browser profile data
```

## Roadmap

See the design document for the full plan. Short version:

| Phase | Focus | Status |
|---|---|---|
| 1 | Proof of concept — talk → build → render | ✅ this repo |
| 2 | Multi-provider LLM, full onboarding, permission tiers, system bridge file APIs | next |
| 3 | Dreaming, semantic memory, voice, image gen | planned |
| 4 | Linux ISO, mobile PWA, widget marketplace | planned |

🌹 Open source. Contributions welcome.
