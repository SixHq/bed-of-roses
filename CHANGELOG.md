# Changelog

All notable changes to Bed of Roses are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-14

Initial public release.

### Added

- **v2 Electron Mac host** (`v2/host/`) — a frameless, always-on-top draggable
  presence that lives above the real macOS desktop, with a collapsed orb,
  expanded prompt, thought bubble, and tool-call visualization.
- **Multi-presence support** — run N isolated presences, each with its own
  runtime, data root, port, config, memory, and scheduled tasks.
- **Generated apps & widgets** — chat turns produce native windows backed by
  sandboxed iframes (`os-data/widgets/<id>/`), created and updated through an
  XML/native tool protocol.
- **Multi-provider LLM runtime** — first-class adapters for Anthropic, OpenAI,
  Gemini, and OpenAI-compatible endpoints, with a native tool-calling harness
  (`server/llm/`) as the default and a legacy XML harness behind
  `BOR_LEGACY_LLM=1`.
- **Browser automation** — Playwright MCP browser service plus a user-facing
  Browser app.
- **`bor` CLI** — `bor onboard`, `bor create [name]`, `bor list`, and
  `bor delete <presence_id>`.
- **Classic browser shell** (`shell/` + `server/`) served at
  `http://localhost:7777`, used primarily for onboarding.
- **Security model** — server-side validator for AI-generated HTML and shell
  commands, sandboxed widget iframes, and an append-only audit log.

[Unreleased]: https://github.com/SixHq/bed-of-roses/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SixHq/bed-of-roses/releases/tag/v0.1.0
