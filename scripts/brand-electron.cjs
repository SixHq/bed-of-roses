#!/usr/bin/env node
// Rebrand the local Electron.app bundle as "Bed of Roses" (name + bundle id + bloom
// icon) so the macOS menu bar, dock, App Switcher, and — importantly — privacy
// permission prompts + System Settings show "Bed of Roses" instead of "Electron" in
// dev (`npm run v2`). macOS attributes those to the running .app BUNDLE, which
// app.setName() cannot change. Run automatically before every launch (prev2 hook)
// so it re-applies after `npm install` restores the stock Electron bundle.
// macOS only; never fails the launch.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app');
const PL = path.join(APP, 'Contents', 'Info.plist');
const ICON = path.join(ROOT, 'v2', 'host', 'assets', 'bloom-icon.icns');
const NAME = 'Bed of Roses';
const BUNDLE_ID = 'co.sixth.bedofroses';
const PB = '/usr/libexec/PlistBuddy';

const pbGet = (k) => { try { return execFileSync(PB, ['-c', `Print :${k}`, PL], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const pbSet = (k, v) => {
  try { execFileSync(PB, ['-c', `Set :${k} ${v}`, PL], { stdio: 'ignore' }); }
  catch { try { execFileSync(PB, ['-c', `Add :${k} string ${v}`, PL], { stdio: 'ignore' }); } catch { /* ignore */ } }
};

try {
  if (!fs.existsSync(PL)) process.exit(0);
  // Idempotent: skip the (slow) re-sign if the bundle is already branded.
  if (pbGet('CFBundleName') === NAME && pbGet('CFBundleIdentifier') === BUNDLE_ID) {
    console.log('[brand] Electron.app already branded "Bed of Roses"');
    process.exit(0);
  }
  pbSet('CFBundleName', NAME);
  pbSet('CFBundleDisplayName', NAME);
  pbSet('CFBundleIdentifier', BUNDLE_ID);
  // Swap the bundle icon (overwrite the file CFBundleIconFile points at).
  const iconName = pbGet('CFBundleIconFile') || 'electron.icns';
  const iconDst = path.join(APP, 'Contents', 'Resources', iconName.endsWith('.icns') ? iconName : `${iconName}.icns`);
  if (fs.existsSync(ICON)) fs.copyFileSync(ICON, iconDst);
  // Modified Info.plist invalidates the signature; re-sign ad-hoc (deep → nested
  // helpers) so macOS launches it and attributes TCC permissions to the new id.
  try { execFileSync('codesign', ['--remove-signature', APP], { stdio: 'ignore' }); } catch { /* ignore */ }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', APP], { stdio: 'ignore' });
  console.log(`[brand] Electron.app -> "${NAME}" (${BUNDLE_ID}) + bloom icon`);
} catch (e) {
  console.warn('[brand] skipped (will run again next launch):', e.message);
}
process.exit(0);
