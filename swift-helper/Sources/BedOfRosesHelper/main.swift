// Entry point. Boots an NSApplication with our AppDelegate so we get
// the full AppKit run-loop, then the delegate stands up the HTTP control
// server and the parent-PID watchdog.
//
// We deliberately do NOT use @main / @NSApplicationMain — being explicit
// about the run-loop lets us interrupt for the watchdog without fighting
// SwiftUI lifecycle conventions.

import AppKit
import Foundation

// Parse argv up-front so config is in hand before NSApplication starts.
let config = HelperConfig.fromProcessArguments()
HelperLog.info("BedOfRosesHelper booting (pid=\(getpid()), port=\(config.port), parent=\(config.parentPid?.description ?? "—"))")

let app = NSApplication.shared
let delegate = AppDelegate(config: config)
app.delegate = delegate
// Background-agent posture. The Info.plist sets LSUIElement=YES for the
// bundled build, but when running unbundled from `swift run` we still want
// to behave like an accessory app (no Dock icon, no menu bar).
app.setActivationPolicy(.accessory)
app.run()
