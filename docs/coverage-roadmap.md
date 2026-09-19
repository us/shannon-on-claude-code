# Coverage and Roadmap

Shannon follows proof-by-exploitation: findings that cannot be demonstrated
with a working proof of concept are not reported in exploit mode. This kills
scanner noise but means Shannon never aims to list every possible issue.

## Current native coverage

- Injection (SQLi, command, LFI, SSTI, path traversal, deserialization)
- Cross-Site Scripting (reflected, stored, DOM-based)
- Broken Authentication (login flows, session/token handling, MFA)
- Broken Authorization (IDOR, privilege escalation, access control)
- SSRF (URL parameters, webhooks, cloud metadata)
- Miscellaneous (CSRF, open redirect, clickjacking, info disclosure,
  sensitive logging, session lifetime, insecure randomness, races)

Reporting philosophy: severity follows consequence (see
`.claude/shared/severity-reasoning.md`), titles name the defect (see
`.claude/shared/reporting-standards.md`), every finding maps to OWASP Top 10 2025.

## Explicitly out of scope

Software composition (dependencies), secret scanning, cloud/IaC posture,
cryptographic reviews without an exploit path, business-logic abuse without
demonstrated impact, and any finding that cannot be exercised through the
running application's external interface.

## Roadmap

Follows upstream Shannon (KeygraphHQ/shannon): deeper SAST-to-exploit joins,
broader scanner coverage, and CI severity gates live there first. Native ports
what runs without Temporal/Docker: the 6th misc lane, reconcile dedupe,
SAST-lite, SARIF/JSON outputs, and auth validation shipped in this sync.
Upstream-only items (PDF reports, CI Action, full Capella SAST, managed
platform features) are not planned for native.
