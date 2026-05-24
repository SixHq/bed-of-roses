// HelperConfig — argv + env parsing for token, port, parent PID, runtime URL.
//
// The launcher passes these via argv (preferred — so they don't leak into
// `env | grep BOR` of child processes) with env-var fallbacks for manual
// invocation during development.

import Foundation

struct HelperConfig {
  let token: String
  let port: UInt16
  let parentPid: pid_t?
  let runtimeURL: String  // BOR Node runtime, e.g. http://127.0.0.1:7777
  /// Electron's host-control server URL (e.g. http://127.0.0.1:7797). The
  /// helper posts to this to trigger Electron-side actions like opening a
  /// surface in response to a widget-preview click.
  let hostControlURL: String
  let hostControlToken: String

  static func fromProcessArguments() -> HelperConfig {
    let argv = ProcessInfo.processInfo.arguments
    let env = ProcessInfo.processInfo.environment

    func argFor(_ key: String) -> String? {
      let prefix = "--\(key)="
      for arg in argv where arg.hasPrefix(prefix) {
        return String(arg.dropFirst(prefix.count))
      }
      return nil
    }

    let token = argFor("bor-helper-token")
      ?? env["BOR_HELPER_TOKEN"]
      ?? ""
    let port = UInt16(argFor("bor-helper-port") ?? env["BOR_HELPER_PORT"] ?? "7798") ?? 7798
    let parentPidRaw = argFor("bor-parent-pid") ?? env["BOR_PARENT_PID"]
    let parentPid: pid_t? = parentPidRaw.flatMap { pid_t($0) }
    let runtimeURL = argFor("bor-runtime-url")
      ?? env["BOR_RUNTIME_URL"]
      ?? "http://127.0.0.1:7777"
    let hostControlURL = argFor("bor-host-control-url")
      ?? env["BOR_HOST_CONTROL_URL"]
      ?? ""
    let hostControlToken = argFor("bor-host-control-token")
      ?? env["BOR_HOST_CONTROL_TOKEN"]
      ?? ""

    if token.isEmpty {
      HelperLog.warn("No --bor-helper-token provided. Auth will reject every request.")
    }
    if hostControlURL.isEmpty {
      HelperLog.warn("No host-control URL provided. Widget-preview click-to-open will be a no-op.")
    }

    return HelperConfig(
      token: token,
      port: port,
      parentPid: parentPid,
      runtimeURL: runtimeURL,
      hostControlURL: hostControlURL,
      hostControlToken: hostControlToken
    )
  }
}
