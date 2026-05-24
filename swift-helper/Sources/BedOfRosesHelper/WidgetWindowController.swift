// WidgetWindowController — one NSWindow per BOR surface, with a WKWebView
// filling the content view. The window's collectionBehavior is the
// reason this whole helper exists: `[.managed]` alone tells macOS to
// treat the window as a regular Mission Control participant — when the
// user is in a fullscreen Space, macOS routes the window to Space 1
// (home desktop) on its own. No `canJoinAllSpaces`, no
// `fullScreenAuxiliary`. That's the headline win over Electron, where
// `setVisibleOnAllWorkspaces` is a translated subset of this API.

import AppKit
import CoreGraphics
@preconcurrency import WebKit

/// WKWebView subclass that turns the widget surface into a draggable,
/// click-to-open Mac widget — mirroring the legacy registry contract
/// ("the tile/desktop preview shows the <thumbnail> as a live glanceable
/// preview; clicking opens the full <html>").
///
/// WKWebView normally consumes every mouseDown before the NSWindow sees
/// it, so we override:
///   1. Hit-test the DOM under the cursor. If the user clicked on an
///      interactive element (button/link/input/etc), forward to WebKit
///      so the widget can be live (toggles, inputs, taps inside the
///      preview all still work).
///   2. Otherwise capture the window's position, call performDrag (which
///      blocks until mouseUp).
///   3. After performDrag returns, compare the new window origin to the
///      pre-drag one. If the window didn't move beyond a small threshold,
///      treat the gesture as a tap → invoke `onTap(...)` so the registry
///      can route it through Electron's openSurface for the full window.
///
/// `acceptsFirstMouse` returning true means the widget responds to the
/// FIRST click even when the helper isn't the active app — same UX as
/// a real macOS widget.
private final class DraggableWebView: WKWebView {
  /// Set to true for widgets (borderless transparent windows). False for
  /// `app` kind since those have a real titlebar and don't need this.
  var allowBackgroundDrag = false
  /// Called when the user taps an empty area without dragging the
  /// window. Wired by `WidgetWindowController` to route through Electron.
  var onTap: (() -> Void)?

  override func acceptsFirstMouse(for _: NSEvent?) -> Bool { true }

  override func mouseDown(with event: NSEvent) {
    if allowBackgroundDrag, let window = self.window {
      // Hit-test the DOM under the cursor. If the click is on an
      // interactive element, fall through to WebKit's normal handler so
      // the widget's own UI keeps working.
      let point = self.convert(event.locationInWindow, from: nil)
      let js = """
      (function(){
        const el = document.elementFromPoint(\(point.x), \(self.bounds.height - point.y));
        if (!el) return false;
        return el.closest('input,textarea,button,a,select,[contenteditable=\"true\"],[data-bor-no-drag]') ? false : true;
      })();
      """
      var allowDrag = true
      let group = DispatchGroup()
      group.enter()
      self.evaluateJavaScript(js) { result, _ in
        if let value = result as? Bool { allowDrag = value }
        group.leave()
      }
      // Bail out after 30ms — never block input on a slow page.
      _ = group.wait(timeout: .now() + .milliseconds(30))
      if allowDrag {
        let originBefore = window.frame.origin
        window.performDrag(with: event)
        let originAfter = window.frame.origin
        let dx = abs(originAfter.x - originBefore.x)
        let dy = abs(originAfter.y - originBefore.y)
        // <4px movement during the entire mouse-down-up cycle = it was
        // a tap, not a drag. Route to the registered tap handler.
        if dx < 4 && dy < 4 {
          onTap?()
        }
        return
      }
    }
    super.mouseDown(with: event)
  }
}

@MainActor
final class WidgetWindowController: NSObject, NSWindowDelegate {
  let spec: WindowSpec
  private let onClose: () -> Void
  private let onStateChanged: ((String) -> Void)?
  private let onSurfaceClickRequested: ((String) -> Void)?
  private let window: NSWindow
  private let webView: WKWebView
  private let bridge: WidgetBridge

  init(
    spec: WindowSpec,
    runtime: RuntimeClient,
    onClose: @escaping () -> Void,
    onStateChanged: ((String) -> Void)? = nil,
    onSurfaceClickRequested: ((String) -> Void)? = nil
  ) {
    self.spec = spec
    self.onClose = onClose
    self.onStateChanged = onStateChanged
    self.onSurfaceClickRequested = onSurfaceClickRequested
    self.bridge = WidgetBridge(surfaceId: spec.surfaceId, runtime: runtime)

    // Three window roles:
    //   - widget preview  → borderless tile on the desktop, draggable
    //                       background, sits at desktop level, no chrome
    //   - widget surface  → full Mac window with traffic lights, opens
    //                       when the user clicks a preview
    //   - app             → full Mac window with traffic lights (same as
    //                       widget surface)
    // The preview is the only role that gets the borderless desktop-tile
    // treatment. Everything else uses standard NSWindow chrome so the
    // user can close / minimize / zoom them like real apps.
    let isApp = spec.kind == "app"
    let isPreview = !isApp && spec.windowKey.hasSuffix("::preview")

    let bounds = spec.bounds ?? Self.defaultBounds(for: spec)
    let style: NSWindow.StyleMask = isPreview
      ? [.borderless, .resizable]
      : [.titled, .closable, .miniaturizable, .resizable]
    self.window = NSWindow(
      contentRect: bounds,
      styleMask: style,
      backing: .buffered,
      defer: false
    )
    window.isOpaque = !isPreview
    window.backgroundColor = isPreview ? .clear : NSColor(white: 0.02, alpha: 1.0)
    window.hasShadow = !isPreview
    // Background drag only makes sense for the borderless preview — apps
    // and surfaces have a real titlebar.
    window.isMovableByWindowBackground = isPreview
    if isPreview {
      // Real macOS widgets and Stickies live at the desktop layer: below
      // every app, above the wallpaper, visible on every Space because
      // every Space shares the desktop. macOS has no public API to
      // assign an NSWindow to a specific Mission Control Space; the
      // desktop-window level is the only way to get "visible wherever
      // the user is" without flooding every Space with the widget.
      window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
      window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
    } else {
      // Surfaces and apps behave like normal Mac apps — they have
      // titlebars, traffic lights, participate in Mission Control,
      // appear in Cmd-Tab, can be minimized/zoomed.
      window.level = .normal
      window.collectionBehavior = [.managed]
    }
    window.tabbingMode = .disallowed
    window.titlebarAppearsTransparent = isPreview
    window.title = spec.title ?? "BOR Surface"

    let config = WKWebViewConfiguration()
    config.preferences.javaScriptCanOpenWindowsAutomatically = false

    // Bridge polyfill — installed at document-start so widget HTML keeps
    // its existing `parent.postMessage(...)` pattern but ends up calling
    // our native handler instead.
    if let polyfillURL = Bundle.module.url(forResource: "BridgePolyfill", withExtension: "js"),
       let polyfill = try? String(contentsOf: polyfillURL, encoding: .utf8) {
      let userScript = WKUserScript(
        source: polyfill,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      )
      config.userContentController.addUserScript(userScript)
    }

    // Phase 3: register the bridge. Each WKWebView gets its own message
    // handler scoped to this surfaceId so cross-widget state can't leak.
    config.userContentController.add(bridge, name: WidgetBridge.messageName)

    let draggable = DraggableWebView(frame: .zero, configuration: config)
    // Only the borderless preview tile gets background-drag + tap-to-
    // open. Surfaces and apps have real titlebars; drag goes through
    // the titlebar, and there's no "expand" semantic since they're
    // already the full-size view.
    draggable.allowBackgroundDrag = isPreview
    self.webView = draggable
    webView.allowsLinkPreview = false
    // Transparent backing only for the preview — surfaces and apps use
    // the window's solid backgroundColor for proper Mac chrome.
    if isPreview {
      webView.setValue(false, forKey: "drawsBackground")
    }

    super.init()

    if isPreview {
      let id = spec.surfaceId
      draggable.onTap = { [weak self] in
        self?.onSurfaceClickRequested?(id)
      }
    }

    bridge.stateChangeObserver = self

    window.delegate = self
    window.contentView = webView
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.load(URLRequest(url: spec.url))
  }

  var currentBounds: CGRect {
    window.frame
  }

  func show() {
    window.makeKeyAndOrderFront(nil)
  }

  func close() {
    window.close()
  }

  func bringToFront() {
    window.makeKeyAndOrderFront(nil)
  }

  func setBounds(_ rect: CGRect) {
    window.setFrame(rect, display: true, animate: false)
  }

  func reload(ignoreCache: Bool = false) {
    if ignoreCache {
      webView.reloadFromOrigin()
    } else {
      webView.reload()
    }
  }

  // MARK: NSWindowDelegate
  func windowWillClose(_: Notification) {
    onClose()
  }

  /// Fired by the bridge after a successful state-set. Hook for Phase 3
  /// follow-up (SSE `surface.state_changed` back to Electron so other
  /// open surfaces of the same widget can reload).
  func didMutateState() {
    onStateChanged?(spec.surfaceId)
  }

  // MARK: Sensible defaults
  private static func defaultBounds(for spec: WindowSpec) -> CGRect {
    let screen = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 0, width: 1440, height: 900)
    let size: CGSize = spec.kind == "app"
      ? CGSize(width: 1040, height: 740)
      : CGSize(width: 420, height: 188)
    let x = screen.maxX - size.width - 28
    let y = screen.maxY - size.height - 28
    return CGRect(origin: CGPoint(x: x, y: y), size: size)
  }
}

// MARK: - WKNavigationDelegate / WKUIDelegate
extension WidgetWindowController: WKNavigationDelegate, WKUIDelegate {
  /// External link clicks open in the user's default browser instead of
  /// navigating the widget. Same intent as `setWindowOpenHandler` at
  /// v2/host/main.cjs:983-986.
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    if navigationAction.navigationType == .linkActivated,
       let url = navigationAction.request.url {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }
}
