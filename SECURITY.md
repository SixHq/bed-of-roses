# Security Policy

Bed of Roses (BOR) runs an LLM runtime that handles user-supplied API keys,
executes shell commands, and renders AI-generated HTML on the user's machine.
We take its security posture seriously and appreciate responsible disclosure.

## Supported versions

BOR is pre-1.0 and ships from `main`. Security fixes are made against the
latest release line only.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately to **security@sixhq.example**.
<!-- MAINTAINER: replace security@sixhq.example with a real monitored address
     (or enable GitHub Private Vulnerability Reporting for this repo) before
     publishing. -->

Alternatively, if enabled for this repository, use GitHub's
**Private Vulnerability Reporting** (Security tab → "Report a vulnerability").

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected version / commit, your macOS version, and Node version.
- Any suggested remediation.

We aim to acknowledge reports within a few business days and will keep you
updated as we investigate. Please give us reasonable time to ship a fix before
any public disclosure. We're happy to credit reporters who wish to be named.

## Security model

BOR is **local-first**: the runtime, your data, and your API keys live on your
own machine. Key defenses:

- **Sandboxed surfaces.** All AI-generated apps and widgets render inside
  sandboxed iframes with no DOM access outside their own frame. Every I/O call
  goes through `parent.postMessage` to the server and is validated there.
- **Server-side validator.** `server/validator.js` performs static checks on
  AI-generated widget/app HTML and shell commands. It blocks `eval`,
  `Function`, `parent.*` (except `parent.postMessage`), `localStorage`,
  external `<script src>`, heredocs, and similar escape hatches — as a
  belt-and-suspenders layer alongside the iframe sandbox.
- **Audit log.** State-mutating operations are recorded to an append-only audit
  log (`os-data/logs/audit.jsonl`), so AI actions are traceable.
- **Command execution guards.** Shell execution is bounded (timeouts, output
  caps) and the validator refuses host-restart and other dangerous commands.

### API key storage

API keys are currently stored **locally** in `os-data/config.json` (and
per-presence config). A migration to the macOS Keychain is planned. Until then,
treat that file as sensitive: it is gitignored, but do not share it, commit it,
or include it in bug reports or screenshots.

## Scope

In scope:

- The BOR runtime (`server/`), the Electron host (`host/`), the classic
  shell (`shell/`), and the `bor` CLI (`bin/`).
- Sandbox escapes, validator bypasses, audit-log evasion, and local privilege
  or data-exfiltration issues.

Out of scope:

- Vulnerabilities in third-party LLM providers or their APIs.
- Issues requiring a pre-compromised machine or physical access.
- The behavior of arbitrary user-authored skills, MCP servers, or shell
  commands the user explicitly runs.
- Social-engineering and prompt-injection of the user's own configured model
  beyond what BOR's validator and sandbox are designed to contain (though we
  welcome reports that improve those defenses).
