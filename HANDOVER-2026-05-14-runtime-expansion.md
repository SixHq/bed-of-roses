# Bed of Roses Handover

Date: 2026-05-14
Project root: `/Users/Opeyemi/open-source-os`
Focus of this pass: agent-runtime expansion, same-turn tool continuation, MCP foundation, SVG-native autonomous customization

## 1. What this pass was trying to solve

The project already had a lot of the product behavior the user wanted:

- XML tool protocol
- streaming chat
- widget memory/state bridge
- widget-side AI access
- widget-side web search / fetch / image generation
- dream scheduler running 6×/day
- before/after narration around visible actions

The real missing layer was the **agent runtime**:

- a reusable skill-loading system
- real MCP discovery and execution
- a first-class `create_svg` tool for decorations, instead of hacking everything through wallpaper or raw CSS
- a same-turn tool loop so the main LLM could search/fetch/load skills/use MCP and then continue the same answer immediately

That is what this pass implemented.

## 2. Important framing: what already existed before this pass

Do not re-implement these unless they are broken:

- The main LLM already narrates visible work with a brief `<say>` before and after actions.
- Widgets already have durable state via `getState()` / `setState()`.
- Widgets already have same-provider AI access via `askAI(prompt, opts?)`.
- Widgets already have `searchWeb`, `fetchUrl`, and `generateImage`.
- Top-level LLM already had `web_search`, `web_fetch`, `view_image`, `generate_image`.
- Dreaming already existed and already ran on a 6-times-a-day cron-like schedule plus idle backstop.
- The system prompt already pushes the LLM toward building widgets instead of only speaking.
- The system prompt already had anti-hallucination rules and stronger widget quality rules.

This pass was not another prompt-only tweak. It was a runtime/tooling expansion.

## 3. What was added in this pass

### 3.1 Same-turn tool continuation

Before this pass:

- The LLM could emit tools like `<web_search>` or `<web_fetch>`.
- But the result mostly only helped on the next user turn, not the same request.

Now:

- `server/ai.js` runs a bounded multi-pass loop (`MAX_PASSES = 4`).
- If the model emits a tag marked `feedsBack`, the server:
  - records the emitted assistant XML
  - synthesizes a follow-up user message containing the tool results
  - calls the model again in the **same** chat turn
- This means the model can:
  - search
  - fetch
  - read a file
  - load a skill
  - inspect MCP tools
  - call an MCP tool
  - then continue building the final widget / answer without waiting for another user message

Important implementation detail:

- The follow-up pass does **not** just append tool results as assistant text.
- It adds a synthetic `role: 'user'` message:
  - `"Tool results from your last actions. Continue the same request and emit XML tags only."`
- This is much closer to the normal agent/tool loop pattern and lets the model react correctly.

### 3.2 Skills runtime

Added:

- `server/runtime/skills.js`
- `.bed-of-roses/skills/browserbase/SKILL.md`

Behavior:

- Skills are discovered in two locations:
  - local: `./.bed-of-roses/skills`
  - global: `~/.bed-of-roses/skills`
- Local overrides global for same-name skills.
- Skills are parsed from `SKILL.md` with YAML frontmatter:
  - `name`
  - `description`
- Body content is stripped of frontmatter and returned to the model.

New tag:

- `<use_skill name="browserbase"/>`

Handler:

- `server/protocol/handlers/agent.js`

Result:

- The loaded skill body is returned as a tool result.
- Because `use_skill` is marked `feedsBack: true`, the model can consume the skill content in the same turn and continue.

Seeded built-in skill:

- `browserbase`

What it currently is:

- A browser workflow skill telling the model to:
  - use BOR's bundled `browserbase` MCP server first
  - inspect their tools
  - use them for browser-native flows like login, click, type, OAuth, API key creation

What it is not:

- It is not the browser binary or MCP server itself.
- The actual default browser service is now `server/mcp/playwright-service.js`, backed by `@playwright/mcp`.

### 3.3 MCP foundation

Added:

- `server/runtime/mcp.js`
- `.bed-of-roses/mcp/servers.json`
- dependency: `@modelcontextprotocol/sdk@^1.29.0`
- dependency: `@playwright/mcp@^0.0.75`

The runtime mirrors the broad shape of Sixth's MCP setup but is intentionally smaller.

Config discovery:

- local: `./.bed-of-roses/mcp/servers.json`
- global: `~/.bed-of-roses/mcp/servers.json`
- local overrides global by server name

Supported transport types:

- `stdio`
- `sse`
- `streamable-http`
- `http` (aliased to streamable-http path)

Supported operations:

- list servers
- list tools
- list resources
- list resource templates
- call tool
- read resource

New tags:

- `<list_mcp_servers/>`
- `<list_mcp_tools server="browserbase"/>`
- `<use_mcp_tool server="browserbase" tool="browser_navigate"><![CDATA[{...}]]></use_mcp_tool>`
- `<access_mcp_resource server="..." uri="..."/>`

Handlers:

- `server/protocol/handlers/agent.js`

Prompt exposure:

- `server/ai.js` now includes:
  - an **Available skills** block
  - a **Configured MCP servers** block
  - explicit guidance for browser/login/API-key workflows

Current default template:

- `.bed-of-roses/mcp/servers.json` enables a local `browserbase` server:
  - `type: "stdio"`
  - `command: "node"`
  - `args: ["server/mcp/playwright-service.js"]`
- `.bed-of-roses/mcp/servers.json` also keeps a disabled `browserbase-cloud` placeholder:
  - `type: "streamable-http"`
  - placeholder URL
  - placeholder Bearer token

Important caveat:

- MCP support is now real in code.
- Browser automation is now wired to a real local Playwright MCP server.
- Gmail/social/API-key flows still depend on credentials, MFA, and each site's automation defenses.

### 3.4 `create_svg` tool and home-screen decorations

Added:

- `server/protocol/handlers/svg.js`

New tag:

- `<create_svg ...>raw svg...</create_svg>`

What it does:

- Saves SVG markup into:
  - `shell/themes/<active-theme>/assets/<id>.svg`
- Adds a decoration object to config:
  - `cfg.decorations`
- Pushes updated config back to the shell via the normal `set_theme`-style config refresh path

Supported attributes:

- `name`
- `anchor`
- `x`
- `y`
- `width`
- `height`
- `opacity`
- `rotate`
- `drift`
- `blend`
- `z`

Decoration config shape:

```json
{
  "id": "arsenal-cannon",
  "name": "arsenal-cannon",
  "type": "svg",
  "themeId": "pixel-crt",
  "url": "/themes/pixel-crt/assets/arsenal-cannon.svg",
  "width": "180px",
  "height": "220px",
  "opacity": 0.88,
  "rotate": "-8deg",
  "anchor": "bottom-right",
  "x": "32px",
  "y": "24px",
  "drift": "slow",
  "blend": "normal",
  "z": 0
}
```

Why this matters:

- The LLM now has a native way to place logos, mascots, stickers, floating marks, or decorative search-bar frames **without** changing wallpaper.
- This was explicitly requested by the user.

### 3.5 Shell support for decorations

Added or changed:

- `shell/index.html`
  - new `<div id="decor-layer" class="decor-layer" aria-hidden="true"></div>`
- `shell/style.css`
  - `.decor-layer`
  - `.home-decoration`
  - float animations for `drift="slow"` and `drift="medium"`
- `shell/app.js`
  - `state.decorations`
  - `renderDecorations()`
  - `applyConfigSnapshot()` now applies `cfg.decorations`
  - decorations are re-rendered when base theme changes
  - `show(screenId)` hides decorations outside Home

Render behavior:

- Only decorations with matching `themeId === state.baseTheme` are rendered.
- Decorations are positioned by anchor + offsets.
- They are pointer-events none.
- They are hidden on splash/onboarding and shown on home.

### 3.6 Config model extended

Changed:

- `server/index.js`

Config now carries:

- `decorations`

`publicConfig(cfg)` now returns:

- `decorations: []`

`mergeConfig()` now merges:

- `decorations`

`reset: true` now clears:

- `decorations`

Legacy config migration now preserves:

- `baseTheme`
- `wallpaper`
- `decorations`
- `theme`

### 3.7 Dream action phase updated to use `create_svg`

Changed:

- `server/memory/dream.js`

What changed:

- `create_svg` added to dream action allowlist
- Dream guidance now explicitly says:
  - use `create_svg` first for objects in the room
  - use `user-extras.css` for layout and ambient behavior
  - avoid wallpaper for autonomous drift

This aligns dream customization with the user's request:

- decorations and stickers should be preferred over wallpaper changes

## 4. Files created in this pass

- `server/runtime/skills.js`
- `server/runtime/mcp.js`
- `server/mcp/playwright-service.js`
- `server/protocol/handlers/agent.js`
- `server/protocol/handlers/svg.js`
- `.bed-of-roses/skills/browserbase/SKILL.md`
- `.bed-of-roses/mcp/servers.json`
- `HANDOVER-2026-05-14-runtime-expansion.md`

## 5. Files modified in this pass

- `package.json`
- `package-lock.json`
- `.gitignore`
- `README.md`
- `server/runtime/mcp.js`
- `server/runtime/skills.js`
- `server/ai.js`
- `server/index.js`
- `server/memory/dream.js`
- `server/protocol/registry.js`
- `shell/index.html`
- `shell/style.css`
- `shell/app.js`

## 6. Dependency added

Added to `package.json`:

- `@modelcontextprotocol/sdk@^1.29.0`
- `@playwright/mcp@^0.0.75`

Why:

- Needed for real MCP client transport and calls
- avoids inventing a fake MCP layer
- provides a real browser MCP service for BOR's default `browserbase` server

## 7. Protocol changes in detail

### Added tags

- `create_svg`
- `use_skill`
- `list_mcp_servers`
- `list_mcp_tools`
- `use_mcp_tool`
- `access_mcp_resource`

### Added feedback-loop semantics

In `server/protocol/registry.js`, some tags now have:

- `feedsBack: true`

These currently include:

- `read_file`
- `list_files`
- `recall`
- `use_skill`
- `list_mcp_servers`
- `list_mcp_tools`
- `use_mcp_tool`
- `access_mcp_resource`
- `web_search`
- `web_fetch`
- `view_image`
- `generate_image`
- `execute_command`

Meaning:

- if the model emits one of these, the tool result can trigger another pass in the same turn

### Important non-feedback tags

These do **not** trigger continuation:

- `create_widget`
- `update_widget`
- `delete_widget`
- `rename_widget`
- `set_theme`
- `create_svg`
- `remember`
- `forget`
- `dream`

Reason:

- These are usually terminal visible actions, not “read then continue” tools

## 8. Prompt changes made in `server/ai.js`

Major changes:

- Added explicit “How you customize the OS” hierarchy:
  1. `create_svg` for objects/stickers/logos
  2. `write_file user-extras.css` for layout + ambient behavior
  3. `set_theme wallpaper` only for explicit wallpaper requests

- Added a **Skills** section showing currently available skills
- Added a **Connected MCP servers** section showing configured MCP surfaces
- Added explicit browser workflow guidance:
  - use skill
  - list MCP servers
  - inspect tools
  - use MCP tool
  - do not pretend browser actions succeeded when no browser MCP server is configured

- Strengthened AI-widget guidance:
  - if a widget benefits from continuity, use `getState/setState`
  - treat widget state like a real app's local store
  - remember drafts, recent routes, preferences, cached fetches, generated images, retry state

## 9. Verification performed

### Syntax checks

Passed:

- `node --check server/ai.js`
- `node --check server/index.js`
- `node --check server/protocol/registry.js`
- `node --check server/protocol/handlers/agent.js`
- `node --check server/protocol/handlers/svg.js`
- `node --check server/runtime/skills.js`
- `node --check server/runtime/mcp.js`
- `node --check shell/app.js`

### Runtime checks

Passed:

- `discoverSkills()` returned:
  - `browserbase` from local skills dir
- `listMcpServers()` returned:
  - disabled `browserbase` template from local MCP config
- `executeUseSkill({ name: 'browserbase' })` returned the skill body correctly
- `executeCreateSvg(...)` successfully:
  - wrote an SVG asset
  - added a decoration to config
  - returned config payload

Cleanup note:

- A temporary verification decoration (`test-orb`) was created and then removed.
- No intentional visual junk was left behind from that test.

### Server boot

Server booted cleanly with:

```bash
node server/index.js
```

It printed:

- Bed of Roses URL
- provider list
- dream scheduler armed

## 10. Important caveats and limits

### 10.1 Browser/Gmail/social workflows now have a real browser surface

Follow-up completed after the original pass:

- `@playwright/mcp` is installed as a dependency
- `.bed-of-roses/mcp/servers.json` now enables `browserbase` as a local stdio MCP server
- `server/mcp/playwright-service.js` launches Playwright MCP with a persistent BOR browser profile
- the profile lives at `.bed-of-roses/browser/profile`
- generated browser runtime files are ignored via `.gitignore`
- a hosted Browserbase-style endpoint remains available as disabled `browserbase-cloud`

What this means:

- the LLM can list real browser tools through `<list_mcp_tools server="browserbase"/>`
- it can navigate, click, type, take screenshots, read snapshots, and handle many authenticated web flows
- Gmail/Instagram/Twitter still depend on real credentials, MFA, and each site's automation defenses
- if a site blocks automation, the agent must say so honestly

### 10.2 Widget-side AI still uses a simpler bridge path

Widgets already have:

- `askAI`
- `searchWeb`
- `fetchUrl`
- `generateImage`

But widget-side AI does **not** yet have the same XML multi-pass tool loop as the main LLM.

That would be a good next step if richer AI apps are the next priority.

### 10.3 No MCP UI yet

There is currently:

- runtime config file support
- prompt visibility
- protocol handlers

There is not yet:

- a shell UI for adding/editing MCP servers

Right now MCP servers are configured by editing:

- `.bed-of-roses/mcp/servers.json`
- or `~/.bed-of-roses/mcp/servers.json`

### 10.4 Server background launch was flaky in this shell session

During this pass:

- detached/background launching behaved inconsistently in this shell environment
- attached PTY launch worked reliably

So for future work, if the server looks “not running”, just start it directly:

```bash
cd /Users/Opeyemi/open-source-os
node server/index.js
```

or

```bash
npm start
```

## 11. Recommended next steps

If continuing this project, the best next moves are:

1. **Harden real browser workflows**
   - the local Playwright MCP browser is now connected as `browserbase`
   - next: test Gmail/social/API-key flows against real accounts and add site-specific skills where useful

2. **Give widget-side AI the same XML multi-pass tool loop**
   - main LLM now has search/fetch/skill/MCP continuation in one turn
   - widget AI still does not

3. **Build an MCP management UI in the OS**
   - current config file path works, but a proper settings surface is still missing

4. **Create a browser app inside the OS**
   - if the product should feel like a real AI-native operating system, an internal browser surface will matter

5. **Add more seeded skills**
   - browserbase was added first because it directly supports login/API-key/browser tasks
   - more domain skills can now be dropped into `.bed-of-roses/skills/`

## 12. Suggested prompt for the next chat session

Use something like:

> Read `/Users/Opeyemi/open-source-os/HANDOVER-2026-05-14-runtime-expansion.md` first, then continue from there. Focus on the next step: [your chosen next task].

If the next task is browser/account automation specifically:

> Read `/Users/Opeyemi/open-source-os/HANDOVER-2026-05-14-runtime-expansion.md` first. Then help me wire a real browser MCP server into Bed of Roses so the LLM can log into sites and create API keys for me.

## 13. Short summary

This pass did **not** just add prompt wording.

It added:

- real skill loading
- real MCP discovery/calling foundation
- first-class `create_svg` home-screen decorations
- same-turn tool continuation for the main LLM
- prompt/runtime guidance that steers login/browser/API-key work through those new surfaces
- a real local Playwright MCP browser service wired into the default `browserbase` server

The biggest browser blocker is no longer architecture. It is now real-world account friction: credentials, MFA, and sites that may challenge or block automation.
