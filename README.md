# Shannon — Claude Code Native
<!-- Copyright (C) 2025 Keygraph, Inc. (original Shannon) -->
<!-- This project is a derivative of Shannon (https://github.com/KeygraphHQ/shannon) -->
<!-- Licensed under GNU Affero General Public License v3.0 -->

Shannon's 5-phase penetration testing pipeline running natively in Claude Code.
No Temporal, no Docker, no worker processes. Just open `claude` and run `/pentest <url>`.

## Quick Start

```bash
cd /Users/us/coding/shannon-on-claude-code   # or wherever you cloned this repo
claude
/pentest https://target.com
```

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

### MCP Dependencies (already installed)

```bash
# native/node_modules/ is already present, no need to reinstall
# To update:
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

## Pipeline — 5 Phases

```
Phase 1: Pre-Recon   → code_analysis_deliverable.md
           ↓
Phase 2: Recon       → recon_deliverable.md
           ↓
Phase 3: Vuln (×5 parallel)
  ├─ injection  → injection_analysis_deliverable.md + injection_exploitation_queue.json
  ├─ xss        → xss_analysis_deliverable.md + xss_exploitation_queue.json
  ├─ auth       → auth_analysis_deliverable.md + auth_exploitation_queue.json
  ├─ authz      → authz_analysis_deliverable.md + authz_exploitation_queue.json
  └─ ssrf       → ssrf_analysis_deliverable.md + ssrf_exploitation_queue.json
           ↓
Phase 4: Exploit (conditional, ×5 parallel)
  └─ Only runs for non-empty queues with externally exploitable findings
           ↓
Phase 5: Report      → comprehensive_security_assessment_report.md
```

**Model assignments:**
- Pre-recon: `claude-opus-4` (deep code analysis)
- Vuln/Exploit: `claude-sonnet-4` (5 parallel agents)
- Report: `claude-haiku-4` (executive summary writing)

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
├── code_analysis_deliverable.md          # Pre-recon findings
├── recon_deliverable.md                  # Attack surface map
├── *_analysis_deliverable.md × 5        # Vulnerability analysis reports
├── *_exploitation_queue.json × 5        # Exploit target lists
├── *_exploitation_evidence.md × 5       # Exploitation evidence
└── comprehensive_security_assessment_report.md  # Final report
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

---

## File Structure

```
shannon-on-claude-code/
├── README.md
├── .mcp.json                        # Playwright + Shannon MCP configuration
├── .claude/
│   ├── settings.json                # Tool permissions + audit hook
│   ├── agents/                      # 13 agent definitions
│   │   ├── pre-recon.md    (opus)
│   │   ├── recon.md        (sonnet)
│   │   ├── vuln-auth.md    (sonnet)
│   │   ├── vuln-authz.md   (sonnet)
│   │   ├── vuln-injection.md (sonnet)
│   │   ├── vuln-xss.md     (sonnet)
│   │   ├── vuln-ssrf.md    (sonnet)
│   │   ├── exploit-auth.md (sonnet)
│   │   ├── exploit-authz.md (sonnet)
│   │   ├── exploit-injection.md (sonnet)
│   │   ├── exploit-xss.md  (sonnet)
│   │   ├── exploit-ssrf.md (sonnet)
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
| Crash recovery | Temporal durable execution | None |
| Resume/workspace | Git checkpoint + session | None |
| Retry | Temporal retry policy (3x) | None |
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
# Clean up and restart
rm -rf deliverables workspace audit-logs
claude
/pentest https://target.com
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
- Adapted all 13 agent prompts to Claude Code native agent format (`.claude/agents/`)
- Added `/pentest` skill orchestrator replacing `pentestPipelineWorkflow`
- Replaced in-process MCP server with stdio-compatible wrapper (`native/mcp-stdio-wrapper.mjs`)
- Added black-box mode detection for URL-only operation without source code

## Acknowledgements

All penetration testing methodology, prompt engineering, vulnerability analysis frameworks, and agent definitions originate from [Shannon](https://github.com/KeygraphHQ/shannon) by Keygraph, Inc.
