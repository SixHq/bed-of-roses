// WallpaperService — sets the macOS desktop wallpaper using the modern
// NSWorkspace API. Replaces the osascript path at v2/host/main.cjs:1170-1173
// which routinely fails with "Not authorized to send Apple events" until
// the user grants Automation permission. NSWorkspace.setDesktopImageURL
// requires no permission grant — that's the whole point of this phase.

import AppKit
import Foundation

enum WallpaperService {
  /// Apply `imagePath` as the desktop wallpaper on every connected display.
  /// Returns nil on success, or a human-readable error string on any failure.
  static func apply(imagePath: String) -> String? {
    let url = URL(fileURLWithPath: imagePath)
    if !FileManager.default.fileExists(atPath: url.path) {
      return "image file not found: \(imagePath)"
    }
    var firstError: String?
    for screen in NSScreen.screens {
      do {
        // No options dict needed for the standard fill-screen behavior;
        // macOS picks up the previous fill style per screen.
        try NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: [:])
      } catch {
        let id = screen.localizedName.isEmpty ? "screen" : screen.localizedName
        let msg = "setDesktopImageURL failed on \(id): \(error.localizedDescription)"
        HelperLog.warn(msg)
        if firstError == nil { firstError = msg }
      }
    }
    return firstError
  }
}
