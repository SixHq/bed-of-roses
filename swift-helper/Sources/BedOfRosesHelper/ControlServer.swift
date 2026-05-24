// ControlServer — minimal HTTP/1.1 server on 127.0.0.1:<port>. Network
// framework (NWListener + NWConnection). No third-party HTTP dependency.
//
// Auth: every request must carry `x-bor-host-token: <uuid>` matching the
// token the launcher gave us at startup. Anything else returns 401 and
// closes the connection. Same posture the existing host-control server
// uses in v2/host/main.cjs:282-315.
//
// Connection lifecycle: each NWConnection is read until a full request
// (headers + Content-Length body) lands. Response is written, connection
// is closed. No keep-alive. The traffic volume is so low (a few requests
// per chat turn) that the optimization is not worth the bug surface.

import Foundation
import Network

final class ControlServer {
  private let port: UInt16
  private let token: String
  private let router: Router
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "bor.helper.controlserver")

  init(port: UInt16, token: String, router: Router) {
    self.port = port
    self.token = token
    self.router = router
  }

  func start() throws {
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host("127.0.0.1"),
      port: NWEndpoint.Port(rawValue: port)!
    )
    let listener = try NWListener(using: params)
    listener.newConnectionHandler = { [weak self] connection in
      self?.handle(connection: connection)
    }
    listener.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        HelperLog.info("Control server listening on 127.0.0.1:\(self?.port ?? 0)")
      case .failed(let err):
        HelperLog.error("Control server failed: \(err)")
      case .cancelled:
        HelperLog.info("Control server cancelled.")
      default:
        break
      }
    }
    listener.start(queue: queue)
    self.listener = listener
  }

  func stop() {
    listener?.cancel()
    listener = nil
  }

  private func handle(connection: NWConnection) {
    connection.start(queue: queue)
    receive(connection: connection, buffer: Data())
  }

  /// Pulls TCP chunks until we have a complete HTTP request (headers
  /// terminated by `\r\n\r\n`, optional body up to Content-Length).
  private func receive(connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
      guard let self else {
        connection.cancel()
        return
      }
      var buffer = buffer
      if let data { buffer.append(data) }

      if let err = error {
        HelperLog.warn("receive error: \(err)")
        connection.cancel()
        return
      }

      switch HTTPRequest.tryParse(buffer: buffer) {
      case .needMore:
        if isComplete {
          HelperLog.warn("connection closed mid-request")
          connection.cancel()
          return
        }
        self.receive(connection: connection, buffer: buffer)
      case .invalid(let reason):
        HelperLog.warn("bad request: \(reason)")
        self.write(.json(400, ["ok": false, "error": reason]), to: connection, closeAfter: true)
      case .ok(let request):
        let response: HTTPResponse
        if !self.isAuthorized(request) {
          response = .json(401, ["ok": false, "error": "missing or invalid x-bor-host-token"])
        } else {
          response = self.router.handle(request)
        }
        self.write(response, to: connection, closeAfter: true)
      }
    }
  }

  private func isAuthorized(_ request: HTTPRequest) -> Bool {
    guard !token.isEmpty else { return false }
    return request.headers["x-bor-host-token"] == token
  }

  private func write(_ response: HTTPResponse, to connection: NWConnection, closeAfter: Bool) {
    let bytes = response.serialize()
    connection.send(content: bytes, completion: .contentProcessed { _ in
      if closeAfter { connection.cancel() }
    })
  }
}
