// Minimal HTTP/1.1 request parser + response serializer for the control
// server. Deliberately conservative: only what the launcher actually sends.
//
// - Request line + headers parsed up to `\r\n\r\n`.
// - Body capped at Content-Length, max 1 MiB.
// - No chunked transfer, no keep-alive, no compression. Local-only traffic.

import Foundation

struct HTTPRequest {
  let method: String
  let path: String
  let headers: [String: String]   // lowercase keys
  let body: Data

  var jsonBody: [String: Any]? {
    guard !body.isEmpty,
          let json = try? JSONSerialization.jsonObject(with: body),
          let dict = json as? [String: Any] else { return nil }
    return dict
  }

  enum ParseResult {
    case needMore
    case invalid(String)
    case ok(HTTPRequest)
  }

  static func tryParse(buffer: Data) -> ParseResult {
    guard let headerEnd = buffer.range(of: Data("\r\n\r\n".utf8)) else {
      return .needMore
    }
    let headerData = buffer.subdata(in: 0..<headerEnd.lowerBound)
    guard let headerString = String(data: headerData, encoding: .utf8) else {
      return .invalid("non-UTF8 headers")
    }
    let lines = headerString.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return .invalid("empty header block") }
    let parts = requestLine.components(separatedBy: " ")
    guard parts.count >= 2 else { return .invalid("malformed request line: \(requestLine)") }
    let method = parts[0].uppercased()
    let rawPath = parts[1]
    let path = rawPath.components(separatedBy: "?").first ?? rawPath

    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else { continue }
      let name = String(line[..<colon]).lowercased().trimmingCharacters(in: .whitespaces)
      let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
      headers[name] = value
    }

    let contentLength = Int(headers["content-length"] ?? "0") ?? 0
    if contentLength < 0 || contentLength > 1_048_576 {
      return .invalid("Content-Length out of range")
    }
    let bodyStart = headerEnd.upperBound
    let available = buffer.count - bodyStart
    if available < contentLength {
      return .needMore
    }
    let body = contentLength > 0
      ? buffer.subdata(in: bodyStart..<(bodyStart + contentLength))
      : Data()
    return .ok(HTTPRequest(method: method, path: path, headers: headers, body: body))
  }
}

struct HTTPResponse {
  let status: Int
  let headers: [String: String]
  let body: Data

  static func json(_ status: Int, _ payload: [String: Any]) -> HTTPResponse {
    let body = (try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])) ?? Data("{}".utf8)
    return HTTPResponse(
      status: status,
      headers: [
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      ],
      body: body
    )
  }

  static func text(_ status: Int, _ body: String) -> HTTPResponse {
    HTTPResponse(
      status: status,
      headers: ["Content-Type": "text/plain; charset=utf-8"],
      body: Data(body.utf8)
    )
  }

  func serialize() -> Data {
    var out = Data()
    let statusText = HTTPResponse.statusText(status)
    out.append(Data("HTTP/1.1 \(status) \(statusText)\r\n".utf8))
    var headers = self.headers
    headers["Content-Length"] = String(body.count)
    headers["Connection"] = "close"
    for (k, v) in headers {
      out.append(Data("\(k): \(v)\r\n".utf8))
    }
    out.append(Data("\r\n".utf8))
    out.append(body)
    return out
  }

  private static func statusText(_ code: Int) -> String {
    switch code {
    case 200: return "OK"
    case 201: return "Created"
    case 204: return "No Content"
    case 400: return "Bad Request"
    case 401: return "Unauthorized"
    case 404: return "Not Found"
    case 500: return "Internal Server Error"
    default: return "Status"
    }
  }
}
