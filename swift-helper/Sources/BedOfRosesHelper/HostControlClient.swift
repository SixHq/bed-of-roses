// HostControlClient — minimal HTTP client to Electron's host-control server
// (defaults to 127.0.0.1:7797). Used by the helper to call back into
// Electron for things that only Electron can sequence: opening a full
// surface when the user clicks a widget preview, hiding/showing the
// presence during screen capture, etc.
//
// All requests carry the host-control token Electron generated at boot
// and passed to the helper via argv/env. Failure is non-fatal — the
// helper is allowed to operate "headless" if Electron isn't there.

import Foundation

struct HostControlClient {
  let baseURL: String
  let token: String

  /// Trigger Electron's openSurface(surfaceId) — opens the full widget /
  /// app window for `surfaceId`. Returns true on 2xx, false otherwise.
  @discardableResult
  func requestOpenSurface(surfaceId: String) async -> Bool {
    guard !baseURL.isEmpty, !token.isEmpty else { return false }
    guard let url = URL(string: "\(baseURL)/api/host/open-surface") else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue(token, forHTTPHeaderField: "x-bor-host-token")
    req.timeoutInterval = 3
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["surfaceId": surfaceId])
    do {
      let (_, response) = try await URLSession.shared.data(for: req)
      if let http = response as? HTTPURLResponse, http.statusCode < 300 {
        return true
      }
      return false
    } catch {
      HelperLog.warn("host-control open-surface failed: \(error.localizedDescription)")
      return false
    }
  }
}
