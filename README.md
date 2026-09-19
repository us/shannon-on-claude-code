# Shannon — Claude Code Native
<!-- Copyright (C) 2025 Keygraph, Inc. (original Shannon) -->
<!-- This project is a derivative of Shannon (https://github.com/KeygraphHQ/shannon) -->
<!-- Licensed under GNU Affero General Public License v3.0 -->

Shannon's penetration testing pipeline (5 phases + 3 conditional sub-phases) running natively in Claude Code.
No Temporal, no Docker, no worker processes. Just open `claude` and run `/pentest <url>`.

## Quick Start

```bash
cd /Users/us/coding/shannon-on-claude-code   # or wherever you cloned this repo
claude
/pentest https://target.com
```

## OpenCode usage (tested 2026-09-19)

The repo also runs under opencode (`opencode run`), verified end-to-end on a
local fixture (pre-recon + recon + vuln-xss + vuln-misc, analysis-only,
black-box: all `save_deliverable` calls returned `success`/`validated true`):

```bash
cd /path/to/this/repo
opencode run --dir . -m <provider/model> "Load the pentest skill and run /pentest https://target.com"
```

Opencode-specific files (all committed with the repo):

- `opencode.json` — MCP servers (`shannon-tools`). Opencode does not read
  `.mcp.json`, so this file is required.
- `.opencode/agents/*.md` — the 18 subagents. Opencode does not read
  `.claude/agents/`, so these generated copies are required. Regenerate after
  editing any Claude agent:
  ```bash
  python3 - <<'EOF'
  import re, pathlib
  dst = pathlib.Path('.opencode/agents'); dst.mkdir(parents=True, exist_ok=True)
  for f in sorted(pathlib.Path('.claude/agents').glob('*.md')):
      m = re.match(r'^---\n(.*?)\n---\n(.*)$', f.read_text(), re.S)
      desc = re.search(r'^description:\s*(.*)$', m.group(1), re.M).group(1).strip()
      (dst / f.name).write_text(f"---\ndescription: {desc}\nmode: subagent\nsteps: 100\n---\n" + m.group(2))
  EOF
  ```
- `.claude/skills/pentest/SKILL.md` is auto-discovered by opencode (no copy needed).

Caveats:

- Run `cd native && npm install`. Do NOT symlink `node_modules` into
  `native/`: opencode's directory scan follows the symlink and hangs startup.
- Agent models are unpinned in `.opencode/agents/` (opencode subagents inherit
  the primary session model); the skill's scope questions use opencode's
  `question` tool, or pass fixed scope to skip them in `opencode run`.
- `models.dev` is unreachable from some networks; pass `-m` explicitly.

With source code (white-box):
```bash
# Clone or symlink the target repo here
git clone https://github.com/org/repo.git .
# or
ln -s /path/to/repo/* .

claude
/pentest https://target.com
```

---

## Requirements

### Required

| Tool | Install | Purpose |
|------|---------|---------|
| `claude` (Claude Code) | [claude.ai/code](https://claude.ai/code) | Run the pipeline |
| `node` ≥ 18 | `apt install nodejs` | MCP server |
| `npm` | `apt install npm` | MCP dependencies |
| `curl` | Usually pre-installed | HTTP testing |

### MCP Dependencies

```bash
cd native && npm install
```

### Optional (used if available)

| Tool | Install | Purpose |
|------|---------|---------|
| `nmap` | `apt install nmap` | Port scanning |
| `subfinder` | [github.com/projectdiscovery/subfinder](https://github.com/projectdiscovery/subfinder/releases) | Subdomain discovery |
| `whatweb` | `apt install whatweb` | Technology fingerprinting |
| `sqlmap` | `apt install sqlmap` | SQL injection automation |
| `oathtool` | `apt install oathtool` | TOTP code generation (for MFA) |
| Playwright | `npx playwright install chromium` | Browser automation (MCP installs automatically) |

> If optional tools are missing, the pipeline continues and skips those steps.

---

## Pipeline — 5 phases + 3 conditional sub-phases (synced with upstream Shannon 3.0)

```
Phase 1:  Pre-Recon   → pre_recon_deliverable.md
            ↓
Phase 1b: SAST-lite (white-box only, parallel with Recon)
          → sast_deliverable.md + sast_findings.json
            ↓
Phase 2:  Recon       → recon_deliverable.md
            ↓
Phase 0b: Validate-auth (conditional, login scans only, runs before Phase 1)
          → auth_validation.json
            ↓
Phase 3:  Vuln (×6 parallel)
  ├─ injection  → injection_analysis_deliverable.md + injection_exploitation_queue.json
  ├─ xss        → xss_analysis_deliverable.md + xss_exploitation_queue.json
  ├─ auth       → auth_analysis_deliverable.md + auth_exploitation_queue.json
  ├─ authz      → authz_analysis_deliverable.md + authz_exploitation_queue.json
  ├─ ssrf       → ssrf_analysis_deliverable.md + ssrf_exploitation_queue.json
  └─ misc       → miscellaneous_analysis_deliverable.md + miscellaneous_exploitation_queue.json
            ↓
Phase 3b: Reconcile (merge + dedupe, split-over-merge)
          → reconciled_exploitation_queue.json
            ↓
Phase 4:  Exploit (conditional, ×6 parallel)
  └─ Only runs for non-empty queues with externally exploitable findings
  └─ Prefers the reconciled queue, falls back to per-class queues
            ↓
Phase 5:  Report      → comprehensive_security_assessment_report.md
                       + security_assessment_report.json + security_assessment_report.sarif
```

Resume: re-run the same `/pentest <target>`; phases with valid deliverables are
skipped (URL-bound via `scan_meta.json`). `--fresh` forces a clean rerun.

**Model assignments:**
- Pre-recon/SAST: `claude-opus-4` (deep code analysis)
- Recon/Vuln/Exploit/Reconcile/Validate-auth: `claude-sonnet-4` (15 agents: 6 vuln + 6 exploit lanes, recon, reconcile, validate-auth)
- Report: `claude-haiku-4` (executive summary writing)

**Conventions:**
- Scope rules are typed: `url_path`, `subdomain`, `domain`, `method`, `header`, `parameter`, `code_path` (`code_path` values are repo-relative file paths or globs).
- Findings use stable report IDs `[TYPE]-[NUMBER]` (e.g. INJ-01, AUTH-03, MISC-01), each in its own class namespace.
- Every finding maps to an OWASP Top 10 2025 category.

---

## Modes

### Black-Box (URL only)
No source code, just a URL. Uses:
- nmap, subfinder, whatweb (external scanning)
- Playwright browser (frontend exploration, JS analysis)
- curl (API endpoint testing)

### White-Box (URL + Source Code)
Project files present in this directory. Additionally:
- Source code analysis (taint analysis, code review)
- Route/controller mapping
- Auth/authz guard analysis

---

## Output Files

All files are saved under `deliverables/`:

```
deliverables/
├── scan_meta.json                        # Scan binding (target URL, resume guard)
├── pre_recon_deliverable.md           # Pre-recon findings
├── sast_deliverable.md + sast_findings.json  # SAST-lite (white-box only)
├── recon_deliverable.md                  # Attack surface map
├── auth_validation.json                  # Credential check (login scans only)
├── *_analysis_deliverable.md × 6        # Vulnerability analysis reports
├── *_exploitation_queue.json × 6        # Exploit target lists
├── reconciled_exploitation_queue.json    # Merged + deduped queue
├── *_exploitation_evidence.md × 6       # Exploitation evidence
├── comprehensive_security_assessment_report.md  # Final report
├── security_assessment_report.json       # Machine-readable findings
└── security_assessment_report.sarif      # SARIF 2.1.0
```

Audit log:
```
audit-logs/session.jsonl                  # Record of every tool call
```

---

## MCP Tools

### shannon-tools (`native/mcp-stdio-wrapper.mjs`)

| Tool | Description |
|------|-------------|
| `save_deliverable` | Saves a deliverable file to `deliverables/` with validation |
| `generate_totp` | Generates a TOTP code from a Base32 secret (for MFA-protected sites) |

The `SHANNON_TARGET_DIR` env var sets the target directory (default: `.`).

### playwright
Headless Chromium browser for browser interactions, form filling, and JS execution.

---

## Configuration

### Sites Requiring Login

Pass login details directly to the `/pentest` skill:

```
/pentest https://target.com
Login URL: https://target.com/login
Username: testuser@example.com
Password: testpass123
Login type: form
```

With MFA/TOTP:
```
TOTP Secret: JBSWY3DPEHPK3PXP
```

### Scope Restrictions

```
/pentest https://target.com
Rules to Avoid: /admin, /billing, payment endpoints
Focus: authentication, authorization
```

File-based equivalent: copy `shannon-config.example.yaml` to `shannon-config.yaml` (typed `rules:`, `authentication:`, `rules_of_engagement:`) and pass it with the command.

---

## File Structure

```
shannon-on-claude-code/
├── README.md
├── shannon-config.example.yaml        # Config file template (auth, rules, report)
├── docs/
│   ├── configuration.md               # Config, providers, resume, report formats
│   ├── safety.md                      # Authorized use, non-prod, limitations
│   └── coverage-roadmap.md            # Coverage, out-of-scope, roadmap
├── plans/
│   └── 2026-09-19-shannon-3.0-sync.md # This sync's plan + review record
├── .mcp.json                        # Playwright + Shannon MCP configuration
├── .claude/
│   ├── settings.json                # Tool permissions + audit hook
│   ├── shared/                      # Shared prompt partials (ported upstream)
│   │   ├── severity-reasoning.md
│   │   ├── reporting-standards.md
│   │   ├── exploit-scope.md
│   │   └── credentials-hygiene.md
│   ├── agents/                      # 18 agent definitions
│   │   ├── pre-recon.md    (opus)
│   │   ├── sast.md         (opus, white-box only)
│   │   ├── recon.md        (sonnet)
│   │   ├── validate-auth.md (sonnet, conditional)
│   │   ├── vuln-auth.md    (sonnet)
│   │   ├── vuln-authz.md   (sonnet)
│   │   ├── vuln-injection.md (sonnet)
│   │   ├── vuln-xss.md     (sonnet)
│   │   ├── vuln-ssrf.md    (sonnet)
│   │   ├── vuln-misc.md    (sonnet, native extension)
│   │   ├── reconcile.md    (sonnet)
│   │   ├── exploit-auth.md (sonnet)
│   │   ├── exploit-authz.md (sonnet)
│   │   ├── exploit-injection.md (sonnet)
│   │   ├── exploit-xss.md  (sonnet)
│   │   ├── exploit-ssrf.md (sonnet)
│   │   ├── exploit-misc.md (sonnet)
│   │   └── report.md       (haiku)
│   ├── skills/
│   │   └── pentest/SKILL.md         # /pentest orchestrator skill
│   └── hooks/
│       └── audit-logger.sh          # Tool call audit logging
└── native/
    ├── mcp-stdio-wrapper.mjs        # MCP server (save_deliverable, generate_totp)
    ├── package.json
    └── node_modules/
```

---

## Differences from Shannon (Original)

| Feature | Shannon (Temporal) | Claude Code Native |
|---------|-------------------|-------------------|
| Orchestration | Temporal workflow | Skill prompt |
| Parallel agents | `Promise.allSettled` | Agent tool parallel calls |
| Crash recovery | Temporal durable execution | Resume from deliverables |
| Resume/workspace | Git checkpoint + session | `scan_meta.json` URL-bound skip + `--fresh` |
| Retry | Temporal retry policy (3x) | None (re-run resumes) |
| Finding reconciliation | Task-formation + dedupe | `reconcile` agent (split-over-merge) |
| Static analysis | 10-stage Capella SAST | SAST-lite agent (white-box only) |
| Auth validation | validate-authentication | `validate-auth` agent (conditional) |
| Vuln classes | 5 fixed | 6 (adds native `misc` lane) |
| Reports | PDF + Markdown + SARIF | Markdown + JSON + SARIF 2.1.0 (no PDF) |
| Playwright | 5 isolated instances | Single shared instance |
| Setup | Docker + npm build | npm install only |

---

## Troubleshooting

**`claude` command not found:**
```bash
which claude || echo "Claude Code is not installed"
```

**MCP server won't start:**
```bash
cd native && node mcp-stdio-wrapper.mjs
# If errors: npm install
```

**Playwright not working:**
```bash
npx playwright install chromium
```

**Pipeline stopped mid-run:**
```bash
# Resume where it left off (deliverables are checkpoints)
claude
/pentest https://target.com
# Or force a clean rerun
/pentest https://target.com --fresh
```

**nmap/subfinder not found:**
The pipeline still runs — those scans are simply skipped. All external tools are optional.

---

## License

This project is a derivative of [Shannon](https://github.com/KeygraphHQ/shannon) and is licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](./LICENSE) for the full text.

**Original copyright:** Copyright (C) 2025 Keygraph, Inc.

**Modifications made in this derivative:**
- Removed Temporal workflow orchestration layer
- Removed Docker and worker process infrastructure
- Adapted all 13 agent prompts to Claude Code native agent format (`.claude/agents/`), now 18 with the 3.0 sync additions
- Added `/pentest` skill orchestrator replacing `pentestPipelineWorkflow`
- Replaced in-process MCP server with stdio-compatible wrapper (`native/mcp-stdio-wrapper.mjs`)
- Added black-box mode detection for URL-only operation without source code
- Synced with upstream Shannon 3.0 (Sep 2026): 6th `misc` lane (native extension,
  upstream feeds it from SAST), `reconcile` agent (task-formation + dedupe),
  SAST-lite agent, `validate-auth` preflight, SARIF 2.1.0 + JSON reports,
  typed scope rules, `scan_meta.json` resume, `shannon-config.example.yaml`,
  shared severity/reporting/scope partials, OWASP Top 10 2025 mapping

## Acknowledgements

All penetration testing methodology, prompt engineering, vulnerability analysis frameworks, and agent definitions originate from [Shannon](https://github.com/KeygraphHQ/shannon) by Keygraph, Inc.
