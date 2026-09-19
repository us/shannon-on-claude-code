# Configuration

Shannon native runs from `/pentest <target-url>` with an interactive pre-flight.
A config file supplements the interactive answers (config wins on conflicts).

## Config file

Copy `shannon-config.example.yaml` to `shannon-config.yaml`, edit, pass with:

```
/pentest https://target.com --config shannon-config.yaml
```

Fields (mirrors upstream Shannon semantics, string flags stay quoted):

| Block | Keys |
|---|---|
| `description` | Free text, target/deployment context (max 500 chars) |
| `exploit` | `"true"` (default) or `"false"` (analysis-only: no live payloads) |
| `rules_of_engagement` | Free text rendered into every agent (max 1000 chars) |
| `authentication` | `login_type` (native: form/sso; upstream schema also allows api/basic), `login_url`, `credentials` (username, password, totp_secret, optional email_login), `login_flow` steps with `$username/$password/$totp/$email_*` placeholders, `success_condition` (url_contains/url_equals_exactly/element_present/text_contains). Upstream `login:` alias is deprecated and ignored here. |
| `rules.avoid` / `rules.focus` | Typed rules: `url_path`, `subdomain`, `domain`, `method`, `header`, `parameter`, `code_path` (repo-relative globs like `test/**`); each rule description max 200 chars |
| `report` | `min_severity` (both modes), `min_confidence` (analysis-only only; ignored with a warning in exploit mode), `sarif: "true"/"false"` (default on for exploit runs, ignored when exploit is false), `guidance` free text |

## AI providers and models

Agent models are pinned in `.claude/agents/` frontmatter: opus for pre-recon/sast,
sonnet for recon/vuln/exploit/reconcile/validate-auth, haiku for report. This matches upstream's
practice of pinning capable models per stage.

To run a scan under a different provider or key (BYOK, same as upstream):

- Claude / Anthropic: default, uses the running Claude Code session.
- Any other provider: run the pipeline from a session authenticated to that
  provider; no Shannon-side proxying exists, prompts go straight to the model.
- Local models (Ollama, vLLM, LM Studio): supported only if they follow
  multi-step tool-use instructions reliably; frontier models give stronger
  pentests. Prefer CI or a workstation run over the laptop for long scans.

Complete your provider's cyber-safety verification for security testing before
the first scan; safeguard interruptions mid-run waste the whole pipeline.

## Resume

Deliverables ARE the checkpoints. Re-run the same command to resume:

```
/pentest https://same-target.example.com
```

- A phase is skipped only when its deliverable exists, `scan_meta.json`
  matches the canonical target URL, and queue JSON parses with a
  `vulnerabilities` array.
- URL mismatch never resumes another scan's outputs.
- `--fresh` forces a clean rerun (never `rm -rf`: that destroys `audit-logs/`,
  the audit trail).

`workspace/` is gitignored scratch space: agents record false-positive notes
(`workspace/*_false_positives.md`) there. It carries no resume state (that is
`deliverables/`) and is safe to delete; `audit-logs/` is not.

## Report formats

- `comprehensive_security_assessment_report.md`: executive summary plus cleaned evidence.
- `security_assessment_report.json`: machine-readable findings.
- `security_assessment_report.sarif`: SARIF 2.1.0 (default on for exploit runs,
  `report.sarif: "false"` opts out). Levels: critical/high error, medium
  warning, else note. Rules carry the OWASP Top 10 2025 taxonomy (results reference categories like A05:2025).
- A scan is marked `partial` when SAST-lite failed in white-box mode or a
  report output failed to write (honest scope note, not a failure).
- PDF reports are upstream-only (Typst toolchain); native emits md/json/sarif.
