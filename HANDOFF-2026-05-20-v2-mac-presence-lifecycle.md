# Bed of Roses v2 Handoff: Mac Companion + Presence Lifecycle

Date: 2026-05-20  
Audience: Senior UI/UX designer-engineer  
Status: v2 migration in progress on branch `v2`

## 1. Executive Summary

Bed of Roses is no longer being treated as a full fake operating system that replaces the user's desktop.

The v2 direction is:

> Bed of Roses is an ambient Mac companion: a persistent AI presence that lives above the user's real operating system, can be dragged anywhere, can think/speak/build in place, and can create native-feeling app and widget windows on demand.

The old browser shell still exists and is reused for onboarding, provider setup, theme selection, and some legacy home behavior. After onboarding, the intended v2 experience is not a full-screen "OS home." It is the presence.

The presence is now the product's main interface.

It must support:

- collapsed idle presence
- expanded prompt/input state
- thought bubble / activity surface
- long-running generation feedback
- tool call visualization
- file/code editing progress
- app/widget creation progress
- image/media previews
- browser/video/opened-surface activity
- errors, pauses, retries, completion, and idle decay

The thought bubble should not be treated as a simple tooltip. It is closer to a miniature operating environment for live AI activity.

## 2. What BOR Is Now

### Product Definition

BOR is an AI-native desktop companion for macOS.

It is always available, but not always intrusive. The user should feel that it lives with them on the desktop rather than forcing them into a separate app workspace.

### Primary User Mental Model

The user has a small presence on screen. They click it, type what they want, and BOR can:

- answer in a visible thought bubble
- create apps
- create widgets
- open generated surfaces as Mac windows
- edit files
- run tools
- research the web
- generate images/wallpapers
- interact with browser workflows
- keep a memory of prior work

The presence should feel like a living desktop collaborator, not a chatbot window.

### Design Principle

The presence is not an icon that opens the app.

The presence is the app.

## 3. Migration Overview

### Previous Model

The earlier BOR model was:

- browser-hosted OS shell
- custom home screen
- widgets on a fake desktop canvas
- wallpaper inside the browser
- floating chat input inside the browser
- presence layered inside the shell UI

This created several issues:

- BOR competed with the user's real OS instead of extending it
- generated apps/widgets were trapped inside a browser canvas
- wallpaper/SVG decoration created layering problems
- the presence had to fight with widgets, modals, and fake app windows
- the product felt like an experimental OS rather than a useful Mac companion

### v2 Model

The new model is:

- Electron host launches a real Mac companion app
- onboarding opens in a normal setup window
- after onboarding, only the floating presence remains
- generated apps open as normal resizable desktop windows
- generated widgets open as compact native windows
- the local Node runtime remains the AI brain
- the server still owns providers, XML protocol parsing, app/widget generation, files, images, tools, and memory

### Current v2 Files

Primary host files:

- `v2/host/main.cjs`
  - Electron main process
  - starts or attaches to Node runtime
  - owns onboarding window
  - owns floating presence window
  - opens app/widget windows
  - streams chat events to the presence
  - applies macOS wallpaper best-effort
  - watches presence files for hot reload

- `v2/host/preload.cjs`
  - exposes safe `window.borHost` APIs to the presence renderer
  - handles chat start, config reads, surface listing/opening, presence bounds

- `v2/host/presence.html`
  - floating presence DOM
  - collapsed/expanded input
  - thought bubble
  - surfaces drawer

- `v2/host/presence.css`
  - current visual styling for floating presence
  - theme-aware presence primitive rendering

- `v2/host/presence.js`
  - renderer behavior
  - prompt submit
  - thought bubble updates
  - streaming say events
  - manual drag behavior
  - theme/presence config hydration

- `v2/host/surface-preload.cjs`
  - lets generated apps/widgets run as top-level windows while preserving the old `parent.postMessage` bridge behavior

Runtime files involved:

- `server/index.js`
  - HTTP server
  - `/api/chat`
  - `/api/config`
  - `/api/widgets`
  - widget/app state endpoints

- `server/ai.js`
  - builds system prompt
  - streams model output
  - emits parsed XML tool events

- `server/protocol/*`
  - XML tag parser/executor
  - tool handlers
  - app/widget creation/update

## 4. Current Presence Behavior

### Collapsed State

The collapsed presence is a small floating visual object.

Current behavior:

- always on top
- transparent Electron window
- draggable by pointer
- click/pointer-up expands input
- theme/presence visual is hydrated from runtime config
- no background frame should be visible in collapsed mode

Current technical size:

- collapsed Electron window: about `52x52`
- expanded Electron window: about `500x92`
- thinking/activity window: about `500x260`

These values are implementation defaults, not final design.

### Expanded Input State

The expanded state shows:

- presence icon
- text input
- send button
- surfaces button

Current behavior:

- click collapsed presence -> expanded prompt
- submit prompt -> thought bubble appears
- after submitting, input clears
- presence moves to thinking/activity mode

Design issue:

The current expanded input is still a rough engineering version. It needs a refined interaction model for:

- keyboard focus
- compact width
- drag affordance
- dismiss/collapse behavior
- input resizing
- multi-line prompts
- command suggestions
- attached files/context
- voice/speech if reintroduced later

### Thought Bubble

Current behavior:

- appears above the input/presence
- streams `<say>` text using `say_delta`
- displays simple meta labels like `Thinking`, `Speaking`, `Done`
- shows simple messages when apps/widgets are created or updated
- shows simple errors

Design issue:

This is far too simple for the actual product. The thought bubble must become a robust activity surface.

## 5. Why The Thought Bubble Is The Hard Part

The thought bubble must support the full lifecycle of an AI agent doing real work.

It is not just speech.

It needs to show:

- natural language streaming
- model thinking/progress
- tool calls
- app/widget generation
- file edits
- browser activity
- media previews
- long-running background tasks
- state transitions
- errors/retries
- completion summaries
- user interventions

In practice, the thought bubble is the visible "runtime cockpit" for the agent.

The design challenge is to make this feel light and ambient while still being capable enough to show complex work.

## 6. Current Runtime Event Contract

The presence currently receives events from `/api/chat` through Electron IPC.

Relevant event names:

- `tag_start`
  - emitted when the model starts an XML tag
  - useful for showing "using tool", "creating app", "editing file", etc.

- `say_delta`
  - streamed partial text from an open `<say>` tag
  - should render progressively

- `say`
  - completed speech/thought text

- `create_app`
  - app manifest created
  - v2 host opens it as a desktop window

- `create_widget`
  - widget manifest created
  - v2 host opens it as a compact desktop window

- `update_app`
  - existing app updated

- `update_widget`
  - existing widget updated

- `set_theme`
  - config/theme changed
  - v2 may update presence visual and wallpaper

- `tool_error`
  - an XML tool failed

- `surface_error`
  - v2 host failed opening a generated surface

- `error`
  - chat/runtime error

- `done`
  - turn complete

The current event contract is not enough for the final thought bubble. The designer should propose the UI model, and engineering can add richer event payloads as needed.

## 7. Proposed Presence State Machine

The designer should define a complete lifecycle across these states.

### A. Dormant / Idle

Presence is visible but quiet.

Needs design for:

- default idle look
- breathing/micro animation
- no distraction during focused user work
- cursor hover behavior
- click target
- drag behavior
- sleep state after long inactivity
- whether idle changes by time of day/theme

Questions:

- Should the presence animate while idle?
- How much motion is acceptable on a desktop overlay?
- Does long-idle show a sleeping face/state?
- Should long-idle reduce opacity?

### B. Hover / Attention

User hovers or approaches.

Needs design for:

- subtle hover cue
- drag affordance
- "click to ask" affordance without text clutter
- keyboard shortcut hint, if any

### C. Expanded / Prompt Ready

Input field is open.

Needs design for:

- prompt surface shape
- single-line vs multi-line
- send button
- surfaces/history button
- attachment/context affordance
- model/provider status
- collapsed return behavior
- empty prompt behavior
- focus ring
- theme-specific styling

### D. User Typing

User is composing.

Needs design for:

- input growth
- typed text spacing
- overflow handling
- suggestions/commands
- file/context chips
- cancellation/escape behavior

### E. Submitted / Thinking

Prompt has been sent, model has not yet produced visible output.

Needs design for:

- thinking indicator
- not a generic spinner
- model/provider label
- elapsed time
- cancel/stop affordance
- "what it is doing now"

### F. Streaming Speech

Model is producing `<say>` text.

Needs design for:

- streaming text cadence
- partial text reveal
- preserving scroll position
- finalization when `done`
- whether thought remains after completion
- how to show speaking tone

### G. Tool Calling

Model begins a non-say tool.

Examples:

- `web_search`
- `web_fetch`
- `get_ux_ui_strict_guidelines`
- `read_file`
- `write_file`
- `replace_in_file`
- `create_app`
- `create_widget`
- `execute_command`
- browser automation / MCP

Needs design for:

- compact tool call cards
- grouped timeline
- status icons
- pending/running/succeeded/failed states
- collapsible details
- retry affordance
- tool names translated into humane labels

### H. App/Widget Generation

This is a major state.

The model may:

- research
- fetch guidelines
- generate thumbnail HTML
- generate full app HTML
- write docs
- persist files
- open the surface

Needs design for:

- "Building app" progress
- thumbnail preview
- code/file generation indicator
- app/window opening indicator
- success card with app name
- option to open/reopen
- option to inspect docs
- option to keep thought bubble pinned

Important:

The user should understand that real software is being created, not just text.

### I. File Editing / Code Generation

When BOR edits code or files, the thought bubble should show a mini file-editing activity.

Needs design for:

- file path chips
- read/write/replace indicators
- diff summary
- progress state
- failure state
- "open file" affordance
- maybe "review changes" affordance

This should feel more like a tiny code review panel than a chat message.

### J. Browser / Web / Video Activity

BOR may interact with browser workflows or open media.

Needs design for:

- web search result cards
- current page being fetched
- browser automation steps
- opened URL indicator
- video preview card
- media loading state
- safe external-open affordance

The thought bubble should not become a full browser, but it may need preview cards.

### K. Image Generation / Image Display

The model may generate images or use images in apps/widgets/wallpapers.

Needs design for:

- thumbnail preview
- generation progress
- final image preview
- "open", "use as wallpaper", "save", "insert into app" affordances
- failure state for unsupported provider

### L. Long Running Tasks

Long tasks are expected.

Needs design for:

- elapsed time
- current phase
- background/pinned mode
- compact minimized activity
- stop/cancel
- recover from stream interruption
- resume/continue indication

This matters because long tasks currently expose weaknesses in streaming and user feedback.

### M. Error / Retry

Needs design for:

- clear error headline
- technical details collapsed
- retry action
- fix action where possible
- provider/API key issues
- network/offline state
- invalid generated code/widget failure

### N. Done / Resting With Result

When generation is done:

- thought bubble remains with the final result
- user can click presence to start a new message
- new message should clear/dismiss old bubble

Needs design for:

- final summary
- completion badge
- related actions
- durable result cards
- timeout/fade behavior

## 8. Thought Bubble As Activity Surface

The thought bubble should be designed as a composable system, not a single text box.

Recommended conceptual model:

### 1. Header

Contains:

- current mode: Thinking / Speaking / Building / Editing / Searching / Done
- optional provider/model
- elapsed time for long tasks
- stop/cancel/minimize controls

### 2. Main Content Region

Can switch between:

- streaming text
- activity timeline
- app creation preview
- file edit preview
- image/media preview
- error panel

### 3. Activity Timeline

A vertical or stacked list of short activity rows:

- "Read UX guidelines"
- "Searching the web"
- "Creating Matchday app"
- "Writing widget.html"
- "Opening app window"

Each row needs:

- icon
- label
- state
- optional detail
- optional expandable payload

### 4. Preview Cards

Cards for:

- generated app/widget
- image
- file edit
- command execution
- web result
- browser/video/media

### 5. Footer Actions

Possible actions:

- Stop
- Retry
- Open
- Reopen app
- View files
- Copy summary
- Collapse
- Keep visible

## 9. Design Constraints

### Must Stay Lightweight

The presence is always on screen. It cannot feel like a permanent modal.

The collapsed state must be visually tiny and respectful.

### Must Be Theme-Aware

BOR has multiple base themes:

- Bloom
- Cartoon Brutalist
- Neo Brutalist
- Liquid Glass
- Risograph
- Y2K Frutiger Aero
- Pixel CRT
- Warm & Earthy

Presence visuals are theme-specific. The design system must define how the same lifecycle maps across themes.

Example:

- Cartoon Brutalist: ink strokes, hard offset shadows, face primitive
- Pixel CRT: phosphor pixel face, terminal language
- Liquid Glass: glossy orb, refraction
- Neo Brutalist: square structural block
- Risograph: off-register stamp

### Must Support Native Desktop Reality

The presence floats above real Mac apps.

This creates constraints:

- small footprint
- no full-screen assumptions
- avoid blocking the user's work
- be draggable
- respect multi-monitor bounds
- visible on top, but not visually aggressive

### Must Handle Unknown Duration

Some tasks finish in one second. Some take minutes.

The design must gracefully cover:

- instant response
- slow provider stream
- long research
- multiple tool passes
- stream stalls
- partial output
- retry/continuation

## 10. Key Interaction Questions For The Designer

1. What exactly is visible in collapsed idle state?
2. How does the presence communicate it is draggable?
3. Does the presence expand around itself, above itself, or into a nearby surface?
4. Where does the thought bubble anchor when the presence is near screen edges?
5. Does the thought bubble reposition automatically to avoid off-screen clipping?
6. How does the bubble behave over full-screen apps?
7. What is the hierarchy between speech text and tool activity?
8. Does tool activity appear inline with speech, or in a separate activity rail?
9. How much technical detail is shown by default?
10. How are generated files/apps shown without overwhelming the user?
11. How do we represent "BOR is still working" after the user clicks away?
12. What is the smallest useful representation of a long-running task?
13. How does the bubble finish?
14. What happens if the user sends a second prompt while work is still running?
15. Should there be a task queue?
16. How are multiple generated app windows represented?
17. Does the presence have emotions/states, or only operational states?
18. How does each theme alter the same lifecycle?

## 11. Desired Deliverables From UI/UX Designer-Engineer

### A. Presence Lifecycle Map

A state machine covering:

- idle
- hover
- drag
- expanded input
- typing
- submitted
- thinking
- streaming
- tool calling
- building
- editing files
- showing media
- done
- error
- long-idle

### B. Component System

Components needed:

- collapsed presence
- expanded prompt bar
- thought bubble shell
- thought bubble header
- streaming text block
- activity row
- tool call card
- generated app/widget card
- file edit card
- image preview card
- browser/video preview card
- error card
- done summary
- footer actions
- minimized long-running activity chip

### C. Theme Variants

At minimum, provide variants for:

- Bloom
- Cartoon Brutalist
- Neo Brutalist
- Liquid Glass
- Pixel CRT

The remaining themes can follow after the core pattern is proven.

### D. Motion Spec

Needed for:

- idle breathing
- hover
- expand/collapse
- thought bubble appearing
- streaming text
- tool row progression
- completion transition
- error state
- long-idle sleep

Include reduced-motion behavior.

### E. Implementation Prototype

Ideal output:

- Figma prototype or coded prototype
- desktop-sized examples
- edge-placement examples
- short and long task examples
- one full app-generation flow
- one file-editing flow
- one error/retry flow

## 12. Suggested Event Model Improvements

The current server event contract is too coarse. The design should inform a richer event model.

Potential future events:

- `activity_start`
- `activity_update`
- `activity_done`
- `activity_error`
- `tool_call_start`
- `tool_call_delta`
- `tool_call_done`
- `file_read`
- `file_write`
- `file_patch`
- `surface_generation_start`
- `surface_generation_preview`
- `surface_generation_done`
- `image_generation_start`
- `image_generation_done`
- `browser_action`
- `media_open`
- `long_task_checkpoint`

Potential activity payload:

```json
{
  "id": "activity-123",
  "kind": "file_edit",
  "status": "running",
  "title": "Editing presence.css",
  "detail": "Applying collapsed state changes",
  "target": "v2/host/presence.css",
  "progress": 0.45,
  "actions": ["open_file", "cancel"]
}
```

The UI should not require all of this immediately, but the designer should define what payloads are needed to make the bubble feel intelligent.

## 13. Current Known UX Problems

These are known issues or rough areas in the current v2 prototype:

- Presence visuals have been manually mapped from onboarding and need design polish.
- Thought bubble is still a simple text container.
- Tool calls are barely represented.
- App/widget generation progress is too abrupt.
- No rich file edit visualization exists yet.
- No image/media preview inside bubble exists yet.
- No long-task/pinned/minimized state exists yet.
- No robust edge-aware bubble positioning exists yet.
- Dragging works through manual pointer IPC but needs a designed affordance.
- Expanded prompt is functional but not product-quality.
- Presence size and theme-specific proportions need final design.

## 14. Engineering Notes

The designer-engineer can prototype directly against:

- `v2/host/presence.html`
- `v2/host/presence.css`
- `v2/host/presence.js`

Hot reload is installed for those files when the v2 Mac host is running.

Current renderer API:

```js
window.borHost.getConfig()
window.borHost.getPresenceBounds()
window.borHost.setPresenceBounds({ x, y })
window.borHost.setPresenceMode(mode)
window.borHost.startChat(requestId, text)
window.borHost.onChatEvent(callback)
window.borHost.listSurfaces()
window.borHost.openSurface(surfaceOrId)
window.borHost.openOnboarding()
```

Presence modes currently understood by main process:

- `collapsed`
- `expanded`
- `thinking`

These can be expanded if the final design needs more states.

## 15. North Star Flow

Example ideal flow:

1. User sees a tiny themed presence resting on the Mac desktop.
2. User clicks it.
3. Presence expands into a compact prompt bar.
4. User types: "Build me a Premier League tracker."
5. Thought bubble opens in a compact "Thinking" state.
6. Bubble shows:
   - "Checking design guidelines"
   - "Researching current tracker patterns"
   - "Creating Matchday app"
   - "Writing app files"
   - "Opening app window"
7. Speech streams naturally at the top or in a dedicated text zone.
8. A small app preview card appears when the app is ready.
9. Native app window opens.
10. Bubble resolves into "Matchday is ready" with actions:
    - Open
    - Keep visible
    - View docs
    - Collapse
11. User clicks the presence again to start something new.
12. Previous bubble clears or becomes a small history/activity item depending on final design.

## 16. Product Tone

BOR should feel:

- ambient
- capable
- intimate
- fast
- visually alive
- technically trustworthy
- desktop-native

It should not feel:

- like a chatbot widget
- like a fake OS
- like a notification spammer
- like a giant modal
- like a generic AI assistant bubble

The design challenge is to make powerful agent work visible without making the user's desktop feel occupied by a control panel.

