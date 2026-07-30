// Per-platform window/desktop primitives for the Electron host.
//
// BOR's presence is a frameless transparent always-on-top window that is
// click-through except while the cursor is over the orb/bubble. The three
// desktop platforms disagree on the primitives:
//
//   • always-on-top LEVELS ('screen-saver', relative levels) are macOS +
//     Windows semantics; Linux window managers ignore levels entirely.
//   • setIgnoreMouseEvents(..., { forward: true }) — click-through that still
//     forwards mousemove to the renderer — is macOS + Windows only. On Linux
//     a click-through window receives NOTHING, so the global cursor poll in
//     main.cjs is the only hover signal (it feeds the same renderer hit-test).
//   • setVisibleOnAllWorkspaces is a no-op on Windows, and its
//     { visibleOnFullScreen } option is macOS-only.
//   • transparent windows on Linux need the transparent-visuals switch and a
//     compositor; without one the orb renders on a black rectangle.
//
// Everything platform-divergent about WINDOWS lives here; wallpaper and app
// shortcuts have their own per-platform homes (main.cjs + native-apps.cjs).

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

/**
 * Chromium command-line switches that must land before app.ready.
 */
function applyStartupSwitches(app) {
  if (IS_LINUX) {
    // Required for transparent frameless windows under X11/Wayland.
    app.commandLine.appendSwitch('enable-transparent-visuals');
  }
}

/**
 * Float a window above everything. `relative` raises it above sibling
 * always-on-top windows (used for OAuth popups spawned by an already
 * screen-saver-level panel).
 */
function raiseAlwaysOnTop(win, relative = 0) {
  try {
    if (IS_LINUX) win.setAlwaysOnTop(true);
    else if (relative) win.setAlwaysOnTop(true, 'screen-saver', relative);
    else win.setAlwaysOnTop(true, 'screen-saver');
  } catch { /* best effort */ }
}

/**
 * Show on every workspace/Space (and over fullscreen apps where the OS
 * allows). No-op on Windows, where the option object is unsupported and
 * always-on-top already covers the practical cases.
 */
function pinToAllWorkspaces(win, pinned = true) {
  if (IS_WIN) return;
  try {
    if (IS_MAC) win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: pinned });
    else win.setVisibleOnAllWorkspaces(pinned);
  } catch { /* best effort */ }
}

/**
 * Make the (transparent) window click-through. On mac/win, forwarded
 * mousemove keeps the renderer hit-test alive; on Linux forwarding does not
 * exist, so callers must rely on the global cursor poll for hover detection.
 */
function ignoreMouse(win) {
  try {
    if (IS_LINUX) win.setIgnoreMouseEvents(true);
    else win.setIgnoreMouseEvents(true, { forward: true });
  } catch { /* best effort */ }
}

function captureMouse(win) {
  try { win.setIgnoreMouseEvents(false); } catch { /* best effort */ }
}

// --- Wallpaper -------------------------------------------------------------
// Composing the wallpaper image is cross-platform (offscreen BrowserWindow in
// main.cjs); only reading/applying the desktop picture is per-platform.
//   darwin: osascript (main.cjs prefers the Swift helper first — no Automation
//           grant needed there; this is the fallback path)
//   win32:  SystemParametersInfo via a PowerShell Add-Type one-liner; current
//           value from HKCU\Control Panel\Desktop
//   linux:  gsettings (GNOME family) with plasma-apply-wallpaperimage (KDE)
//           fallback; anything else is a logged no-op

const { execFile } = require('node:child_process');

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) rejectPromise(new Error(String(stderr || err.message).trim()));
      else resolvePromise(String(stdout));
    });
  });
}

const WIN_SET_WALLPAPER_PS = (imagePath) => `
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class BorWp { [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, string pvParam, uint fWinIni); }';
if (-not [BorWp]::SystemParametersInfo(20, 0, ${JSON.stringify(imagePath)}, 3)) { throw 'SystemParametersInfo failed' }`;

/** Best-effort read of the CURRENT desktop wallpaper (for snapshot/restore). Returns a path/uri string or null. */
async function getCurrentWallpaper() {
  try {
    if (IS_MAC) {
      const out = await execFileP('osascript', ['-e', 'tell application "System Events" to get picture of first desktop']);
      return out.trim() || null;
    }
    if (IS_WIN) {
      const out = await execFileP('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'Wallpaper']);
      const m = out.match(/Wallpaper\s+REG_SZ\s+(.+)/);
      return m ? m[1].trim() : null;
    }
    if (IS_LINUX) {
      const out = await execFileP('gsettings', ['get', 'org.gnome.desktop.background', 'picture-uri']);
      return out.trim().replace(/^'|'$/g, '') || null;
    }
  } catch { /* permission not granted / unknown DE — snapshot unavailable */ }
  return null;
}

/**
 * Apply `value` as the desktop wallpaper. Accepts an absolute image path (all
 * platforms) or, on linux, a previously-snapshotted file:// uri.
 */
async function setWallpaper(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('no wallpaper value');
  if (IS_MAC) {
    const script = `tell application "System Events" to tell every desktop to set picture to POSIX file "${raw.replaceAll('"', '\\"')}"`;
    await execFileP('osascript', ['-e', script]);
    return 'osascript';
  }
  if (IS_WIN) {
    await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_SET_WALLPAPER_PS(raw)]);
    return 'SystemParametersInfo';
  }
  if (IS_LINUX) {
    const uri = raw.startsWith('file://') ? raw : `file://${raw}`;
    try {
      await execFileP('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', uri]);
      await execFileP('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri]).catch(() => {});
      return 'gsettings';
    } catch { /* not GNOME — try KDE */ }
    await execFileP('plasma-apply-wallpaperimage', [raw.replace(/^file:\/\//, '')]);
    return 'plasma';
  }
  throw new Error(`wallpaper not supported on ${process.platform}`);
}

module.exports = {
  IS_MAC,
  IS_WIN,
  IS_LINUX,
  applyStartupSwitches,
  raiseAlwaysOnTop,
  pinToAllWorkspaces,
  ignoreMouse,
  captureMouse,
  getCurrentWallpaper,
  setWallpaper,
};
