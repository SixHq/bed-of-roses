// ScreenCaptureService — capture the main display (or a sub-region) to PNG.
// Uses CGDisplayCreateImage which works on macOS 13+ and triggers the
// standard system "Screen Recording" consent prompt on first use.
//
// The Info.plist declares NSScreenCaptureUsageDescription so the prompt
// shows our usage copy. Without that declaration macOS would silently
// return an empty/transparent image — that's why declaring it up front
// in Phase 1 mattered.
//
// Region-based capture and multi-display capture are out of scope here;
// the single "capture entire main display → PNG" hot path is all the
// computer.js handler needs in Phase 5. Future work tracks ScreenCaptureKit
// migration for sub-region / per-display capture.

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ScreenCaptureService {
  struct Capture {
    let savedPath: String
    let width: Int
    let height: Int
  }

  /// Capture the main display and write a PNG to `savePath`. On any
  /// failure returns nil and the caller can fall back to the Python /
  /// osascript path that currently lives in server/protocol/handlers/computer.js.
  static func captureMainDisplay(to savePath: String) -> Capture? {
    let displayID = CGMainDisplayID()
    guard let image = CGDisplayCreateImage(displayID) else {
      HelperLog.warn("CGDisplayCreateImage returned nil — screen-recording permission likely missing")
      return nil
    }
    let url = URL(fileURLWithPath: savePath)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      HelperLog.warn("CGImageDestinationCreateWithURL failed for \(savePath)")
      return nil
    }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else {
      HelperLog.warn("CGImageDestinationFinalize failed for \(savePath)")
      return nil
    }
    return Capture(
      savedPath: url.path,
      width: image.width,
      height: image.height
    )
  }
}
