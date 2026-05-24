// swift-tools-version:5.9
//
// Bed of Roses Helper — native macOS companion that hosts widget + app
// windows in WKWebViews. Replaces Electron's BrowserWindow for surfaces.
//
// Build (debug, ad-hoc-signed, for local dev):
//     cd swift-helper
//     swift build -c release
//     .build/release/BedOfRosesHelper --bor-helper-token=$(uuidgen) --bor-helper-port=7798
//
// Build (release .app bundle, for distribution): see scripts/build-helper-app.sh
// — wraps the SwiftPM binary in a proper .app structure with Info.plist
// and entitlements, then code-signs with Developer ID.
//
// macOS 13+ for the WKWebView features and `evaluateJavaScript(in:in:)`
// we use in the bridge.

import PackageDescription

let package = Package(
  name: "BedOfRosesHelper",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "BedOfRosesHelper", targets: ["BedOfRosesHelper"]),
  ],
  targets: [
    .executableTarget(
      name: "BedOfRosesHelper",
      path: "Sources/BedOfRosesHelper",
      resources: [
        // BridgePolyfill.js is loaded at runtime by WidgetBridge; ship it
        // as a bundle resource so the binary works whether launched from
        // the build directory or from a packaged .app.
        .process("BridgePolyfill.js"),
      ]
    ),
  ]
)
