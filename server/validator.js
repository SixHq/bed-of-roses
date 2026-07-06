// Layer 3 / 9.3 — Code validation. Static checks for AI-generated app/widget HTML
// before we ever write it to disk or render it in an iframe. This is a
// belt-and-suspenders defense; the iframe sandbox + CSP are the primary gates.

const FORBIDDEN_PATTERNS = [
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed' },
  { pattern: /new\s+Function\s*\(/, reason: 'Function constructor is not allowed' },
  { pattern: /\bdocument\.cookie\b/, reason: 'cookie access is not allowed' },
  // Allow `parent.postMessage` (the bridge to the host shell — the only legal
  // way to read/write state.json or call askAI) but reject any other
  // window.parent / parent.* access. Heuristic: look at what comes AFTER the
  // identifier. `parent.postMessage(` is fine; `parent.location`, `window.parent`
  // by itself, anything else — refused.
  { pattern: /\bwindow\.parent\b/, reason: 'window.parent is not allowed — use the global `parent.postMessage` bridge instead' },
  { pattern: /\bparent\.(?!postMessage\b)\w+/, reason: 'only parent.postMessage is allowed; other parent.* access is forbidden' },
  { pattern: /\bwindow\.top\b/, reason: 'top frame access is not allowed' },
  { pattern: /\bwindow\.opener\b/, reason: 'opener access is not allowed' },
  { pattern: /<script[^>]+\bsrc\s*=/i, reason: 'external <script src> is not allowed' },
  { pattern: /\bimport\s*\(/, reason: 'dynamic import() is not allowed' },
  { pattern: /\blocalStorage\b/, reason: 'localStorage is not allowed — use getState()/setState() via the bridge' },
  { pattern: /\bsessionStorage\b/, reason: 'sessionStorage is not allowed — use getState()/setState() via the bridge' },
  { pattern: /\bindexedDB\b/, reason: 'indexedDB is not allowed — use getState()/setState() via the bridge' },
  // The <say> tag + say() calls are for the AI response text only — never
  // inside widget HTML/JS. Widgets are silent visual surfaces; narration is
  // the companion's job, outside the widget iframe.
  { pattern: /<say\b/i, reason: '<say> tags belong in the response text, not in widget HTML' },
  { pattern: /\bsay\s*\(/, reason: 'say() calls are not allowed inside widget code' },
];

export function validateWidgetCode(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return { ok: false, reason: 'empty surface code' };
  }
  if (html.length > 200_000) {
    return { ok: false, reason: 'surface too large (>200KB)' };
  }
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) return { ok: false, reason };
  }
  // setInterval polling rate cap. Shortcuts that poll faster than every 5
  // seconds wear out the bridge endpoints and keep the presence window's CPU
  // warm (bad battery, choppy UX). Match literal `setInterval(fn, N)` calls;
  // if N < 5000, reject. Variable intervals (`setInterval(fn, x)`) are not
  // caught — those are the surface's own runtime choice and we trust the
  // host's auto-pause + 5-iframe cap to limit damage. Catches the easy 90%.
  const intervalRe = /\bsetInterval\s*\(\s*[^,]+,\s*(\d+)\s*\)/g;
  let m;
  while ((m = intervalRe.exec(html)) !== null) {
    const interval = Number(m[1]);
    if (Number.isFinite(interval) && interval < 5000) {
      return {
        ok: false,
        reason: `setInterval interval ${interval}ms is too aggressive — minimum 5000ms (5 seconds). Polling faster than this wastes bridge budget and drains the user's battery. Use a longer interval, or update the UI from user events instead of polling.`,
      };
    }
  }
  return { ok: true };
}

// ---------- Shell command validation ----------
//
// Ports the spirit of Sixth's detectInlineCode. The model is told to NEVER
// use heredocs, multi-line inline code, or run obviously destructive commands.
// If it tries anyway, we refuse and surface the reason so the next turn can
// course-correct.

const SHELL_DANGER_PATTERNS = [
  // Multi-line interpreter inline-code (python -c, node -e, ruby -e, perl -e).
  // Catches both literal newlines AND `\n` escape sequences inside the quoted
  // arg, plus the giveaway statement chains that signal a multi-statement
  // smuggle (`; def `, `; import `, etc).
  {
    pattern: /(python3?|node|ruby|perl|bash|sh|zsh)\s+(-c|-e|--command|--eval)\s+["'][\s\S]*?(\\n|\n|;\s*(def |class |import |from |for |while |function |require ))/i,
    reason: 'multi-line inline code in -c/-e — write a script with <write_file> and run it via <execute_command> instead',
  },
  // Heredocs.
  { pattern: /<<-?~?\s*['"]?\w+['"]?/, reason: 'heredocs (<<) are not allowed — use <write_file>' },
  // Newline in command body — single-line only.
  { pattern: /\n/, reason: 'commands must be single-line' },
  // Catastrophic destructive patterns. Tightly scoped — we don't want to block
  // every `rm`. Only the obvious accidents.
  { pattern: /\brm\s+(-[rRf]+\s+)+\/(\s|$)/, reason: 'refused: rm -rf /' },
  { pattern: /\brm\s+(-[rRf]+\s+)+~(\s|$)/, reason: 'refused: rm -rf ~' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, reason: 'refused: fork bomb' },
  { pattern: /\bmkfs\.\w+\s/, reason: 'refused: filesystem format' },
  { pattern: /\bdd\s+if=\/dev\/(zero|random|urandom)\s+of=\//, reason: 'refused: dd to root device' },
  { pattern: /\b(curl|wget)\s[^|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/, reason: 'refused: pipe-to-shell from network' },
  // Refuse commands that (re)start the BOR host/runtime itself. The agent runs
  // INSIDE this host; launching another one restarts the process tree and
  // closes every open surface window mid-task. To reload a surface, use
  // <launch_app>/<launch_shortcut> (reopens the window) and <screen_capture>
  // to verify — never restart the host.
  {
    pattern: /\b(npm|pnpm|yarn)\s+(run\s+)?(v2(:host|:cli)?|start|dev)\b/,
    reason: 'refused: that starts/restarts the Bed of Roses host, which closes every open surface window. To reload a surface use <launch_app id="..."/> (it reopens the window), then <screen_capture> to verify — do not restart the host.',
  },
  { pattern: /(^|[\s;&|])electron(\s|$)/, reason: 'refused: launching Electron restarts the host and closes open surfaces. Use <launch_app>/<launch_shortcut> to reopen a surface instead.' },
  { pattern: /\bnpx\s+bor\b/, reason: 'refused: npx bor starts another host instance, closing open surfaces. Use <launch_app>/<launch_shortcut> instead.' },
  { pattern: /bin\/bed-of-roses(\.cjs)?\b/, reason: 'refused: that starts another host instance, closing open surfaces. Use <launch_app>/<launch_shortcut> instead.' },
];

export function validateShellCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) {
    return { ok: false, reason: 'empty command' };
  }
  if (cmd.length > 4000) {
    return { ok: false, reason: 'command too long (>4KB)' };
  }
  for (const { pattern, reason } of SHELL_DANGER_PATTERNS) {
    if (pattern.test(cmd)) return { ok: false, reason };
  }
  return { ok: true };
}
