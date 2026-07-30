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

// ---------- History-elision marker imitation ----------
//
// Conversation history compresses long past tool bodies down to a marker
// (ai.js serializeBlock). Weak models imitate what they see: kimi-class
// models have ended their own write_to_file bodies with a literal
// " … [truncated 904 chars]" and closed the tag — silently writing a broken
// 231-byte file that "succeeded". Reject any tool body carrying such a
// marker so the model gets corrective feedback instead of a corrupt write.
// Matches the legacy `[truncated N chars]` shape and the current
// `[… N more chars elided …]` shape, with or without a leading ellipsis.
const ELISION_MARKER_RE = /(?:…|\.\.\.)?\s*\[(?:truncated\s+\d+\s+chars?\b[^\]]*|…?\s*\d+\s+more\s+chars\s+elided\b[^\]]*)\]/i;

export function containsElisionMarker(text) {
  return ELISION_MARKER_RE.test(String(text ?? ''));
}

export const ELISION_MARKER_REASON =
  'the content contains a history-elision placeholder (e.g. "[… N chars elided]" / "[truncated N chars]"). '
  + 'Those markers are display artifacts of compressed conversation history — they are NEVER valid content. '
  + 'Emit the COMPLETE content again, in full, with no truncation markers.';

export function validateWidgetCode(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return { ok: false, reason: 'empty surface code' };
  }
  if (containsElisionMarker(html)) {
    return { ok: false, reason: ELISION_MARKER_REASON };
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
  // Heredocs. Sole exception: the browser-use v3 shape matched by
  // matchBrowserUseHeredoc below — that CLI's only scripted interface is
  // Python piped to stdin.
  { pattern: /<<-?~?\s*['"]?\w+['"]?/, reason: 'heredocs (<<) are not allowed — use <write_file>', browserUseHeredocExempt: true },
  // Newline in command body — single-line only (browser-use heredoc excepted).
  { pattern: /\n/, reason: 'commands must be single-line', browserUseHeredocExempt: true },
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
    pattern: /\b(npm|pnpm|yarn)\s+(run\s+)?(v2(:host|:cli)?|start|dev|server(:dev)?|cli)\b/,
    reason: 'refused: that starts/restarts the Bed of Roses host, which closes every open surface window. To reload a surface use <launch_app id="..."/> (it reopens the window), then <screen_capture> to verify — do not restart the host.',
  },
  { pattern: /(^|[\s;&|])electron(\s|$)/, reason: 'refused: launching Electron restarts the host and closes open surfaces. Use <launch_app>/<launch_shortcut> to reopen a surface instead.' },
  { pattern: /\bnpx\s+bor\b/, reason: 'refused: npx bor starts another host instance, closing open surfaces. Use <launch_app>/<launch_shortcut> instead.' },
  { pattern: /bin\/bed-of-roses(\.cjs)?\b/, reason: 'refused: that starts another host instance, closing open surfaces. Use <launch_app>/<launch_shortcut> instead.' },
  // Windows equivalents of the catastrophic patterns above. Commands run
  // through PowerShell on win32 (see exec.js execShell), where the POSIX
  // rm/dd/mkfs rules never match — these cover the same accidents in
  // PowerShell/cmd vocabulary. Harmless on POSIX (patterns just never match).
  { pattern: /\b(rd|rmdir)\s+\/s\b[^&|;]*\s([a-z]:)?[\\/]\s*($|[&|;])/i, reason: 'refused: recursive delete of a drive root' },
  { pattern: /\bRemove-Item\b[^&|;]*-Recurse\b[^&|;]*\s(([a-z]:)?[\\/]|\$env:USERPROFILE|\$HOME|~)[\\/]?\s*($|[&|;-])/i, reason: 'refused: recursive delete of a root or the home directory' },
  { pattern: /\bformat(\.com)?\s+[a-z]:/i, reason: 'refused: disk format' },
  { pattern: /\b(iex|Invoke-Expression)\s*\(?\s*\(?\s*(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b/i, reason: 'refused: pipe-to-shell from network' },
  { pattern: /\b(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|]*\|\s*(iex|Invoke-Expression)\b/i, reason: 'refused: pipe-to-shell from network' },
  { pattern: /\bSet-MpPreference\b[^&|;]*-Disable/i, reason: 'refused: disabling Windows Defender' },
  { pattern: /\bvssadmin\s+delete\s+shadows\b/i, reason: 'refused: deleting volume shadow copies' },
];

// ---------- browser-use v3 heredoc carve-out ----------
//
// browser-use CLI 3.0 removed the v2 verb subcommands; its only scripted
// interface is Python piped to stdin, canonically a heredoc:
//
//   browser-use <<'PY'
//   ...python...
//   PY
//
// The general heredoc + single-line rules above would refuse that, so we
// pattern-match exactly ONE safe shape and exempt it: a command that is
// nothing but `browser-use` followed by a SINGLE-QUOTED heredoc delimiter
// (single quotes stop the shell from expanding $vars / $(...) inside the
// Python), the script body, and the closing delimiter — nothing else on the
// line, no trailing flags or redirects. Any other heredoc — other commands,
// unquoted or double-quoted delimiters, extra suffixes — still hits the
// general refusal. The exec handler layers its own caps on the Python body
// (line/byte limits, foot-gun screen) on top of this.
const BROWSER_USE_HEREDOC_RE = /^browser-use\s+<<\s*'([A-Za-z_][A-Za-z0-9_]*)'[ \t]*\n([\s\S]*?)\n\1[ \t]*$/;

export function matchBrowserUseHeredoc(cmd) {
  const m = String(cmd ?? '').trim().match(BROWSER_USE_HEREDOC_RE);
  return m ? { delimiter: m[1], body: m[2] } : null;
}

export function validateShellCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) {
    return { ok: false, reason: 'empty command' };
  }
  const browserUseHeredoc = matchBrowserUseHeredoc(cmd);
  // browser-use heredocs get headroom for the 6 KB script cap enforced by the
  // exec handler; everything else keeps the original 4 KB ceiling.
  const maxLen = browserUseHeredoc ? 8192 : 4000;
  if (cmd.length > maxLen) {
    return { ok: false, reason: `command too long (>${browserUseHeredoc ? '8' : '4'}KB)` };
  }
  for (const { pattern, reason, browserUseHeredocExempt } of SHELL_DANGER_PATTERNS) {
    if (browserUseHeredoc && browserUseHeredocExempt) continue;
    if (pattern.test(cmd)) return { ok: false, reason };
  }
  return { ok: true };
}
