// RuntimeClient — async HTTP client targeting the BOR Node runtime (:7777).
//
// Every bridge call (state-get, state-set, llm-request, web-search,
// web-fetch, image-generate) goes through here. The runtime endpoints are
// unchanged from today's Electron contract — see server/surface-host.js
// in the BOR repo and surface-preload.cjs:24-73 for the original
// translation layer.
//
// Errors are converted to a {ok:false, error:...} JSON shape that the
// browser-side polyfill turns back into a postMessage reply. We never
// throw out of the bridge — widgets need a deterministic reply for
// every requestId.

import Foundation

struct RuntimeClient {
  let baseURL: URL

  init(baseURL: String) {
    self.baseURL = URL(string: baseURL) ?? URL(string: "http://127.0.0.1:7777")!
  }

  /// Dispatch a single bridge call. Returns the response payload that
  /// will be merged with the requestId and posted back into the WKWebView.
  func bridge(type: String, surfaceId: String, payload: [String: Any]) async -> [String: Any] {
    switch type {
    case "state-get":
      return await get("/api/surfaces/\(escape(surfaceId))/state")
    case "state-set":
      // Wrap the user's state under the optimistic-locking envelope expected
      // by /api/surfaces/:id/state.
      var body: [String: Any] = ["__borStateEnvelope": true]
      if let state = payload["state"] { body["state"] = state }
      if let base = payload["baseRevision"] { body["baseRevision"] = base }
      return await post("/api/surfaces/\(escape(surfaceId))/state", body: body)
    case "llm-request":
      var body: [String: Any] = ["surfaceId": surfaceId]
      if let p = payload["prompt"] { body["prompt"] = p }
      if let s = payload["system"] { body["system"] = s }
      if let i = payload["images"] { body["images"] = i }
      return await post("/api/surface-llm", body: body)
    case "web-search":
      var body: [String: Any] = ["surfaceId": surfaceId]
      if let q = payload["query"] { body["query"] = q }
      if let l = payload["limit"] { body["limit"] = l }
      return await post("/api/surface-search", body: body)
    case "web-fetch":
      var body: [String: Any] = ["surfaceId": surfaceId]
      if let u = payload["url"] { body["url"] = u }
      return await post("/api/surface-fetch", body: body)
    case "image-generate":
      var body: [String: Any] = ["surfaceId": surfaceId]
      if let p = payload["prompt"] { body["prompt"] = p }
      if let s = payload["size"] { body["size"] = s }
      return await post("/api/surface-image-gen", body: body)
    default:
      return ["ok": false, "error": "unsupported bridge type: \(type)"]
    }
  }

  // MARK: - HTTP primitives

  private func get(_ path: String) async -> [String: Any] {
    var req = URLRequest(url: baseURL.appendingPathComponent(path))
    req.httpMethod = "GET"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.timeoutInterval = 60
    return await send(req)
  }

  private func post(_ path: String, body: [String: Any]) async -> [String: Any] {
    var req = URLRequest(url: baseURL.appendingPathComponent(path))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.timeoutInterval = 120  // LLM calls can be slow; surface-host enforces its own timeouts
    do {
      req.httpBody = try JSONSerialization.data(withJSONObject: body)
    } catch {
      return ["ok": false, "error": "could not serialize bridge body: \(error.localizedDescription)"]
    }
    return await send(req)
  }

  private func send(_ req: URLRequest) async -> [String: Any] {
    do {
      let (data, response) = try await URLSession.shared.data(for: req)
      let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
        // The runtime returns structured errors as JSON ({error, status}).
        // Surface them through to the widget so it can react sanely.
        var err: [String: Any] = ["ok": false, "status": http.statusCode]
        if let parsed { err.merge(parsed) { _, new in new } }
        if err["error"] == nil { err["error"] = "runtime HTTP \(http.statusCode)" }
        return err
      }
      // 2xx — return the runtime payload verbatim with {ok:true} prepended
      // so widgets can branch on a uniform success flag without per-type
      // shape knowledge.
      var ok: [String: Any] = ["ok": true]
      if let parsed { ok.merge(parsed) { _, new in new } }
      return ok
    } catch let err as URLError where err.code == .cancelled {
      return ["ok": false, "error": "request cancelled"]
    } catch {
      return ["ok": false, "error": "network: \(error.localizedDescription)"]
    }
  }

  private func escape(_ id: String) -> String {
    id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
  }
}
