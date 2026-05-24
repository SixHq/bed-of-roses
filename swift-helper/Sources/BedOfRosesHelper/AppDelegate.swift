// AppDelegate — wires up the HTTP control server, the window registry,
// and the parent-PID watchdog. Owns the lifetime of each.

import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  private let config: HelperConfig
  private let windowRegistry: WindowRegistry
  private var controlServer: ControlServer?
  private var watchdog: ParentPidWatchdog?

  init(config: HelperConfig) {
    self.config = config
    let runtime = RuntimeClient(baseURL: config.runtimeURL)
    let hostControl = HostControlClient(baseURL: config.hostControlURL, token: config.hostControlToken)
    self.windowRegistry = WindowRegistry(runtime: runtime, hostControl: hostControl)
  }

  func applicationDidFinishLaunching(_: Notification) {
    HelperLog.info("AppDelegate up. Registering control server on 127.0.0.1:\(config.port)")
    controlServer = ControlServer(
      port: config.port,
      token: config.token,
      router: Router(windowRegistry: windowRegistry, runtimeURL: config.runtimeURL)
    )
    do {
      try controlServer?.start()
    } catch {
      HelperLog.error("Control server failed to start: \(error). Helper has nothing to do — exiting.")
      // If we can't bind the control socket, Electron will never talk to
      // us. Exit so the launcher restarts us instead of leaving a useless
      // background process running.
      exit(2)
    }

    if let parentPid = config.parentPid {
      watchdog = ParentPidWatchdog(parentPid: parentPid) { [weak self] in
        HelperLog.info("Parent pid \(parentPid) is gone. Helper shutting down.")
        DispatchQueue.main.async {
          NSApp.terminate(self)
        }
      }
      watchdog?.start()
    } else {
      HelperLog.warn("No --bor-parent-pid configured. Helper will not auto-exit when its parent dies.")
    }
  }

  func applicationWillTerminate(_: Notification) {
    HelperLog.info("Helper terminating. Closing windows + control server.")
    windowRegistry.closeAll()
    controlServer?.stop()
    watchdog?.stop()
  }
}
