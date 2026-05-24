// HelperLog — tiny stderr-only logger.
//
// Writes to stderr so the launcher process (bin/bed-of-roses.cjs) captures
// it alongside Electron and Node-runtime logs. No logfile — the launcher
// handles aggregation if it wants to.

import Foundation

enum HelperLog {
  private static let formatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss.SSS"
    return f
  }()

  static func info(_ msg: String) { emit("INFO", msg) }
  static func warn(_ msg: String) { emit("WARN", msg) }
  static func error(_ msg: String) { emit("ERR ", msg) }

  private static func emit(_ level: String, _ msg: String) {
    let line = "[bor-helper \(formatter.string(from: Date())) \(level)] \(msg)\n"
    FileHandle.standardError.write(Data(line.utf8))
  }
}
