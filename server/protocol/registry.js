// Tag registry — single source of truth for the LLM tool protocol.
//
// Each entry declares:
//   • description: one paragraph for the system prompt
//   • params: { attrs: {...schema}, children: {...schema}, body: 'text'|'html'|null }
//   • examples: array of usage examples shown to the LLM
//   • voiced: whether this tag's execution is silent (most tools) or surfaces
//             a spoken comment (only <say>; everything else expects the LLM
//             to also emit a separate <say> if it wants to talk about it)
//   • feedsBack: whether the tag's tool_result should trigger another model
//                pass in the same user turn so the model can consume it
//   • execute: handler reference. Resolved lazily — handlers register themselves
//
// `buildToolDocs()` renders the registry into the system-prompt format used by
// Sixth (## tag_name / Description / Parameters / Usage). Adding a new tag
// = adding one entry here + one handler module. Nothing else.

import * as say from './handlers/say.js';
import * as widget from './handlers/widget.js';
import * as shortcut from './handlers/shortcut.js';
import * as theme from './handlers/theme.js';
import * as file from './handlers/file.js';
import * as exec from './handlers/exec.js';
import * as memory from './handlers/memory.js';
import * as surfaceData from './handlers/surface-data.js';
import * as tools from './handlers/tools.js';
import * as agent from './handlers/agent.js';
import * as svg from './handlers/svg.js';
import * as uxGuidelines from './handlers/ux-guidelines.js';
import * as computer from './handlers/computer.js';
import * as browser from './handlers/browser.js';
import * as browserAgent from './handlers/browser-agent.js';
import * as media from './handlers/media.js';
import * as cron from './handlers/cron.js';
import * as notification from './handlers/notification.js';

export const TAGS = {
  // ---------- THOUGHT BUBBLE ----------
  say: {
    description:
      "Display text in the presence thought bubble. Each <say> renders as ONE bubble. Put one coherent thought per <say> — a greeting + an offer + a question that all flow together belong in ONE <say>, not three. Only open a new <say> when the tone genuinely shifts (warm → thoughtful, thoughtful → apologetic) or when there's a real beat/pause between thoughts (e.g. a narration before a tool call, then a different narration before the next one). Anything outside <say> tags is silent. FILE LINKS (required): whenever you mention a file or folder path in user-facing text — something you created, edited, or are pointing the user to — you MUST (a) write the FULL path exactly as it exists on disk, either relative to the project root (`.bor/...`, `os-data/...`) or absolute, never a shortened basename like `index.html`, and (b) wrap it in <hyper_link_file>...</hyper_link_file> inside the <say> body, e.g. <hyper_link_file>.bor/workspaces/site/index.html</hyper_link_file>. The presence renders it as a clickable link that reveals the file in the system file manager.",
    params: {
      attrs: {
        tone: 'optional. one of: neutral, warm, excited, delighted, playful, curious, calm, tender, serious, thoughtful, mysterious, whisper, commanding, apologetic, proud, surprised, sad, amused. default: warm.',
        decibels: 'ignored while browser speech is disabled. accepted for compatibility.',
        rate: 'ignored while browser speech is disabled. accepted for compatibility.',
        pitch: 'ignored while browser speech is disabled. accepted for compatibility.',
      },
      body: 'text',
    },
    examples: [
      `<say tone="warm">Here's the weather for Lagos. Twenty-eight degrees and clear.</say>`,
      `<say tone="thoughtful">Real-time flight data needs a paid API. I built a route snapshot instead.</say>`,
      `<say tone="apologetic">That didn't work — Anthropic returned a four-oh-one.</say>`,
      `<say tone="proud">Your site is ready — I saved it to <hyper_link_file>.bor/workspaces/site/index.html</hyper_link_file>.</say>`,
    ],
    voiced: false,
    execute: say.execute,
  },

  attempt_completion: {
    description:
      "Signal the user's request is fully and verifiably complete. No more tools after this. The <result> child is displayed to the user like a final <say>; raw body text directly inside <attempt_completion> is ignored by the UI. For outcome tasks (send/post/submit/create/delete/save/schedule), you MUST have visible evidence the outcome happened — a confirmation banner, destination page (Sent/Inbox/detail page), success toast, or the recorded value visible. Setup, opening pages, typing fields, intermediate clicks do NOT count. Browser-use evidence must come from a `state` or `screenshot` AFTER the final action. If user input or a manual user action is required, do NOT use this tag; use <wait_for_human_input> instead.",
    params: {
      children: {
        result: 'required. final result summary, phrased as a completed outcome.',
        command: 'optional. command or path that demonstrates the result, only when useful.',
      },
    },
    examples: [
      `<attempt_completion>
  <result>The journal entry was added and the Journal app state has been updated.</result>
</attempt_completion>`,
    ],
    voiced: false,
    execute: say.executeAttemptCompletion,
  },

  wait_for_human_input: {
    description:
      "Stop the current turn because the human must provide input or perform an action before work can continue. This is an explicit human-in-the-loop barrier: after this tag, BOR emits a waiting state and will not call more tools until the user replies. Use it for profile/account/app choice, OTP/MFA/CAPTCHA, credentials, permission/approval, manual App Store downloads, manual clicks, or any decision that must come from the user. The body is displayed to the user like a final <say>.",
    params: {
      attrs: {
        kind: 'optional. short reason category such as profile_choice, otp, mfa, captcha, credentials, permission, manual_action, confirmation.',
      },
      body: 'text',
    },
    examples: [
      `<wait_for_human_input kind="profile_choice"><![CDATA[Which Chrome profile should I use: Adewole, glyde.world, overturemcp.com, trysixth.com, or a clean temporary session?]]></wait_for_human_input>`,
      `<wait_for_human_input kind="manual_action"><![CDATA[I opened the Mac App Store to Prime Video. Click Get to install it, then tell me when the install finishes.]]></wait_for_human_input>`,
    ],
    voiced: false,
    execute: say.executeWaitForHumanInput,
  },

  push_notification: {
    description:
      "Add an item to the notification inbox shown behind the bell in the presence thought bubble. Use this for background results, scheduled-task outcomes, or important user-visible alerts that should remain available after the current bubble is closed. Must include a short subject so the collapsed presence notification chip can summarize it. The body is the longer notification detail text.",
    params: {
      attrs: {
        subject: 'required. concise notification subject shown in collapsed presence chip and detail page.',
        title: 'required. short notification title.',
        level: 'optional. one of: info, success, warning, error. default: info.',
        source: 'optional. short source label such as agent, cron, app, shortcut.',
        jobId: 'optional. cron job id when this came from a scheduled task.',
        surfaceId: 'optional. app/shortcut id when this came from a surface.',
      },
      body: 'text',
    },
    examples: [
      `<push_notification subject="Price monitor" title="Price check complete" level="success" source="cron"><![CDATA[The monitor found no price drop on the tracked page.]]></push_notification>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: notification.executePushNotification,
  },

  // ---------- STRICT UX/UI GUIDELINES ----------
  get_ux_ui_strict_guidelines: {
    description:
      'Required before creating or updating any app or shortcut. Loads the active theme handbook from design-guideline/<theme>.md plus the shortcut-card spec from design-guideline/shortcut-card.md. You MUST call this tool and wait for its tool_result before emitting <create_app>, <create_shortcut>, <update_app>, or <update_shortcut>. The executor rejects same-pass creates that skip this.',
    params: {
      attrs: {
        theme: 'optional. theme id override. Omit to use the active OS base theme.',
      },
    },
    examples: [`<get_ux_ui_strict_guidelines/>`],
    voiced: false,
    feedsBack: true,
    execute: uxGuidelines.executeGetUxUiStrictGuidelines,
  },

  // ---------- APPS ----------
  create_app: {
    description:
      "Create a full-screen desktop app window. MUST call <get_ux_ui_strict_guidelines/> first (its tool result has the design contract — do not duplicate). Pick app over shortcut when the result deserves its own window the user will return to: multi-screen, CRUD, dashboards, full workflows, settings, history — anything dock-presented. Tile is just the launcher preview; clicking opens the full app. Use <update_app> if similar exists. Must be responsive, theme-aware, stateful, real (no placeholders). Third-party APIs requiring keys MUST include in-app settings UI (masked input, save/clear, how-to-generate, key-needed initial state). Apps may use the BOR bridge for state, LLM, web, image generation, cron jobs (`type:'cron'`), and notifications (`type:'notification-push'`). <doc> required.",
    params: {
      attrs: {
        name: 'required. short display name, <=32 chars.',
        icon: "optional. glyph keyword (e.g. 'camera', 'heart', 'calendar', 'coin'). Server maps to a Feather-style line glyph. Never an emoji.",
      },
      children: {
        thumbnail:
          'required. inline SVG OR full <!DOCTYPE html> document inside CDATA, designed as a premium launcher preview for the app. Show the app value proposition or real dashboard preview, not a logo.',
        html: 'required. complete <!DOCTYPE html> full-screen app document inside CDATA. Inline CSS + JS only, no external scripts, no eval, no localStorage, no <say>. Use the bridge for state, LLM, web, images, cron, and notifications. If using a key-based third-party API, include settings UI with masked key entry, setup instructions, and an API-key-needed initial state.',
        doc: 'required. complete Markdown documentation inside CDATA covering purpose, features, views/navigation, design guidelines, state schema, bridge/API calls, API key setup/storage if any, loading/error/empty states, accessibility/responsive behavior, limitations, and changelog.',
      },
    },
    examples: [
      `<create_app name="Meal Lens" icon="camera">
  <thumbnail><![CDATA[<!DOCTYPE html><html><head><style>body{margin:0;padding:16px;color:#F5F1FF;font-family:Geist,system-ui;background:transparent}.t{font-family:Instrument Serif,serif;font-style:italic;font-size:34px}</style></head><body><div class="t">Meal Lens</div><p>/ camera nutrition journal</p></body></html>]]></thumbnail>
  <html><![CDATA[<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%;background:transparent;color:#F5F1FF;font-family:Geist,system-ui}</style></head><body>...full responsive app...</body></html>]]></html>
  <doc><![CDATA[# Meal Lens
## Purpose
Camera-first nutrition tracking app.
## Features
- Meal capture, AI estimate review, history, goals, settings.
## Changelog
- Initial build.]]></doc>
</create_app>`,
    ],
    voiced: false,
    execute: widget.executeCreateApp,
  },

  update_app: {
    description:
      "Evolve an existing app instead of duplicating. MUST <read_file> the existing app's doc path first. Replaces HTML in place; state.json persists across updates. New API-key integrations require in-app settings UI. Any subset of name/icon/thumbnail/html can change in one call; <doc> is required and must merge with the previous doc (don't replace it with only new notes).",
    hidden: false,
    params: {
      attrs: {
        id: 'required. app id from the existing apps/widgets list.',
        icon: 'optional. new glyph keyword.',
      },
      children: {
        name: 'optional. new display name.',
        thumbnail: 'optional. replacement launcher preview (CDATA).',
        html: 'optional. replacement complete full-screen app html (CDATA). Include the full updated document, not a patch fragment.',
        doc: 'required. complete updated Markdown documentation inside CDATA. Merge the previous doc with the new changes; do not replace it with only the new feature. Document API key setup/storage if the app uses a key-based third-party API.',
      },
    },
    examples: [
      `<update_app id="app-1778..." icon="camera">
  <name>Meal Lens</name>
  <html><![CDATA[<!DOCTYPE html>...expanded app with camera, history, goals, settings...</html>]]></html>
  <doc><![CDATA[# Meal Lens
## Purpose
Camera-first nutrition tracking app.
## Features
- Existing meal capture and review.
- New goal insights tab.
## Changelog
- Added goal insights while preserving capture/history/settings.]]></doc>
</update_app>`,
    ],
    voiced: false,
    execute: widget.executeUpdateApp,
  },

  launch_app: {
    description:
      "Open or bring forward an existing BOR-built app on the user's desktop. Use this when the user asks to open, launch, show, bring back, or switch to an app that Bed of Roses created. Prefer id from the existing apps/widgets list; name is allowed when it uniquely identifies one app. If you need the id first, call <list_surfaces/>.",
    params: {
      attrs: {
        id: 'optional if name is provided. app-* id from the existing apps/widgets list.',
        name: 'optional if id is provided. app display name; must uniquely identify one app.',
      },
      body: 'optional app name if attrs are omitted',
    },
    examples: [`<launch_app id="app-1778..."/>`, `<launch_app name="Meal Lens"/>`],
    voiced: false,
    feedsBack: true,
    execute: widget.executeLaunchApp,
  },

  delete_app: {
    description: 'Remove a full-screen app from the desktop. Use only when the user explicitly asks to delete an app.',
    params: { attrs: { id: 'required. app id.' } },
    examples: [`<delete_app id="app-1778..."/>`],
    voiced: false,
    execute: widget.executeDeleteApp,
  },

  // ---------- SHORTCUTS (iframe cards inside the thought bubble) ----------
  create_shortcut: {
    description:
      "Create a stateful shortcut — a small live iframe card that renders INSIDE the thought bubble (not on the desktop). Use for results that live adjacent to the conversation: a payment input + Pay button, a quick translator, a tiny travel itinerary that streams its own AI content, a waveform player, a one-step API caller, a settings toggle. MUST call <get_ux_ui_strict_guidelines/> first — the tool result includes design-guideline/shortcut-card.md with the exact contract (tokens, allowed primitives, API-key-UI pattern). Pick <create_app> when the result deserves its own full-screen window the user will return to. Third-party APIs that need keys MUST ship in-shortcut settings UI (masked input, save/clear, how-to-generate, key-needed initial state) as the first interaction. Shortcuts may use the BOR bridge for state, LLM, web, image generation, cron jobs (`type:'cron'`), notifications (`type:'notification-push'`), and app launching. <doc> required.",
    params: {
      attrs: {
        name: 'required. short display name, ≤24 chars.',
        icon: "optional. glyph keyword (e.g. 'pay', 'plane', 'translate', 'wave'). Server maps to a Feather-style line glyph. Never an emoji.",
        bubbleHeight: 'optional. desired iframe height in pixels — clamped 160-600, default 280. Pick the smallest that fits the content. Single-input cards 160-200, list/form cards 240-320, multi-tab cards 400-500.',
      },
      children: {
        thumbnail:
          'required. inline SVG OR <!DOCTYPE html> document inside CDATA, used in the inventory/launcher (not in the bubble itself — the live iframe is the surface). Show a representative state, not a logo.',
        html: 'required. complete <!DOCTYPE html> shortcut document inside CDATA. Inline CSS + JS only, no external scripts, no eval, no localStorage, no <say>. Background MUST be transparent. The theme tokens (--label, --accent, --hairline, font families) are injected by the host. Use parent.postMessage bridge for state-get/state-set/llm-request/web-search/web-fetch/image-generate/cron/notification-push.',
        doc: 'required. complete Markdown documentation inside CDATA covering purpose, the recurring task it serves, state schema, bridge calls, API-key setup if any, when the LLM should re-launch it, and changelog.',
      },
    },
    examples: [
      `<create_shortcut name="Send Lagos $" icon="pay" bubbleHeight="200">
  <thumbnail><![CDATA[<!DOCTYPE html><html><head><style>body{margin:0;padding:16px;color:#F5F1FF;font-family:Geist,system-ui;background:transparent}.t{font-family:Instrument Serif,serif;font-style:italic;font-size:22px}</style></head><body><div class="t">Send to Lagos</div><p>/ tap to pay</p></body></html>]]></thumbnail>
  <html><![CDATA[<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%;background:transparent;color:var(--label);font-family:var(--font-system)}…</style></head><body>…input + Pay button…<script>…bridge calls…</script></body></html>]]></html>
  <doc><![CDATA[# Send Lagos $
## Purpose
Quick payment shortcut for the user's recurring Lagos transfers.
## State
{ "lastAmount": number, "lastRecipient": string }
## Changelog
- Initial build.]]></doc>
</create_shortcut>`,
    ],
    voiced: false,
    execute: shortcut.executeCreateShortcut,
  },

  update_shortcut: {
    description:
      "Evolve an existing shortcut instead of creating a near-duplicate. MUST <read_file> the shortcut's doc path first. Replaces HTML in place; state.json persists across updates. New API-key integrations require in-shortcut settings UI. Any subset of name/icon/bubbleHeight/thumbnail/html can change in one call; <doc> is required and must merge with the previous doc.",
    params: {
      attrs: {
        id: 'required. shortcut id (widget-… — historical prefix kept for ID continuity).',
        icon: 'optional. new glyph keyword.',
        bubbleHeight: 'optional. new iframe height in pixels (160-600).',
      },
      children: {
        name: 'optional. new display name.',
        thumbnail: 'optional. replacement thumbnail (CDATA).',
        html: 'optional. replacement complete shortcut html (CDATA).',
        doc: 'required. complete updated Markdown doc — merge with previous, do not replace.',
      },
    },
    examples: [
      `<update_shortcut id="widget-1779…" bubbleHeight="320">
  <name>Send Lagos $</name>
  <html><![CDATA[<!DOCTYPE html>…expanded with recipient picker…</html>]]></html>
  <doc><![CDATA[# Send Lagos $
## Purpose
Quick payment shortcut for the user's recurring Lagos transfers.
## Features
- Existing single-amount input.
- New saved-recipients dropdown.
## Changelog
- Added recipient picker without removing the original quick-pay flow.]]></doc>
</update_shortcut>`,
    ],
    voiced: false,
    execute: shortcut.executeUpdateShortcut,
  },

  launch_shortcut: {
    description:
      "Re-mount an existing shortcut into the active thought-bubble thread. Use when the user invokes a task the same shortcut already handles. Prefer id from the existing shortcuts list; if you only know the name, call <list_surfaces/> first.",
    params: {
      attrs: {
        id: 'required. shortcut id (widget-…).',
      },
      body: 'optional shortcut id if attr omitted.',
    },
    examples: [`<launch_shortcut id="widget-1779…"/>`],
    voiced: false,
    feedsBack: true,
    execute: shortcut.executeLaunchShortcut,
  },

  delete_shortcut: {
    description: 'Remove a shortcut from storage. Use only when the user explicitly asks to delete.',
    params: { attrs: { id: 'required. shortcut id (widget-…).' } },
    examples: [`<delete_shortcut id="widget-1779…"/>`],
    voiced: false,
    execute: shortcut.executeDeleteShortcut,
  },

  // ---------- SCHEDULED TASKS ----------
  cron: {
    description:
      'Manage BOR cron jobs for delayed or recurring agent work. This is modeled after OpenClaw cron: do not emulate scheduling with `sleep`, polling loops, or long-running shell processes. Actions: status, list, get, add, update, remove, run. Job schedules support `{ "kind":"at", "at":"<ISO timestamp>" }`, `{ "kind":"every", "everyMs": <milliseconds> }`, and `{ "kind":"cron", "expr":"<cron expression>", "tz":"<IANA timezone optional>" }`. Payloads support `{ "kind":"agentTurn", "message":"<task prompt>" }` for real scheduled agent execution, or `{ "kind":"systemEvent", "text":"<notification/reminder text>" }` for a notification-only reminder. One-shot `at` jobs disable themselves after they run. Apps and shortcuts can also create jobs via the surface bridge.',
    params: {
      attrs: {
        action: 'required. one of: status, list, get, add, update, remove, run.',
        id: 'optional. job id for get/update/remove/run.',
        mode: 'optional for run. force (default) or due.',
      },
      body: 'JSON object. For add, either the job object itself or `{ "job": {...} }`. For update, `{ "patch": {...} }` or a patch object. For list, `{ "includeDisabled": true }` is accepted.',
    },
    examples: [
      `<cron action="add"><![CDATA[{"name":"Morning news check","schedule":{"kind":"cron","expr":"0 8 * * *","tz":"Africa/Lagos"},"payload":{"kind":"agentTurn","message":"Check the top AI news and notify me with a concise summary."}}]]></cron>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: cron.executeCron,
  },

  // ---------- LEGACY WIDGET SHIMS (hidden from the LLM prompt) ----------
  // Old conversation history may still contain <launch_widget id="…"/> or
  // similar. These hidden entries route those tags to a no-op shim that
  // returns a clean tool_error pointing the LLM at <create_shortcut>. The
  // `hidden: true` flag tells buildToolDocs to skip them, so they no longer
  // appear in the system prompt — saves ~3-4k chars per turn. Deleted in
  // Phase 3 along with the rest of the widget code path.
  create_widget: { hidden: true, description: '', params: {}, examples: [], voiced: false, execute: widget.executeLegacyWidgetTag },
  update_widget: { hidden: true, description: '', params: {}, examples: [], voiced: false, execute: widget.executeLegacyWidgetTag },
  launch_widget: { hidden: true, description: '', params: {}, examples: [], voiced: false, execute: widget.executeLegacyWidgetTag },
  delete_widget: { hidden: true, description: '', params: {}, examples: [], voiced: false, execute: widget.executeLegacyWidgetTag },
  rename_widget: { hidden: true, description: '', params: {}, examples: [], voiced: false, execute: widget.executeLegacyWidgetTag },

  create_svg: {
    description:
      "Create or replace an SVG decoration and place it on the home-screen background. Use this for floating stickers, team logos, mascots, corner art, decorative search bars, and other autonomous visual flourishes. Prefer this over changing the wallpaper when the user wants an object in the room rather than a new sky. The body must be raw <svg> markup; the server saves it under the active theme's assets and places it as a real decoration behind widgets and opened apps. The server tracks occupied x/y slots for the active theme and shifts new SVGs away from existing ones so they do not stack on top of each other.",
    params: {
      attrs: {
        name: 'required. stable decoration name; reused as the asset + config id.',
        anchor: 'optional. one of: top-left, top-right, bottom-left, bottom-right, center-left, center-right, center. default bottom-right.',
        x: 'optional. CSS offset from the horizontal anchor. default 28px.',
        y: 'optional. CSS offset from the vertical anchor. default 28px.',
        width: 'optional. CSS length. default 220px.',
        height: 'optional. CSS length. default 220px.',
        opacity: 'optional. 0.05-0.28. default 0.22 so decorations stay behind apps/widgets visually.',
        rotate: 'optional. CSS angle, default 0deg.',
        drift: 'optional. one of none, slow, medium. default slow.',
        blend: 'optional. CSS mix-blend-mode, default normal.',
        z: 'optional. integer stacking hint within the background decoration layer. default 0.',
      },
      body: 'raw <svg> markup (CDATA-wrap if it contains nested tags)',
    },
    examples: [
      `<create_svg name="arsenal-cannon" anchor="bottom-right" x="32px" y="24px" width="180px" opacity="0.22" rotate="-8deg" drift="slow"><![CDATA[<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">...</svg>]]></create_svg>`,
    ],
    voiced: false,
    execute: svg.executeCreateSvg,
  },

  // ---------- THEME / SYSTEM ----------
  set_theme: {
    description:
      "Evolve core theme tokens (accent, fonts, atmosphere) or wallpaper. Wallpaper is reserved for explicit user requests — don't preemptively change it. For stickers/decorations/ambient CSS use <write_file> to shell/themes/<id>/user-extras.css instead.",
    params: {
      children: {
        accent: 'optional. one of: pearl, amber, ember, bloom, aurora, frost, lilac, onyx.',
        wallpaper:
          'optional. THREE forms — (a) <wallpaper>linear-gradient(...)</wallpaper> for CSS literal; (b) <wallpaper url="/api/images/foo.png"/> for an existing image URL; (c) <wallpaper from_prompt="..." size="1536x1024"/> to generate + apply in one move. Use (c) when the user asks for "a wallpaper of X".',
        fonts: 'optional. self-closing with attrs: display, system, mono — Google Fonts names.',
        atmosphere: 'optional. CSS gradient OR "default" OR "none".',
      },
    },
    examples: [
      `<set_theme>
  <accent>amber</accent>
  <fonts display="Fraunces" system="Geist" mono="Geist Mono"/>
  <wallpaper from_prompt="A pixelated 8-bit Arsenal cannon, phosphor green on near-black, BBS aesthetic" size="1536x1024"/>
</set_theme>`,
    ],
    voiced: false,
    execute: theme.executeSetTheme,
  },

  reset_theme: {
    description: "Revert the visual system to the starting state (warm aubergine + lilac).",
    params: {},
    examples: [`<reset_theme/>`],
    voiced: false,
    execute: theme.executeResetTheme,
  },

  set_ai_name: {
    description: 'Rename yourself. The user just calls you something different from now on.',
    params: { body: 'text' },
    examples: [`<set_ai_name>Iris</set_ai_name>`],
    voiced: false,
    execute: theme.executeSetAiName,
  },

  reset_chat: {
    description: 'Clear the conversation history visible in the UI. Does not delete widgets.',
    params: {},
    examples: [`<reset_chat/>`],
    voiced: false,
    execute: theme.executeResetChat,
  },

  // ---------- APP / WIDGET DATA ----------
  list_surfaces: {
    description:
      "List every app and widget on the desktop with display name, id, widget.html path, doc path, and state.json path. Use this first when the user names an app/widget but you need to locate its id, implementation file, doc, or state file.",
    params: {},
    examples: [`<list_surfaces/>`],
    voiced: false,
    feedsBack: true,
    execute: surfaceData.executeListSurfaces,
  },

  read_surface_data: {
    description:
      "Read the persisted state.json data for an existing app or widget. Use this when the user asks to add, edit, remove, or inspect data inside an app/widget without changing its UI: diary entries, daily plans, habits, calorie logs, todos, preferences, saved records, etc. Identify the surface by id or by the exact state_path from list_surfaces / the existing apps list. Optional path is a JSON Pointer such as /entries or /plan/today. The returned JSON is included as a tool_result for the next pass.",
    params: {
      attrs: {
        id: 'optional if state_path is provided. app-* or widget-* id from the existing apps/widgets list.',
        state_path: 'optional if id is provided. exact os-data/widgets/<id>/state.json path.',
        path: 'optional. JSON Pointer path to read, e.g. /entries, /plan/today, /items/0.',
      },
    },
    examples: [
      `<list_surfaces/>`,
      `<read_surface_data id="app-1778..."/>`,
      `<read_surface_data state_path="os-data/widgets/app-1778.../state.json"/>`,
      `<read_surface_data id="app-1778..." path="/entries"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: surfaceData.executeReadSurfaceData,
  },

  mutate_surface_data: {
    description:
      "CRUD on an app/widget's state.json without rewriting UI. MUST <read_surface_data> for the same id/path earlier in the same turn. Body: one op, an array, or {\"operations\":[...]}. Ops: add, replace, remove, merge. Paths are JSON Pointers; /- appends to arrays. Mutate the EXACT schema you just read — don't invent /entries when the state uses /notes. In v2 desktop mode the host refreshes affected windows after success.",
    params: {
      attrs: {
        id: 'optional if state_path is provided. app-* or widget-* id from the existing apps/widgets list.',
        state_path: 'optional if id is provided. exact os-data/widgets/<id>/state.json path.',
      },
      body: 'JSON operation(s). Each operation has {"op":"add|replace|remove|merge","path":"/json/pointer","value":...}. remove has no value. merge value must be an object.',
    },
    examples: [
      `<mutate_surface_data id="app-diary"><![CDATA[
{"op":"add","path":"/entries/-","value":{"id":"entry-2026-05-14","date":"2026-05-14","text":"I felt focused today."}}
]]></mutate_surface_data>`,
      `<mutate_surface_data state_path="os-data/widgets/app-diary/state.json"><![CDATA[
{"op":"merge","path":"/plan/today","value":{"focus":"Retest BOR"}}
]]></mutate_surface_data>`,
      `<mutate_surface_data id="app-planner"><![CDATA[
[
  {"op":"merge","path":"/plan/today","value":{"focus":"Ship BOR dream CRUD","updatedBy":"dream"}},
  {"op":"add","path":"/plan/today/tasks/-","value":{"text":"Retest onboarding","done":false}}
]
]]></mutate_surface_data>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: surfaceData.executeMutateSurfaceData,
  },

  // ---------- FILESYSTEM ----------
  read_file: {
    description:
      'Read a file from disk. Relative paths resolve against the project root; absolute paths are allowed. File explorer paths are also supported: device:/ maps to the user home folder and bor:/ maps to BOR-created files. Returned content is included in your next-turn context as a tool_result. read_file handles most formats natively — use it first for ANY file: code and plain text of every kind (any encoding — utf8/utf16/latin1 auto-detected); PDFs (≤20 MB, attached as readable documents, or text-extracted on providers without document support); images png/jpg/gif/webp plus heic/tiff/bmp/psd/ico (≤8 MB, attached as viewable images); Word/RTF/ODT, XLSX/PPTX, and Jupyter notebooks (extracted text); audio (metadata — you cannot listen); video (poster frame + metadata — you cannot watch); zip/tar archives (listings). NEVER use execute_command, Python, or terminal scripts to parse, convert, or extract these formats — read_file already gives you their content directly; terminal extraction is redundant and forbidden unless read_file itself refused the file.',
    params: { attrs: { path: 'required. relative, absolute, device:/..., or bor:/... file path.' } },
    examples: [`<read_file path="notes/today.md"/>`, `<read_file path="device:/Desktop/todo.py"/>`],
    voiced: false,
    feedsBack: true,
    execute: file.executeRead,
  },

  read_file_in_chunks: {
    description:
      'Read a large file in roughly 50 KB chunks. Use this when read_file truncates or when you only need part of a very large file. Supports relative paths, absolute paths, device:/, and bor:/.',
    params: {
      attrs: {
        path: 'required. relative, absolute, device:/..., or bor:/... file path.',
        chunk: 'optional. 1-based chunk number. default 1.',
      },
    },
    examples: [`<read_file_in_chunks path="os-data/widgets/app-123/widget.html" chunk="1"/>`],
    voiced: false,
    feedsBack: true,
    execute: file.executeReadChunk,
  },

  read_batch: {
    description:
      "Read or inspect multiple paths in one tool call. Body is a newline-separated list. Plain paths read files. Prefix with list: to list a directory, list-recursive: for recursive listing, or defs: to list source definitions. This mirrors Sixth's batch exploration workflow and supports relative paths, absolute paths, device:/, and bor:/.",
    params: {
      attrs: { paths: 'optional. comma-separated paths if body is not used.' },
      body: 'newline-separated paths, e.g. package.json\\nlist:server\\ndefs:shell',
    },
    examples: [
      `<read_batch><![CDATA[
package.json
list:server/protocol
defs:shell
]]></read_batch>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: file.executeReadBatch,
  },

  write_file: {
    description:
      'Write a file. Body is the file content (CDATA-wrapped if it contains <). Creates parent directories. If the user did not explicitly name a destination path, choose a clear path under .bor/ using the artifact policy in the system prompt. Refuses writes to reserved areas (server/, shell/, node_modules/, .git/, package*.json, anywhere outside $HOME).',
    params: {
      attrs: { path: 'required. file path; default new artifacts to .bor/... when the user did not specify a destination.' },
      body: 'text',
    },
    examples: [
      `<write_file path="notes/today.md"><![CDATA[# notes\nshipping v0.5 today]]></write_file>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: file.executeWrite,
  },

  write_to_file: {
    description:
      "Sixth-compatible file writer. Create a new file or replace an existing file with the complete provided content. Prefer replace_in_file for targeted edits to existing files; use write_to_file for new files or full rewrites. If the user did not explicitly name a destination path, choose a clear path under .bor/ using the artifact policy in the system prompt. Creates parent directories and returns the final file content as a tool_result.",
    params: {
      attrs: { path: 'required. file path; default new artifacts to .bor/... when the user did not specify a destination.' },
      body: 'complete file content. Use CDATA when content contains <.',
    },
    examples: [
      `<write_to_file path="notes/today.md"><![CDATA[# notes\nshipping v0.5 today]]></write_to_file>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: file.executeWriteToFile,
  },

  replace_in_file: {
    description:
      "Targeted file editor. Replace sections of an existing file using exact SEARCH/REPLACE blocks. Strongly prefer this for updates to existing app/widget HTML, docs, scripts, and text files so you do not rewrite from scratch. You should read the file first, then make SEARCH text match exactly. Multiple blocks may be included in file order. Returns the final file content as a tool_result.",
    params: {
      attrs: { path: 'required. existing file path.' },
      body: 'one or more SEARCH/REPLACE blocks using ------- SEARCH, =======, and +++++++ REPLACE markers.',
    },
    examples: [
      `<replace_in_file path="os-data/widgets/app-123/widget.html"><![CDATA[
------- SEARCH
<button id="save">Save</button>
=======
<button id="save">Save changes</button>
++++++ REPLACE
]]></replace_in_file>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: file.executeReplaceInFile,
  },

  delete_file: {
    description:
      'Delete a file or empty directory. Subject to the same reserved-area rules as write_file.',
    params: { attrs: { path: 'required.' } },
    examples: [`<delete_file path="notes/today.md"/>`],
    voiced: false,
    execute: file.executeDelete,
  },

  list_files: {
    description: 'List files and directories within a directory. By default this lists the top level only; pass recursive="true" to recursively explore a folder. Supports relative paths, absolute paths, device:/, and bor:/.',
    params: { attrs: { path: 'required. directory path.', recursive: 'optional. true for recursive listing; omit or false for top-level only.' } },
    examples: [`<list_files path="."/>`, `<list_files path="device:/Downloads" recursive="true"/>`],
    voiced: false,
    feedsBack: true,
    execute: file.executeList,
  },

  search_files: {
    description:
      "Search file contents recursively within a directory using a regular expression. Use this to find relevant code, text, filenames that contain a pattern, or implementation references before reading exact files. Supports relative paths, absolute paths, device:/, and bor:/. Use file_pattern to narrow the search, such as '*.js' or '*.py'.",
    params: {
      attrs: {
        path: 'required. directory path to recursively search.',
        regex: 'required. regular expression to search for.',
        file_pattern: "optional. glob such as '*.js', '*.py', or '*.md'.",
      },
    },
    examples: [`<search_files path="." regex="function\\s+render" file_pattern="*.js"/>`],
    voiced: false,
    feedsBack: true,
    execute: file.executeSearch,
  },

  list_code_definition_names: {
    description:
      'List top-level source code definition names in files at the top level of a directory. Use this before opening many source files to understand which files define classes, functions, types, or exported helpers. This uses a lightweight parser and supports relative paths, absolute paths, device:/, and bor:/.',
    params: { attrs: { path: 'required. directory path.' } },
    examples: [`<list_code_definition_names path="server/protocol"/>`],
    voiced: false,
    feedsBack: true,
    execute: file.executeListCodeDefinitions,
  },

  // ---------- MEMORY ----------
  remember: {
    description:
      "Save a single durable fact about the user to long-term memory. Use this when the user reveals something that should persist across sessions: dietary restrictions, location, name preferences, hobbies, working style, allergies, anything you'd want to know NEXT time. The body is one short natural-language sentence — first person from the user's POV (\"I am vegetarian\", \"I live in Lagos\"). One fact per call. The OS stores it in user_profile.json and re-injects it into your prompt on every future turn.",
    params: { body: 'text' },
    examples: [
      `<remember>The user is vegetarian.</remember>`,
      `<remember>The user prefers metric units (kg, km, °C).</remember>`,
      `<remember>The user is based in Lagos.</remember>`,
    ],
    voiced: false,
    execute: memory.executeRemember,
  },

  recall: {
    description:
      "Look up something the OS knows about the user. Searches user_profile.preferences and the recent session activity log for substring matches against the query. Returns a tool_result with what was found. Use this when you want to ground an answer in what the user has previously said or done — \"do they prefer metric?\", \"what city were they planning to visit?\".",
    params: { attrs: { query: 'required. short natural-language query (substring match, case-insensitive).' } },
    examples: [
      `<recall query="vegetarian"/>`,
      `<recall query="lagos"/>`,
      `<recall query="weather widget"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: memory.executeRecall,
  },

  forget: {
    description:
      "Remove preference(s) matching the query from long-term memory. Use this when the user explicitly retracts a previously-remembered fact (\"I'm not vegetarian anymore\", \"forget that I'm in Lagos\"). The query is a substring match — be specific so you don't accidentally remove unrelated facts.",
    params: { attrs: { query: 'required. substring to match against preferences.' } },
    examples: [
      `<forget query="vegetarian"/>`,
      `<forget query="based in Lagos"/>`,
    ],
    voiced: false,
    execute: memory.executeForget,
  },

  // Dreams are disabled for now because they were interrupting normal chat.
  // dream: {
  //   description:
  //     "Queue the background dream cycle. A dream is two phases: (1) it re-reads recent session activity and extracts durable patterns into the long-term profile, (2) it optionally takes 1–2 small creative actions to make the OS feel more like home — append CSS to user-extras (a sticker, top clock, search bar, decorative shape), build a small widget the user may want, set a tasteful accent or font drift, remember a fact the consolidation step missed. Wallpaper changes are NOT allowed in the action phase. Dreams run on a six-hour cron cadence by default and only queue while the interactive chat is idle; manually emit <dream/> only after learning something durable enough to bake in. Each dream costs 2 LLM round-trips (consolidation + action). Don't fire more than once per chat.",
  //   params: {},
  //   examples: [`<dream/>`],
  //   voiced: false,
  //   execute: memory.executeDream,
  // },

  // ---------- SKILLS + MCP ----------
  use_skill: {
    description:
      "Load a skill's instructions into your working context. Skills are discovered in real time from ~/.bed-of-roses/skills and ./.bed-of-roses/skills; local overrides global. Use this when a task matches a specialised workflow — deployment, research, a team-specific process, or the browser-use CLI fallback (only after the ambient browser tags have failed). The skill content comes back as a tool_result and is meant to guide your next pass in the same turn.",
    params: {
      attrs: { name: 'required. skill name.' },
      body: 'optional fallback skill name if the attribute is omitted',
    },
    examples: [
      `<use_skill name="browser-use"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: agent.executeUseSkill,
  },

  list_mcp_servers: {
    description:
      'List MCP servers currently configured in real time. Use this for database work, custom backends, or connected integrations beyond the built-ins. If a connected server covers a service (mail, calendar, docs), prefer its tools; otherwise for browser automation, dashboards, and form filling use the ambient browser tags (browser_open, browser_snapshot, browser_click, ...).',
    params: {},
    examples: [`<list_mcp_servers/>`],
    voiced: false,
    feedsBack: true,
    execute: agent.executeListMcpServers,
  },

  list_mcp_tools: {
    description:
      'Inspect the tools and resources exposed by one configured MCP server. Use this after list_mcp_servers when you plan to call a database, custom backend, or explicitly MCP-backed integration.',
    params: {
      attrs: { server: 'required. MCP server name.' },
    },
    examples: [
      `<list_mcp_tools server="example-server"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: agent.executeListMcpTools,
  },

  use_mcp_tool: {
    description:
      'Call a tool exposed by a configured MCP server. The body is optional JSON arguments. Use this for databases, custom backends, or explicitly MCP-backed integrations — a connected server that covers a service beats driving a browser at it. For general browser automation, external dashboards, and web forms with no matching server, prefer the ambient browser tags (browser_open, browser_snapshot, browser_click, ...).',
    params: {
      attrs: {
        server: 'required. MCP server name.',
        tool: 'required. MCP tool name.',
      },
      body: 'optional JSON object of tool arguments',
    },
    examples: [
      `<use_mcp_tool server="example-server" tool="lookup"><![CDATA[{"query":"status"}]]></use_mcp_tool>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: agent.executeUseMcpTool,
  },

  access_mcp_resource: {
    description:
      'Read a resource exposed by an MCP server. Use this for structured documents, server-side context blobs, or any durable resource a connected server exposes.',
    params: {
      attrs: {
        server: 'required. MCP server name.',
        uri: 'required. MCP resource URI.',
      },
    },
    examples: [
      `<access_mcp_resource server="workspace" uri="file:///README.md"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: agent.executeAccessMcpResource,
  },

  // ---------- NATIVE MAC COMPUTER / APP CONTROL ----------
  screen_capture: {
    description:
      "Capture the user's real Mac screen and return a /api/images screenshot URL plus dimensions and display metadata. In v2, BOR hides the presence/thought bubble during capture by default so the screenshot shows the user's actual app instead of BOR's overlay. The presence thought bubble previews this local image automatically, so do NOT call <view_image> on the returned /api/images path. Use this when the user asks about something visible on their machine, when you need to inspect another app, or before operating a UI manually. This may require macOS Screen Recording permission for Electron/Terminal.",
    params: {
      attrs: {
        display: 'optional. cursor/current (default), main/primary, or screen number such as 1 or screen2.',
        hint: 'optional. filename hint for the saved screenshot.',
        include_presence: 'optional. true only when the user explicitly wants BOR itself included in the screenshot. Default false.',
      },
    },
    examples: [`<screen_capture display="cursor"/>`],
    voiced: false,
    feedsBack: true,
    execute: computer.executeScreenCapture,
  },

  browser_action: {
    description:
      "Drive a real headless Chromium browser to LOAD, VIEW, and INTERACT WITH a web page or local web project, then get back a screenshot of the page plus any new console logs. This is how you PREVIEW and VERIFY web UIs you build (a landing page, a dev server at http://localhost:PORT, a deployed site) and do light browser work. Every action except `close` returns a fresh screenshot + console logs — inspect the screenshot before deciding the next action. Rules: run ONE action per message and wait for the result; the sequence MUST start with `launch` at a URL and MUST end with `close`; while the browser is open use ONLY browser_action (close it before any other tool, then relaunch if needed). To visit a different URL you cannot navigate to from the page, close and launch again. The window is 1024x720 — click coordinates must be within that range and aimed at the CENTER of the target element (read the screenshot to find coordinates). After building a website/landing page, this is the right way to open it for the user — do NOT wrap a real web project as a BOR app.",
    params: {
      attrs: {
        action: 'required. One of: launch | click | type | scroll_down | scroll_up | close.',
        url: 'for launch. Full URL including protocol, e.g. http://localhost:3000, https://example.com, file:///path/to/index.html.',
        coordinate: 'for click. "x,y" within 1024x720, aimed at the center of the element, e.g. "512,360".',
        text: 'for type (alternative to the tag body). The string to type.',
      },
      body: 'for type — the text to type (CDATA-safe).',
    },
    examples: [
      `<browser_action action="launch" url="http://localhost:5173"/>`,
      `<browser_action action="click" coordinate="512,360"/>`,
      `<browser_action action="type"><![CDATA[hello@example.com]]></browser_action>`,
      `<browser_action action="scroll_down"/>`,
      `<browser_action action="close"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browser.executeBrowserAction,
  },

  locate_screen_element: {
    description:
      "Use the selected BOR provider's vision model to find a visible UI element on the user's Mac screen. BOR hides the presence/thought bubble during the screenshot by default so the model sees the underlying app. Returns the screenshot URL, the model coordinate, and macOS click_x/click_y coordinates you can pass to <computer_click>. Use this when the user asks where to click, asks about a visible button/menu/control, or before interacting with an app. Requires Screen Recording permission and a vision-capable configured provider.",
    params: {
      attrs: {
        query: 'required unless body is provided. Natural-language element to find, e.g. "the Figma frame tool", "the blue Share button".',
        display: 'optional. cursor/current (default), main/primary, or screen number.',
        include_presence: 'optional. true only when BOR itself is the target. Default false.',
      },
      body: 'text (alternative to query)',
    },
    examples: [
      `<locate_screen_element query="the New design file button in Figma"/>`,
      `<locate_screen_element display="screen2"><![CDATA[the run button in Xcode]]></locate_screen_element>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: computer.executeLocateScreenElement,
  },

  computer_click: {
    description:
      "Click on the user's real Mac at macOS System Events coordinates. Usually use click_x/click_y returned from <locate_screen_element>. Requires Accessibility permission for the Electron/Terminal host.",
    params: {
      attrs: {
        x: 'required. macOS/System Events x coordinate, usually locate_screen_element payload click.x.',
        y: 'required. macOS/System Events y coordinate, usually locate_screen_element payload click.y.',
        kind: 'optional. left (default) or double.',
      },
    },
    examples: [`<computer_click x="640" y="420"/>`, `<computer_click x="500" y="260" kind="double"/>`],
    voiced: false,
    feedsBack: true,
    execute: computer.executeComputerClick,
  },

  computer_type: {
    description:
      "Type/paste text into the currently focused Mac app. Uses the clipboard briefly so long text and punctuation survive intact. Use after focusing a field with <computer_click> or when the user asks you to fill text into an app.",
    params: {
      attrs: { text: 'optional for short text; body is preferred for long text.' },
      body: 'text to type or paste',
    },
    examples: [
      `<computer_type><![CDATA[Create a clean landing page with a hero, testimonials, and pricing.]]></computer_type>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: computer.executeComputerType,
  },

  computer_key: {
    description:
      "Press a keyboard key or hotkey in the currently focused Mac app. Supports combos like cmd+v, cmd+shift+p, tab, return, escape, up, down, left, right, delete. Use for app shortcuts and navigation.",
    params: {
      attrs: { key: 'required unless body is provided. e.g. cmd+n, cmd+shift+p, return, tab.' },
      body: 'optional key/hotkey alternative',
    },
    examples: [`<computer_key key="cmd+n"/>`, `<computer_key key="return"/>`],
    voiced: false,
    feedsBack: true,
    execute: computer.executeComputerKey,
  },

  open_app: {
    description:
      "Open or activate a real desktop application by name (macOS Launch Services, Windows start, or Linux gtk-launch). Use this before operating apps like Figma, Chrome, Xcode, or VS Code.",
    params: {
      attrs: { name: 'required unless body is provided. Application name, e.g. Figma, Google Chrome, Finder.' },
      body: 'optional app name alternative',
    },
    examples: [`<open_app name="Figma"/>`, `<open_app>Google Chrome</open_app>`],
    voiced: false,
    feedsBack: true,
    execute: computer.executeOpenApp,
  },

  computer_use: {
    description:
      "High-level Clicky-style real Mac app control loop. Captures the screen with BOR's presence hidden by default, asks the selected BOR provider's vision model for one action, executes it, repeats, then returns a log. Use this for multi-step UI workflows in real apps, e.g. designing a Figma page, operating Chrome, filling settings, or navigating another desktop app. Keep max_steps modest and narrate before/after with <say>. Requires Screen Recording permission, Accessibility permission, and a vision-capable configured provider.",
    params: {
      attrs: {
        goal: 'required unless body is provided. The concrete UI task to perform.',
        max_steps: 'optional. 1-20, default 8.',
        display: 'optional. cursor/current (default), main/primary, or screen number.',
        include_presence: 'optional. true only when controlling/testing BOR itself. Default false.',
      },
      body: 'text goal/instructions',
    },
    examples: [
      `<computer_use goal="In Figma, create a new design file and make a simple SaaS landing page hero" max_steps="12"/>`,
      `<computer_use><![CDATA[Open the active browser tab, find the search field, and search for Lagos weather.]]></computer_use>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: computer.executeComputerUse,
  },

  // ---------- AMBIENT BROWSER (a11y snapshot + refs) ----------
  browser_open: {
    description:
      "Open a URL in the ambient browser — a persistent, visible companion browser you drive by element refs, not coordinates. THE default for web tasks that need interaction, login, or JavaScript: web apps, dashboards, forms, signed-in sites. Returns the page title/URL plus an accessibility snapshot in YAML where every interactive element has a ref like [ref=e6]. Core loop: every browser_* action returns a FRESH snapshot; interact ONLY with refs that appear in the LATEST snapshot; never invent or reuse refs after navigation. The browser stays open across tools and turns until <browser_end/> — no need to close it between steps. For plain readable pages prefer <web_fetch>; for local dev-server previews the coordinate <browser_action> also works.",
    params: {
      attrs: { url: 'required. full URL including protocol, e.g. https://mail.google.com.' },
    },
    examples: [
      `<browser_open url="https://news.ycombinator.com"/>`,
      `<browser_open url="https://mail.google.com"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserOpen,
  },

  browser_snapshot: {
    description:
      "Take a fresh accessibility snapshot of the current ambient-browser page WITHOUT acting. Use it to re-read state — after a wait, when a ref went stale, when an expected element was missing, or to narrow into one region with target/depth. The YAML lists elements as `- link \"Learn more\" [ref=e6]` — those refs are what you pass to browser_click / browser_type / browser_select. Only refs from the LATEST snapshot are valid.",
    params: {
      attrs: {
        target: 'optional. a ref (e.g. e12) to snapshot only that element subtree.',
        depth: 'optional. limit snapshot tree depth (number) to keep the output small.',
      },
    },
    examples: [
      `<browser_snapshot/>`,
      `<browser_snapshot target="e12" depth="6"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserSnapshot,
  },

  browser_click: {
    description:
      "Click an element in the ambient browser by ref. Returns a fresh snapshot — read it before the next action; the click's effect (navigation, expanded menu, new dialog) is only true if the new snapshot shows it.",
    params: {
      attrs: {
        target: 'required. ref from the LATEST snapshot, e.g. e6.',
        element: 'required. short human description of the element, e.g. "Sign in button".',
        double: 'optional. "true" for a double-click.',
        button: 'optional. left (default) | right | middle.',
      },
    },
    examples: [
      `<browser_click target="e6" element="Learn more link"/>`,
      `<browser_click target="e14" element="file row" double="true"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserClick,
  },

  browser_type: {
    description:
      'Type text into an input/textarea in the ambient browser by ref. Body is the text (CDATA-safe). submit="true" presses Enter afterwards. Returns a fresh snapshot.',
    params: {
      attrs: {
        target: 'required. ref of the field from the LATEST snapshot.',
        element: 'required. short human description of the field, e.g. "search box".',
        text: 'optional for short text; body is preferred.',
        submit: 'optional. "true" to press Enter after typing.',
        slowly: 'optional. "true" to type one key at a time (for autocomplete fields).',
      },
      body: 'the text to type (CDATA-safe).',
    },
    examples: [
      `<browser_type target="e9" element="search box" submit="true"><![CDATA[weather lagos]]></browser_type>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserType,
  },

  browser_press_key: {
    description:
      'Press a keyboard key in the ambient browser, e.g. Enter, Escape, Tab, ArrowDown, PageDown. Use PageDown/PageUp to scroll. Returns a fresh snapshot.',
    params: {
      attrs: { key: 'required. key name, e.g. Enter, Escape, ArrowDown, PageDown.' },
    },
    examples: [`<browser_press_key key="PageDown"/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserPressKey,
  },

  browser_select: {
    description:
      'Choose option(s) in a <select> dropdown in the ambient browser by ref. Returns a fresh snapshot.',
    params: {
      attrs: {
        target: 'required. ref of the dropdown from the LATEST snapshot.',
        element: 'required. short human description, e.g. "country dropdown".',
        values: 'required. comma-separated option value(s), e.g. "NG" or "red,blue".',
      },
    },
    examples: [`<browser_select target="e21" element="country dropdown" values="NG"/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserSelect,
  },

  browser_fill_form: {
    description:
      'Fill multiple form fields in one call in the ambient browser. Body is a JSON array of fields, each {"name": human label, "type": textbox|checkbox|radio|combobox|slider, "ref": ref from the LATEST snapshot, "value": string ("true"/"false" for checkboxes)}. Faster than one browser_type per field. Returns a fresh snapshot.',
    params: {
      body: 'JSON array of {name, type, ref, value} objects (CDATA-safe).',
    },
    examples: [
      `<browser_fill_form><![CDATA[[{"name":"email","type":"textbox","ref":"e8","value":"ope@example.com"},{"name":"remember me","type":"checkbox","ref":"e11","value":"true"}]]]></browser_fill_form>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserFillForm,
  },

  browser_back: {
    description: 'Go back one page in the ambient browser. Returns a fresh snapshot; all old refs are stale after this.',
    params: {},
    examples: [`<browser_back/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserBack,
  },

  browser_tabs: {
    description:
      'Manage ambient-browser tabs: list them, open a new one, select or close by index. Returns tab list / fresh snapshot.',
    params: {
      attrs: {
        action: 'required. list | new | select | close.',
        index: 'for select/close. tab index from a prior list.',
      },
    },
    examples: [`<browser_tabs action="list"/>`, `<browser_tabs action="select" index="1"/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserTabs,
  },

  browser_screenshot: {
    description:
      "Take a screenshot of the ambient browser's current page (viewport by default) and see it as an image. Use it when visual layout matters — verifying a design, reading a canvas/chart, or when the snapshot alone is ambiguous. For element structure and refs, prefer browser_snapshot: it is cheaper and is what you act on.",
    params: {
      attrs: {
        full: 'optional. "true" for the full scrollable page instead of the viewport.',
        target: 'optional. ref to screenshot just that element.',
        element: 'with target. short human description of the element.',
      },
    },
    examples: [`<browser_screenshot/>`, `<browser_screenshot full="true"/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserScreenshot,
  },

  browser_wait: {
    description:
      'Wait in the ambient browser for seconds to pass, for text to appear, or for text to disappear — then get a fresh snapshot. Use after an action whose result loads asynchronously instead of assuming it worked.',
    params: {
      attrs: {
        seconds: 'optional. seconds to wait, e.g. 3.',
        text: 'optional. wait until this text is visible on the page.',
        text_gone: 'optional. wait until this text is no longer visible.',
      },
    },
    examples: [`<browser_wait text="Inbox"/>`, `<browser_wait seconds="3"/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserWait,
  },

  browser_end: {
    description:
      'Close the ambient browser and its window. Do this when the web task is fully done — not between steps; the browser is meant to persist across tools and turns while you work.',
    params: {},
    examples: [`<browser_end/>`],
    voiced: false,
    feedsBack: true,
    execute: browserAgent.executeBrowserEnd,
  },

  // ---------- WEB + VISION + IMAGE-GEN ----------
  web_search: {
    description:
      "Search the web. Returns up to 5 results (title, URL, snippet) as a tool_result you can read on the next turn. Use this whenever you need fresh facts — current events, prices, who someone is, an API's current endpoint. Don't guess when you can search. Pair with <web_fetch> on the most promising result for full text.",
    params: {
      attrs: {
        query: 'required. natural-language search query.',
        limit: 'optional. number of results, 1–10. default 5.',
      },
    },
    examples: [
      `<web_search query="bed of roses open source OS"/>`,
      `<web_search query="lagos to abuja flight prices today" limit="8"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: tools.executeWebSearch,
  },

  web_fetch: {
    description:
      "Fetch a URL and return its text contents (HTML stripped, capped at ~12 KB). Use this after <web_search> to read the most-promising result, or anytime you need the actual contents of a known URL. Works on HTML, JSON, and plaintext. Doesn't run JavaScript on the page — only the server-rendered text.",
    params: { attrs: { url: 'required. absolute http(s) URL.' } },
    examples: [
      `<web_fetch url="https://en.wikipedia.org/wiki/Lagos"/>`,
      `<web_fetch url="https://api.frankfurter.app/latest?from=USD&to=NGN"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: tools.executeWebFetch,
  },

  view_image: {
    description:
      "Look at an external online image URL from a web page. The server fetches the http(s) URL, sends the image bytes to your same model as a multimodal request, and returns its description as a tool_result. Use this only for image URLs discovered from web_search/web_fetch pages or pasted by the user. Do NOT use it for BOR-local /api/images paths from screen_capture or generate_image; those media files are previewed automatically in the thought bubble. Optional `focus` attribute narrows the description to a specific question (\"what does the menu say?\", \"is the cat looking left?\").",
    params: {
      attrs: {
        url: 'required. external absolute http(s) image URL. Not /api/images, not localhost.',
        focus: 'optional. a specific question about the image.',
      },
    },
    examples: [
      `<view_image url="https://example.com/photo.jpg"/>`,
      `<view_image url="https://example.com/receipt.png" focus="what was the total?"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: tools.executeViewImage,
  },

  generate_image: {
    description:
      "Generate an image from a text prompt using the user's connected provider (OpenAI gpt-image-1 or Gemini Imagen). The image is saved to /api/images/<file> on the OS and the URL is returned as a tool_result. Anthropic does not support image generation — falls back with an error if that's the active provider. Use this for hero art on widgets, illustrations, mockups, anything that needs a generated visual. Be specific in the prompt: style, lighting, composition, mood.",
    params: {
      attrs: {
        prompt: 'required if body empty. the text-to-image prompt.',
        size: 'optional. one of 1024x1024 (default), 1024x1536 (portrait), 1536x1024 (landscape).',
        hint: 'optional. short slug appended to the saved filename for human-readable URLs.',
      },
      body: 'text (alternative to the prompt attribute, for long descriptions)',
    },
    examples: [
      `<generate_image prompt="A warm aubergine night sky over a Lagos rooftop, soft film grain, 35mm" hint="lagos-night"/>`,
      `<generate_image size="1536x1024"><![CDATA[Editorial illustration: a vintage Yoruba talking drum on a marble table, side-lit, shallow depth of field, deep burgundy backdrop.]]></generate_image>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: tools.executeGenerateImage,
  },

  // ---------- SHELL ----------
  execute_command: {
    description:
      "Run a shell command (a real bash shell — pipes, redirects, globs, &&, cd all work). Body is the command (CDATA if it contains <). Heredocs and multi-line inline-code (python -c, node -e) are refused — write a script with <write_file> then run it. HARD 1-MINUTE RULE: a command never blocks you longer than 60 seconds. If it finishes first you get its full result; if it is still running at 60s you get the output captured so far plus a run_id and the process KEEPS RUNNING in the background (it is NOT killed). To follow a still-running command, use <wait_until duration=\"N\"/> to pause, then <read_command_tail run_id=\"…\"/> for newer output — repeat until done. For something you already know is long-running (dev server, watcher, daemon) set background=\"true\" to get that early return after just 15s instead of 60s. Stdout is captured up to 64 KB / stderr 32 KB; the tool_result shows a compact preview with a run_id/offset for read_command_tail. Stop a background process with another execute_command (kill/pkill).",
    params: {
      attrs: {
        cwd: 'optional. working directory.',
        background: 'optional. "true" for a known long-runner (dev server, watcher, daemon) — returns after ~15s instead of 60s with the output so far while it keeps running. Returns earlier if it exits/crashes first. Default false.',
        timeout_seconds: 'optional. Force-KILL the command after this many seconds (separate from the 60s return window — use it only when you want the process actually terminated, e.g. a hung command). Otherwise the process is never killed by the tool.',
      },
      body: 'text',
    },
    examples: [
      `<execute_command><![CDATA[ls -la]]></execute_command>`,
      `<execute_command cwd="notes"><![CDATA[wc -l *.md]]></execute_command>`,
      `<execute_command cwd=".bor/workspaces/site" background="true"><![CDATA[npm run dev]]></execute_command>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: exec.execute,
  },

  wait_until: {
    description:
      "Pause for a fixed number of seconds before your next action. Use it to let something already in motion make progress — a background command or dev server to build/warm up/print more, a file to appear, a service to come online — then continue (typically followed by <read_command_tail/> or a re-check). The chat genuinely waits for the duration; if the user cancels, the wait ends early. This is the companion to execute_command's hard 60-second return window: when a command is still running, wait_until + read_command_tail is how you follow it without blocking.",
    params: {
      attrs: {
        duration: 'required. seconds to wait (1–600), e.g. 30.',
        reason: 'optional. short human-readable note shown in the thought bubble, e.g. "letting the build finish".',
      },
    },
    examples: [
      `<wait_until duration="30" reason="letting the dev server start"/>`,
      `<wait_until duration="120"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: exec.executeWaitUntil,
  },

  read_command_tail: {
    description:
      "Fetch more output from a previously-run command whose result was truncated. The original tool_result includes a run_id; pass it here with stream='stdout' or 'stderr' and an offset to paginate through the rest of the captured buffer. Use when a long-output command (browser-use state JSON, ls -laR, large find output) reported truncation.",
    params: {
      attrs: {
        run_id: 'required. run_id from a prior execute_command tool_result.',
        stream: 'optional. "stdout" (default) or "stderr".',
        offset: 'optional. byte offset to read from. default 0.',
        max_bytes: 'optional. up to 64 KiB. default 32768.',
      },
    },
    examples: [
      `<read_command_tail run_id="run_a1b2c3d4" stream="stdout" offset="64000" max_bytes="32768"/>`,
    ],
    voiced: false,
    feedsBack: true,
    execute: exec.executeReadCommandTail,
  },

  list_recent_commands: {
    description:
      "List the last 8 shell commands the harness has run, with their run_id, exit code, duration, and output sizes. Useful for picking a run_id when you need to call read_command_tail but don't remember it.",
    params: {},
    examples: [`<list_recent_commands/>`],
    voiced: false,
    feedsBack: true,
    execute: exec.executeListRecentCommands,
  },

  // ---------- MEDIA DISPLAY ----------
  display_tweet: {
    description:
      "Render one or more tweet URLs as embedded tweet cards in the user's thought bubble. The card uses the official platform.twitter.com embed iframe and automatically follows the user's system light/dark mode. Use this when you have a tweet URL the user should see in full (replies, threads, media, polls all render natively). Accepts twitter.com/<user>/status/<id>, x.com/<user>/status/<id>, /i/status/<id>, etc. URLs that aren't tweets are skipped — for non-tweet media use display_media instead.",
    params: {
      attrs: {
        url: 'optional. single tweet URL (twitter.com or x.com).',
        title: 'optional. short caption shown above the card.',
      },
      body: 'optional. one tweet URL per line, for batched display. Each line may optionally be `<url> | <title>` for per-item captions.',
    },
    examples: [
      `<display_tweet url="https://x.com/elonmusk/status/1234567890123456789" title="Elon on neural lace"/>`,
      `<display_tweet><![CDATA[
https://x.com/sama/status/9876543210 | sam on agi timelines
https://twitter.com/karpathy/status/1122334455 | nanogpt update
]]></display_tweet>`,
    ],
    voiced: false,
    feedsBack: false,
    execute: media.executeDisplayTweet,
  },

  display_media: {
    description:
      "Render one or more media items as playable / viewable cards in the user's thought bubble (YouTube and Vimeo videos, TikTok and Instagram Reels, direct image URLs, .mp4 files, .png/.jpg/.gif/.webp images). Use this when you have a concrete media URL you want the user to actually see — after scraping a feed, after fetching reels, after building a list of recommendations. Do NOT use it as a generic preview for every URL the model encounters; only when the URL IS the deliverable. URLs that don't match a recognized media provider are skipped. The cards render inline so the user can play / watch right there in the bubble.",
    params: {
      attrs: {
        url: 'optional. single media URL to display.',
        title: 'optional. short caption shown above the card.',
        caption: 'optional. longer descriptive caption.',
      },
      body: 'optional. one URL per line, for batched display. Each line may optionally be `<url> | <title>` for per-item captions.',
    },
    examples: [
      `<display_media url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Funny clip"/>`,
      `<display_media><![CDATA[
https://www.tiktok.com/@user/video/7123456789 | Cat does parkour
https://www.instagram.com/reel/Cabc123/ | Coffee art timelapse
https://www.youtube.com/watch?v=abcXYZ
]]></display_media>`,
    ],
    voiced: false,
    feedsBack: false,
    execute: media.executeDisplayMedia,
  },
};

// --- Platform gating -------------------------------------------------------
// The computer-use family drives macOS-only binaries (osascript, cliclick,
// screencapture, PyObjC). Off-mac those tags are hidden from the system
// prompt, and a stray invocation (replayed history, model habit) gets a clear
// refusal steering to the cross-platform paths instead of an ENOENT stack.
// `open_app` is NOT gated — its handler has per-platform launchers.
const DARWIN_ONLY_TAGS = ['screen_capture', 'locate_screen_element', 'computer_click', 'computer_type', 'computer_key', 'computer_use'];
if (process.platform !== 'darwin') {
  for (const name of DARWIN_ONLY_TAGS) {
    const def = TAGS[name];
    if (!def) continue;
    def.hidden = true;
    def.execute = async () => ({
      ok: false,
      event: 'tool_error',
      payload: { tag: name, reason: 'not available on this platform' },
      llmEcho: `${name} failed: screen/desktop control is only available on macOS. For web tasks use the browser_* tools; for local files and apps use execute_command or open_app.`,
    });
  }
}

export const TAG_NAMES = Object.keys(TAGS);

// Tags that may appear as TOP-LEVEL blocks emitted by the LLM. Children of
// other tags (thumbnail, html, accent, wallpaper, name, fonts) are *also*
// listed here so the parser sees them. Only top-level tags get dispatched.
const STRUCTURAL_CHILDREN = ['thumbnail', 'html', 'doc', 'name', 'accent', 'wallpaper', 'atmosphere', 'fonts', 'result', 'command'];
export const ALLOWED_PARSER_TAGS = [...TAG_NAMES, ...STRUCTURAL_CHILDREN];

export function isTopLevelTag(name) {
  return Object.prototype.hasOwnProperty.call(TAGS, name);
}

export function tagFeedsBack(name) {
  return !!TAGS?.[name]?.feedsBack;
}

// Render the registry into the system-prompt format. Mirrors Sixth's per-tool
// section layout for prompt-cache friendliness.
export function buildToolDocs() {
  const sections = [];
  for (const [name, def] of Object.entries(TAGS)) {
    // hidden:true entries (e.g. legacy widget tag shims) are registered so
    // the executor can dispatch any leftover tag from old conversation
    // history, but they're not exposed in the LLM's system prompt.
    if (def.hidden) continue;
    const lines = [`## ${name}`, def.description];

    const attrs = def.params?.attrs;
    const children = def.params?.children;
    const body = def.params?.body;
    if (attrs && Object.keys(attrs).length) {
      lines.push('Attributes:');
      for (const [k, v] of Object.entries(attrs)) lines.push(`  - ${k}: ${v}`);
    }
    if (children && Object.keys(children).length) {
      lines.push('Child tags:');
      for (const [k, v] of Object.entries(children)) lines.push(`  - <${k}>: ${v}`);
    }
    if (body) {
      lines.push(`Body: ${body === 'text' ? 'plain text (CDATA-wrap if it contains < or >)' : body}`);
    }

    if (def.examples?.length) {
      // One example per tag is enough — the model only needs to see the
      // syntax shape, not multiple variants. Shipping all 3-5 examples
      // for every one of ~54 tags was eating ~15k chars per system prompt.
      lines.push('Usage:');
      lines.push(def.examples[0]);
    }
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}
