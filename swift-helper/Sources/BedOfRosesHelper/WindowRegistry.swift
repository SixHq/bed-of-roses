// WindowRegistry — owns every WidgetWindowController by surfaceId. All
// access is funneled through here so the control server and the lifecycle
// hooks share one source of truth.

import AppKit

final class WindowRegistry {
  private var controllers: [String: WidgetWindowController] = [:]
  private let runtime: RuntimeClient
  private let hostControl: HostControlClient

  init(runtime: RuntimeClient, hostControl: HostControlClient) {
    self.runtime = runtime
    self.hostControl = hostControl
  }

  func open(spec: WindowSpec) -> WindowInfo {
    MainActor.assumeIsolatedSync { [runtime, hostControl] in
      // Reuse if a window with the same windowKey already exists. Preview
      // and surface have distinct windowKeys (the same surfaceId can have
      // both windows open simultaneously) so this only collapses *true*
      // duplicates — like a second `openSurface(id)` call for an already-
      // open surface.
      if let existing = controllers[spec.windowKey] {
        existing.bringToFront()
        existing.reload()
        return WindowInfo(windowKey: spec.windowKey, surfaceId: spec.surfaceId, bounds: existing.currentBounds)
      }
      let controller = WidgetWindowController(
        spec: spec,
        runtime: runtime,
        onClose: { [weak self] in
          self?.handleClosed(windowKey: spec.windowKey)
        },
        onStateChanged: { id in
          // Phase 3 follow-up: forward to Electron via SSE so sibling
          // views of the same widget can refresh. For now we just log.
          HelperLog.info("state-set on \(id) — siblings would refresh here (SSE pending)")
        },
        onSurfaceClickRequested: { id in
          // User clicked an empty area of the widget preview (not on an
          // input/button/link). Restore the legacy contract: "clicking
          // opens the full <html>." Route through Electron so it
          // sequences openSurface() with the runtime — Electron will
          // POST back with a DISTINCT windowKey (e.g. "<id>::surface")
          // so the surface window is a new NSWindow, not a reload of
          // this preview.
          HelperLog.info("widget preview clicked: \(id) — requesting Electron open full surface")
          Task { await hostControl.requestOpenSurface(surfaceId: id) }
        }
      )
      controllers[spec.windowKey] = controller
      controller.show()
      return WindowInfo(windowKey: spec.windowKey, surfaceId: spec.surfaceId, bounds: controller.currentBounds)
    }
  }

  func close(windowKey: String) {
    MainActor.assumeIsolatedSync {
      controllers[windowKey]?.close()
      controllers.removeValue(forKey: windowKey)
    }
  }

  func closeAll() {
    MainActor.assumeIsolatedSync {
      for controller in controllers.values { controller.close() }
      controllers.removeAll()
    }
  }

  func setBounds(windowKey: String, bounds: CGRect) -> Bool {
    MainActor.assumeIsolatedSync {
      guard let controller = controllers[windowKey] else { return false }
      controller.setBounds(bounds)
      return true
    }
  }

  func bringToFront(windowKey: String) -> Bool {
    MainActor.assumeIsolatedSync {
      guard let controller = controllers[windowKey] else { return false }
      controller.bringToFront()
      return true
    }
  }

  func reload(windowKey: String, ignoreCache: Bool) -> Bool {
    MainActor.assumeIsolatedSync {
      guard let controller = controllers[windowKey] else { return false }
      controller.reload(ignoreCache: ignoreCache)
      return true
    }
  }

  func snapshot() -> [WindowInfo] {
    MainActor.assumeIsolatedSync {
      controllers.map { (key, controller) in
        WindowInfo(windowKey: key, surfaceId: controller.spec.surfaceId, bounds: controller.currentBounds)
      }
    }
  }

  private func handleClosed(windowKey: String) {
    // AppKit calls windowWillClose *before* it finishes walking the window's
    // own responder chain and tearing down the WKWebView (which itself has
    // an out-of-process content view that gets torn down async). Dropping
    // our last strong reference to the controller synchronously inside
    // that callback can free the NSWindow + WKWebView mid-teardown —
    // observed as SIGSEGV in the helper right after "Window closed:" logs.
    //
    // Fix: defer the dict eviction to the next main-actor tick via
    // DispatchQueue.main.async, matching the MainActor.assumeIsolatedSync
    // access pattern used by every other method on this class (the prior
    // `queue.async` path was a separate serial queue → data race with
    // open/close/setBounds).
    DispatchQueue.main.async { [weak self] in
      MainActor.assumeIsolatedSync {
        self?.controllers.removeValue(forKey: windowKey)
        HelperLog.info("Window closed: \(windowKey)")
      }
    }
  }
}

struct WindowSpec {
  /// Registry key. Defaults to surfaceId but Electron sends distinct keys
  /// for preview vs surface windows (e.g. "widget-…::preview" vs
  /// "widget-…::surface") so both can coexist for the same widget — the
  /// preview lives on the desktop, clicking it opens the surface as a
  /// separate window. Same model as legacy Electron's split
  /// `widgetPreviewWindows` / `surfaceWindows` maps.
  let windowKey: String
  /// The real BOR surface id used by the bridge (state-get/set/etc).
  /// May differ from windowKey: a preview and a surface share surfaceId
  /// (so their state is the same widget) but have distinct windowKeys.
  let surfaceId: String
  let kind: String  // "widget" | "app"
  let url: URL
  let bounds: CGRect?
  let title: String?
}

struct WindowInfo {
  let windowKey: String
  let surfaceId: String
  let bounds: CGRect
}

/// Synchronous main-actor helper. `MainActor.assumeIsolated` requires the
/// caller to actually be on the main thread; we wrap with a sync dispatch
/// from the registry's serial queue so background HTTP handlers can safely
/// drive window mutations.
@discardableResult
fileprivate func MainActorAssumeIsolatedSync<T>(_ body: @MainActor () -> T) -> T {
  if Thread.isMainThread {
    return MainActor.assumeIsolated { body() }
  }
  return DispatchQueue.main.sync {
    MainActor.assumeIsolated { body() }
  }
}

extension MainActor {
  static func assumeIsolatedSync<T>(_ body: @MainActor () -> T) -> T {
    MainActorAssumeIsolatedSync(body)
  }
}
