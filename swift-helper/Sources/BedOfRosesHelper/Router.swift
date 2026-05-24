// Router — translates parsed HTTP requests into window-registry actions.
// Lives between the byte-level ControlServer (which does HTTP parsing,
// auth, and byte writes) and the WindowRegistry (which owns NSWindows).
// Keeping these separated means HTTP parsing has no AppKit imports and
// window management has no HTTP imports.

import Foundation

struct Router {
  let windowRegistry: WindowRegistry
  let runtimeURL: String

  func handle(_ request: HTTPRequest) -> HTTPResponse {
    switch (request.method, request.path) {
    case ("GET", "/health"):
      return .json(200, ["ok": true, "service": "bedofroses-helper"])
    case ("GET", "/windows"):
      let snapshot = windowRegistry.snapshot().map { info in
        [
          "windowKey": info.windowKey,
          "surfaceId": info.surfaceId,
          "bounds": [
            "x": Int(info.bounds.origin.x),
            "y": Int(info.bounds.origin.y),
            "width": Int(info.bounds.size.width),
            "height": Int(info.bounds.size.height),
          ] as [String: Int],
        ] as [String: Any]
      }
      return .json(200, ["ok": true, "windows": snapshot])
    case ("POST", "/window/open"):
      return handleWindowOpen(request)
    case ("POST", "/window/close"):
      return handleWindowClose(request)
    case ("POST", "/window/bounds"):
      return handleWindowBounds(request)
    case ("POST", "/window/front"):
      return handleWindowFront(request)
    case ("POST", "/window/reload"):
      return handleWindowReload(request)
    case ("POST", "/wallpaper/apply"):
      return handleWallpaperApply(request)
    case ("POST", "/screen/capture"):
      return handleScreenCapture(request)
    default:
      return .json(404, ["ok": false, "error": "no route for \(request.method) \(request.path)"])
    }
  }

  private func handleWallpaperApply(_ request: HTTPRequest) -> HTTPResponse {
    guard let path = (request.jsonBody?["imagePath"] as? String) else {
      return .json(400, ["ok": false, "error": "expected JSON body with {imagePath}"])
    }
    if let err = WallpaperService.apply(imagePath: path) {
      return .json(500, ["ok": false, "error": err])
    }
    return .json(200, ["ok": true])
  }

  private func handleScreenCapture(_ request: HTTPRequest) -> HTTPResponse {
    guard let savePath = (request.jsonBody?["savePath"] as? String) else {
      return .json(400, ["ok": false, "error": "expected JSON body with {savePath}"])
    }
    guard let capture = ScreenCaptureService.captureMainDisplay(to: savePath) else {
      return .json(500, ["ok": false, "error": "screen capture failed — verify Screen Recording permission for BedOfRosesHelper in System Settings → Privacy & Security"])
    }
    return .json(200, [
      "ok": true,
      "path": capture.savedPath,
      "width": capture.width,
      "height": capture.height,
    ])
  }

  /// Resolve the registry key for the window. Electron passes a distinct
  /// `windowKey` for preview vs surface windows (e.g. "<id>::preview"
  /// vs "<id>::surface"). When omitted, default to surfaceId for
  /// backward compatibility with the simple 1:1 case.
  private func resolveWindowKey(_ json: [String: Any]?, fallback surfaceId: String) -> String {
    if let key = json?["windowKey"] as? String, !key.isEmpty { return key }
    return surfaceId
  }

  private func handleWindowOpen(_ request: HTTPRequest) -> HTTPResponse {
    guard let json = request.jsonBody,
          let surfaceId = json["surfaceId"] as? String,
          let urlString = json["url"] as? String,
          let url = URL(string: urlString) else {
      return .json(400, ["ok": false, "error": "expected JSON body with {surfaceId, url}"])
    }
    let kind = (json["kind"] as? String) ?? "widget"
    let title = json["title"] as? String
    let bounds = parseBounds(json["bounds"])
    let windowKey = resolveWindowKey(json, fallback: surfaceId)
    let spec = WindowSpec(
      windowKey: windowKey,
      surfaceId: surfaceId,
      kind: kind,
      url: url,
      bounds: bounds,
      title: title
    )

    let info = windowRegistry.open(spec: spec)
    return .json(200, [
      "ok": true,
      "windowKey": info.windowKey,
      "surfaceId": info.surfaceId,
      "bounds": rectAsDict(info.bounds),
    ])
  }

  private func handleWindowClose(_ request: HTTPRequest) -> HTTPResponse {
    let json = request.jsonBody
    let surfaceId = (json?["surfaceId"] as? String) ?? ""
    let key = resolveWindowKey(json, fallback: surfaceId)
    if key.isEmpty {
      return .json(400, ["ok": false, "error": "expected JSON body with {windowKey} or {surfaceId}"])
    }
    windowRegistry.close(windowKey: key)
    return .json(200, ["ok": true])
  }

  private func handleWindowBounds(_ request: HTTPRequest) -> HTTPResponse {
    guard let json = request.jsonBody,
          let bounds = parseBounds(json["bounds"]) else {
      return .json(400, ["ok": false, "error": "expected JSON body with {windowKey|surfaceId, bounds}"])
    }
    let surfaceId = (json["surfaceId"] as? String) ?? ""
    let key = resolveWindowKey(json, fallback: surfaceId)
    let ok = windowRegistry.setBounds(windowKey: key, bounds: bounds)
    return .json(ok ? 200 : 404, ["ok": ok])
  }

  private func handleWindowFront(_ request: HTTPRequest) -> HTTPResponse {
    let json = request.jsonBody
    let surfaceId = (json?["surfaceId"] as? String) ?? ""
    let key = resolveWindowKey(json, fallback: surfaceId)
    if key.isEmpty {
      return .json(400, ["ok": false, "error": "expected JSON body with {windowKey} or {surfaceId}"])
    }
    let ok = windowRegistry.bringToFront(windowKey: key)
    return .json(ok ? 200 : 404, ["ok": ok])
  }

  private func handleWindowReload(_ request: HTTPRequest) -> HTTPResponse {
    let json = request.jsonBody
    let surfaceId = (json?["surfaceId"] as? String) ?? ""
    let key = resolveWindowKey(json, fallback: surfaceId)
    if key.isEmpty {
      return .json(400, ["ok": false, "error": "expected JSON body with {windowKey} or {surfaceId}"])
    }
    let ignoreCache = (json?["ignoreCache"] as? Bool) ?? false
    let ok = windowRegistry.reload(windowKey: key, ignoreCache: ignoreCache)
    return .json(ok ? 200 : 404, ["ok": ok])
  }

  private func parseBounds(_ raw: Any?) -> CGRect? {
    guard let dict = raw as? [String: Any] else { return nil }
    let x = (dict["x"] as? Double) ?? Double((dict["x"] as? Int) ?? 0)
    let y = (dict["y"] as? Double) ?? Double((dict["y"] as? Int) ?? 0)
    let w = (dict["width"] as? Double) ?? Double((dict["width"] as? Int) ?? 0)
    let h = (dict["height"] as? Double) ?? Double((dict["height"] as? Int) ?? 0)
    if w <= 0 || h <= 0 { return nil }
    return CGRect(x: x, y: y, width: w, height: h)
  }

  private func rectAsDict(_ rect: CGRect) -> [String: Int] {
    [
      "x": Int(rect.origin.x),
      "y": Int(rect.origin.y),
      "width": Int(rect.size.width),
      "height": Int(rect.size.height),
    ]
  }
}
