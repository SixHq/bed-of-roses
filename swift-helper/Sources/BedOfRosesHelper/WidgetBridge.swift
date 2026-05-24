// WidgetBridge — WKScriptMessageHandler that translates per-widget
// `parent.postMessage({type, requestId, ...})` calls into BOR runtime
// HTTP requests, then forwards the response back into the WKWebView
// via `window.__borBridgeReply(...)`. One bridge per WKWebView.
//
// Bridge contract (mirrors surface-preload.cjs and server/surface-host.js):
//   state-get      → GET  /api/widgets/:id/state
//   state-set      → POST /api/widgets/:id/state    (with __borStateEnvelope)
//   llm-request    → POST /api/surface-llm
//   web-search     → POST /api/surface-search
//   web-fetch      → POST /api/surface-fetch
//   image-generate → POST /api/surface-image-gen

@preconcurrency import WebKit
import Foundation

@MainActor
final class WidgetBridge: NSObject, WKScriptMessageHandler {
  static let messageName = "borBridge"

  private let surfaceId: String
  private let runtime: RuntimeClient
  /// Updated by WidgetWindowController whenever a state-set returns; lets
  /// the bridge fire SSE `surface.state_changed` to Electron in Phase 3
  /// follow-up wiring. For now the value is plumbed but not yet read by
  /// anything — the SSE channel lands later in this phase.
  weak var stateChangeObserver: WidgetWindowController?

  init(surfaceId: String, runtime: RuntimeClient) {
    self.surfaceId = surfaceId
    self.runtime = runtime
  }

  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let dict = message.body as? [String: Any] else { return }
    guard let requestId = dict["requestId"] as? String else { return }
    guard let type = dict["type"] as? String else {
      reply(to: message.webView, payload: ["requestId": requestId, "ok": false, "error": "missing type"])
      return
    }

    let surfaceId = self.surfaceId
    let runtime = self.runtime
    let webView = message.webView

    Task { [weak self] in
      let response = await runtime.bridge(type: type, surfaceId: surfaceId, payload: dict)
      var merged = response
      merged["requestId"] = requestId
      await MainActor.run {
        self?.reply(to: webView, payload: merged)
        // state-set is the only bridge call that mutates server state we
        // want sibling views to see. The SSE channel back to Electron
        // (Phase 3 follow-up) reuses this signal to reload other windows.
        if type == "state-set", let observer = self?.stateChangeObserver {
          observer.didMutateState()
        }
      }
    }
  }

  /// Forward a JSON-encoded reply into the WKWebView. The polyfill
  /// installed at document-start re-emits it as a `window.message` event
  /// so existing widget code (`window.addEventListener('message', …)`)
  /// matches on `requestId` without any modification.
  private func reply(to webView: WKWebView?, payload: [String: Any]) {
    guard let webView else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else { return }
    let script = "if (window.__borBridgeReply) window.__borBridgeReply(\(json));"
    webView.evaluateJavaScript(script, completionHandler: nil)
  }
}
