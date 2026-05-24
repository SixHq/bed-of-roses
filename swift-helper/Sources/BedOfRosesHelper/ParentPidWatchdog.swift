// ParentPidWatchdog — polls the launcher's PID every second. The moment
// the parent process disappears, fires `onOrphaned()` so the helper can
// gracefully terminate before macOS leaves it orphaned in the dock-less
// background forever.
//
// `kill(pid, 0)` returns 0 if the process exists (any signal can be sent),
// and errno=ESRCH if it doesn't. Cheap, no privileges needed.

import Foundation

final class ParentPidWatchdog {
  private let parentPid: pid_t
  private let interval: TimeInterval
  private let onOrphaned: () -> Void
  private var timer: DispatchSourceTimer?
  private let queue = DispatchQueue(label: "bor.helper.watchdog")

  init(parentPid: pid_t, interval: TimeInterval = 1.0, onOrphaned: @escaping () -> Void) {
    self.parentPid = parentPid
    self.interval = interval
    self.onOrphaned = onOrphaned
  }

  func start() {
    let t = DispatchSource.makeTimerSource(queue: queue)
    t.schedule(deadline: .now() + interval, repeating: interval)
    t.setEventHandler { [weak self] in
      guard let self else { return }
      if kill(self.parentPid, 0) != 0 && errno == ESRCH {
        self.onOrphaned()
        self.stop()
      }
    }
    t.resume()
    timer = t
  }

  func stop() {
    timer?.cancel()
    timer = nil
  }
}
