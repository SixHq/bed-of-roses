import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { detectBrowserUse } from './browser-use.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const LOCAL_SKILLS_DIR = join(PROJECT_ROOT, '.bed-of-roses', 'skills');
const GLOBAL_SKILLS_DIR = join(homedir(), '.bed-of-roses', 'skills');
const SKILL_CONTEXT_MAX_CHARS = 34_000;
const SKILL_SUPPORT_MAX_CHARS = 28_000;
const SUPPORT_DOC_NAMES = ['README.md', 'EXAMPLES.md', 'REFERENCE.md'];

const DEFAULT_BROWSER_USE_SKILL = `---
name: browser-use
description: BOR's default browser automation skill. Use it for any task that requires driving a real browser — navigating sites, signing in to authenticated web apps, sending email or DMs, social posting, Notion, Slack, WhatsApp, Twitter/X, Gmail, account creation, dashboard/API-key work, form filling, screenshots, web UI testing, and extracting data from JavaScript-rendered pages. Drive it by piping small Python scripts to the browser-use CLI through execute_command.
allowed-tools: Bash(browser-use:*)
---

# Browser Automation With browser-use CLI (v3)

browser-use v3 ("CLI 3.0, Browser Harness") runs a persistent daemon that ATTACHES TO THE USER'S REAL RUNNING CHROME over CDP — their actual signed-in profile, cookies, and open tabs. The browser is inherently visible to the user; there are no headed/headless flags and no managed Chromium. The old v2 verb subcommands (\`open\`, \`state\`, \`get\`, \`click\`, \`input\`, \`type\`, \`keys\`, \`scroll\`, \`wait\`, \`screenshot\`, \`profile list\`, \`connect\`) NO LONGER EXIST — do not use them.

You drive it by piping a SMALL Python script to \`browser-use\` on stdin via the \`execute_command\` tool:

\`\`\`
browser-use <<'PY'
new_tab("https://example.com")
print(page_info())
PY
\`\`\`

Each command runs fast (~50 ms per call against the daemon). The harness gives you up to 30 minutes per command via \`timeout_seconds\` and captures stdout up to 64 KB. The model-facing tool_result is a compact preview; if a printed page dump omits lines you need, call \`read_command_tail\` with the \`run_id\` and offset shown in the preview.

## How to write scripts

- **One small atomic script per command.** Hard cap ~40 lines. One logical step per script — but combining a navigation with an immediate read (\`new_tab(...)\` then \`print(page_info())\`) is fine and encouraged; it saves a round trip.
- **Always \`print(...)\` the state or data you need back.** A script that acts but prints nothing tells you nothing — stdout is your ONLY channel for results.
- Helper functions cover 20+ categories: navigation (\`new_tab\` etc.), page inspection (\`page_info\`), clicking, form filling, JS execution, screenshots, cookies/session, waits. Use ONLY the helpers documented by \`browser-use skill show\` (see first-touch below) — do not invent function names.
- **Forbidden:** natural-language task mode — \`browser-use "<some English task>"\` hands the whole task to browser-use's opaque internal agent, which BOR cannot narrate or supervise; never invoke it. Also forbidden: long monolithic scripts that try to do the whole task in one command, and infinite loops or long sleeps inside a script. Split work into steps and reason between them.
- Cloud daemons (\`BU_NAME\`) are not needed for BOR's default flows; stay on the local daemon.

## First-touch setup (once per session)

1. Run \`browser-use --doctor\` once so you know the daemon can attach to the user's Chrome and which features are available. Treat warnings that don't block attaching as non-blocking.
2. If the CLI supports it, ALSO run \`browser-use skill show\` once. It prints the official, up-to-date function reference for the helper API — follow that printed reference over your memory of helper names or signatures. This is deliberate: it keeps BOR current when upstream changes the helpers.

## Ground truth — verify after act

The browser on screen is the user's real Chrome, but YOUR source of truth is only what your latest script printed or captured.

- A script that clicks, types, or submits only proves those calls were dispatched. It does NOT prove navigation, success, an OTP/email, a created API key, or that a button is visible.
- **After ANY acting script (click/type/submit/JS), the NEXT script must read state — \`print(page_info())\` or a screenshot — BEFORE you claim anything happened.**
- Never say you are on a page, see a button, created a key, sent a message, or triggered an email unless the latest post-action printed output or screenshot proves it.
- If the expected element or confirmation is missing from the latest output, do not infer it from memory or the site's usual layout. Run another small script that waits, scrolls, or navigates deliberately and prints fresh state; call \`read_command_tail\` if the compact preview truncated the lines you need.
- Fall back to computer-use on the visible Chrome window only after a real error (explicit exception, daemon cannot attach, the same step failing repeatedly against fresh state) — never merely because one read didn't show what you expected.

## Identity confirmation — MANDATORY GATE

The daemon acts inside the user's REAL signed-in Chrome. Any identity-touching task requires explicit confirmation FIRST. That includes (non-exhaustive): sending email or DMs, checking messages, logging in or signing up anywhere, replying to comments, posting on social, account creation, checkouts/purchases, billing, dashboards, API-key creation, OAuth flows, profile/settings changes, Notion, Slack, WhatsApp, Twitter/X, Gmail, LinkedIn, Instagram, TikTok, banking, calendars, file uploads to identity-bound services.

Before the first identity-touching action, you MUST:

1. Emit one \`<wait_for_human_input kind="profile_choice">\` whose body:
   - States plainly that browser-use will act inside their signed-in, running Chrome — real accounts, real cookies, real sessions.
   - Asks them to confirm that is OK for this specific task.
   - If several Chrome profile windows are running, names them and asks which one to act in.
2. **STOP. End the turn. Emit no more tool calls.** Do not pick a default for the user. Do not "guess the most plausible one." The turn ends here. The user replies with their confirmation/choice in their next message, and you continue from there.

This gate exists because acting as the wrong identity is a real harm (sent from the wrong account, posted to the wrong profile, leaked context). \`<wait_for_human_input>\` is the explicit stop signal; use it instead of \`<attempt_completion>\` whenever the next step depends on the user. If the user already explicitly confirmed earlier in this task ("yes, use my Chrome", "send it from my work profile window"), that counts — don't re-ask on every step. Read-only public browsing ("open Wikipedia", "check if this URL is alive", "scrape this public page") needs no gate.

## Core workflow — STEP BY STEP ONLY

1. **Narrate** what you are about to do in one short \`<say>\`.
2. Run **one** small browser-use Python script via \`execute_command\` (stdin heredoc as above).
3. Read the tool_result. Element references, URLs, and confirmations come from what YOU printed — not guesses.
4. Repeat until the outcome is verified.

Do not copy full page dumps into \`<say>\` or restate the page before acting. Extract the needed URL, text, confirmation, or element, then run the next script. Fetch more captured output via \`read_command_tail\` only when the preview omits something the next step requires.

For email specifically: one script to open Gmail and \`print(page_info())\`; one to click Compose and print fresh state; one or two to fill recipient/subject/body (printing state after); one to click Send; one final read that proves the sent confirmation. Five to eight small scripts, each preceded by a one-sentence \`<say>\`.

If a script errors, fix THAT script and retry the minimal next step. If you genuinely cannot make progress without the user (MFA prompt, CAPTCHA, blocked automation, missing credentials), use \`<wait_for_human_input>\` with a clear request — don't loop on setup, and never fall through to natural-language task mode.

## Rules

- **Completion = outcome verified, then call \`attempt_completion\`.** For any task tied to an outcome (send, post, submit, reply, create, purchase, save), call \`attempt_completion\` ONLY after a post-action script has printed or screenshotted the proof — sent-confirmation banner, redirect to /sent, success toast, or the recorded value present where it should be. "I ran the click" is NOT done. "The follow-up page_info() shows the Sent confirmation" IS done.
- For email specifically: fill recipient → subject → body → click Send → verify the message is sent (confirmation banner, compose window closed, or the thread in Sent). Skipping the verification read is half-done — do NOT call \`attempt_completion\`.
- Narrate every action briefly in a \`<say>\` before each command. The user sees nothing during execution — short narrations keep them oriented.
- Pause for MFA, real CAPTCHAs, missing credentials, or genuinely ambiguous account choice. Use \`<wait_for_human_input>\` describing what you need, then stop.
- When the user only asks for setup ("open Gmail"), opening the page — verified by a printed \`page_info()\` — IS the completion. Call \`attempt_completion\`.
- Use \`browser-use --doctor\` when the connection misbehaves; use Browserbase only if the user explicitly asks for it.
`;

const DEFAULT_BROWSERBASE_SKILL = `---
name: browserbase
description: Legacy Browserbase fallback for BOR. Prefer browser-use for normal browser automation, Gmail/email, social DMs, Notion, dashboards, accounts, and forms. Use this only when the user explicitly asks for Browserbase, Browserbase cloud/platform features, Browserbase Search/Fetch/Functions, or when browser-use is unavailable.
---

# Browserbase For BOR

This is BOR's legacy Browserbase adapter. BOR's default browser automation skill is now \`browser-use\`; load this skill only when Browserbase is explicitly requested or browser-use is unavailable.

For tasks that normally require a browser when a native app is unavailable, prefer \`<use_skill name="browser-use"/>\`.

BOR has two browser paths:

1. BOR MCP browser, preferred for interactive tasks.
   - Server name: \`browserbase\`
   - Backed by \`server/mcp/playwright-service.js\`
   - Persistent local browser profile under \`.bed-of-roses/browser/user-profile\`
   - Best for Gmail, dashboards, OAuth, API-key creation, JS-rendered pages, clicking, typing, screenshots, and authenticated flows.
2. Official Browserbase \`browse\` CLI skills, use only when requested or needed.
   - \`browser\` skill: interactive automation through the \`browse\` CLI.
   - \`browserbase-cli\` skill: Browserbase Functions, sessions, projects, contexts, Fetch API, Search API, and templates.

## Default workflow

1. \`<list_mcp_servers/>\`
2. \`<list_mcp_tools server="browserbase"/>\`
3. Use the actual tool names returned by the server with \`<use_mcp_tool server="browserbase" tool="...">\`.
4. Snapshot/read page state before choosing refs. Click/type using refs. Snapshot again to verify.

## Required profile gate for account actions

Before sending, posting, responding, creating accounts, purchasing, submitting forms, or doing anything tied to a user's identity:

1. Use the Browserbase/browser CLI profile discovery path to fetch/list available Chrome profiles.
2. Ask the user which profile/account to use.
3. Always include a \`profileless / clean session\` option.
4. Wait for the user's choice before navigating or acting.
5. Continue with Browserbase using the selected profile.

If profile discovery is unavailable, say that clearly and ask the user to choose between existing BOR browser profile, default Chrome profile, or profileless clean session. Do not send an email, DM, social post, checkout, account creation, dashboard change, or form submission until the profile/account choice is explicit.

## Rules

- Never claim a browser action succeeded until verified by snapshot, visible text, URL/title, or screenshot.
- Prefer refs returned by snapshots over guessed selectors.
- Re-snapshot after navigation or major UI changes because refs can change.
- If credentials, MFA, or manual login are needed, say so and wait for the user.
- If no browser MCP exists and the task is simple/static, use \`<web_search>\` and \`<web_fetch>\`.
- Use \`<use_skill name="browser"/>\` for official \`browse\` CLI interactive workflows.
- Use \`<use_skill name="browserbase-cli"/>\` for Browserbase platform/CLI operations.
`;

function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const valueFor = (key) => {
    const lines = fm.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(new RegExp(`^${key}:\\s*(.*)$`));
      if (!match) continue;
      const raw = match[1].trim();
      if (raw === '|' || raw === '>') {
        const block = [];
        for (let j = i + 1; j < lines.length; j += 1) {
          if (/^[A-Za-z0-9_-]+:\s*/.test(lines[j])) break;
          block.push(lines[j].replace(/^\s{2}/, ''));
        }
        return block.join(raw === '>' ? ' ' : '\n').trim();
      }
      return raw.replace(/^['"]|['"]$/g, '').trim();
    }
    return '';
  };
  const name = valueFor('name');
  const description = valueFor('description');
  if (!name) return null;
  return { name, description };
}

function stripFrontmatter(content) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

async function ensureBuiltins() {
  const builtins = [
    ['browser-use', DEFAULT_BROWSER_USE_SKILL],
    ['browserbase', DEFAULT_BROWSERBASE_SKILL],
  ];
  for (const [name, content] of builtins) {
    const path = join(LOCAL_SKILLS_DIR, name, 'SKILL.md');
    if (existsSync(path)) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
}

async function scanDir(dir, source) {
  const skills = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = join(dir, entry.name);
      const skillMdPath = join(folderPath, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;
      try {
        const content = await readFile(skillMdPath, 'utf8');
        const meta = parseFrontmatter(content);
        if (!meta) continue;
        skills.push({
          ...meta,
          source,
          folderPath,
          skillMdPath,
          body: stripFrontmatter(content),
        });
      } catch {
        // skip unreadable skills
      }
    }
  } catch {
    // missing dir is fine
  }
  return skills;
}

function supportDocRank(path) {
  const name = path.toLowerCase();
  const priorities = [
    'browser.skill.md',
    'browser.examples.md',
    'browser.reference.md',
    'browserbase-cli.skill.md',
    'browserbase-cli.reference.md',
    'readme.md',
    'examples.md',
    'reference.md',
  ];
  const index = priorities.findIndex((needle) => name.endsWith(needle));
  return index === -1 ? 100 : index;
}

async function collectSupportDocPaths(folderPath) {
  const paths = [];
  for (const name of SUPPORT_DOC_NAMES) {
    const docPath = join(folderPath, name);
    if (existsSync(docPath)) paths.push(docPath);
  }
  const referencesPath = join(folderPath, 'references');
  if (existsSync(referencesPath)) {
    try {
      const entries = await readdir(referencesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(md|txt)$/i.test(entry.name)) continue;
        paths.push(join(referencesPath, entry.name));
      }
    } catch {
      // references are optional
    }
  }
  return [...new Set(paths)].sort((a, b) => supportDocRank(a) - supportDocRank(b) || a.localeCompare(b));
}

async function renderSupportDocs(folderPath, { maxChars = SKILL_SUPPORT_MAX_CHARS } = {}) {
  const paths = await collectSupportDocPaths(folderPath);
  if (!paths.length) return '';
  const sections = [];
  let used = 0;
  for (const docPath of paths) {
    try {
      const rel = docPath.slice(folderPath.length + 1);
      const raw = await readFile(docPath, 'utf8');
      const header = `## Supporting file: ${rel}\n`;
      const remaining = maxChars - used - header.length;
      if (remaining <= 80) break;
      const body = raw.length > remaining
        ? `${raw.slice(0, remaining)}\n[…${rel} truncated]`
        : raw;
      sections.push(`${header}${body.trim()}`);
      used += header.length + body.length;
      if (used >= maxChars) break;
    } catch {
      // skip unreadable support docs
    }
  }
  if (!sections.length) return '';
  return `# Skill Supporting References\n${sections.join('\n\n')}`;
}

// Skills that should be hidden when their backing tool isn't installed on the
// system. Saves prompt tokens AND prevents the model from being taught a CLI
// that will just fail with "command not found." Probe results are cached.
const CONDITIONAL_SKILLS = {
  'browser-use': async () => (await detectBrowserUse()).installed,
};

async function filterByAvailability(skills) {
  const out = [];
  for (const skill of skills) {
    const probe = CONDITIONAL_SKILLS[skill.name];
    if (probe) {
      try {
        const available = await probe();
        if (!available) continue;
      } catch {
        // If detection itself errors, default to including the skill — the
        // user might have a working install we just can't probe.
      }
    }
    out.push(skill);
  }
  return out;
}

export async function discoverSkills() {
  await ensureBuiltins();
  const [globalSkills, localSkills] = await Promise.all([
    scanDir(GLOBAL_SKILLS_DIR, 'global'),
    scanDir(LOCAL_SKILLS_DIR, 'local'),
  ]);
  const map = new Map();
  for (const skill of globalSkills) map.set(skill.name, skill);
  for (const skill of localSkills) map.set(skill.name, skill);
  const all = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return filterByAvailability(all);
}

export async function loadSkill(name, { maxChars = SKILL_CONTEXT_MAX_CHARS } = {}) {
  const skills = await discoverSkills();
  const skill = skills.find((s) => s.name === name) || null;
  if (!skill) return null;
  const supportDocs = await renderSupportDocs(skill.folderPath);
  const body = [skill.body, supportDocs].filter(Boolean).join('\n\n');
  return {
    ...skill,
    body: body.length > maxChars ? `${body.slice(0, maxChars)}\n[…skill context truncated]` : body,
  };
}

export async function renderSkillsBlock({ maxChars = 4000 } = {}) {
  const skills = await discoverSkills();
  if (!skills.length) return '(no skills installed)';
  const out = skills.map((s) => `- ${s.name} (${s.source}) — ${s.description}`).join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n[…skills truncated]` : out;
}

export { LOCAL_SKILLS_DIR, GLOBAL_SKILLS_DIR };
