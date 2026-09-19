#!/usr/bin/env node
/**
 * Stdio wrapper for Shannon Helper MCP Server.
 *
 * Bridges the in-process createShannonHelperServer() to stdio transport
 * so Claude Code can use it as an MCP server via .mcp.json.
 *
 * Environment variables:
 *   SHANNON_TARGET_DIR - Working directory for deliverables (default: cwd)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const targetDir = process.env.SHANNON_TARGET_DIR || process.cwd();

const server = new McpServer({
  name: "shannon-tools",
  version: "1.1.0",
});

// === save_deliverable tool ===

// Per-vuln-class Zod schemas for exploitation queue validation.
// Mirrors apps/worker/src/ai/queue-schemas.ts in upstream (KeygraphHQ/shannon).
// All extension fields are optional — agents may omit ones that don't apply.

const CodeLocation = z.object({
  file: z.string(),
  start_line: z.number().int().min(1).optional(),
  end_line: z.number().int().min(1).optional(),
  role: z.enum(["sink", "source", "guard"]),
  symbol: z.string().optional(),
});

const BaseVulnerability = z.object({
  ID: z.string(),
  vulnerability_type: z.string(),
  externally_exploitable: z.boolean(),
  // Free string (not enum): agents write "high"/"medium"/"low" per local
  // prompts, upstream SAST uses "med". Strict enums broke real runs.
  confidence: z.string(),
  code_locations: z.array(CodeLocation).optional(),
  notes: z.string().optional(),
});

const InjectionVulnerability = BaseVulnerability.extend({
  source: z.string().optional(),
  combined_sources: z.string().optional(),
  path: z.string().optional(),
  sink_call: z.string().optional(),
  slot_type: z.string().optional(),
  sanitization_observed: z.string().optional(),
  concat_occurrences: z.string().optional(),
  verdict: z.string().optional(),
  mismatch_reason: z.string().optional(),
  witness_payload: z.string().optional(),
}).passthrough();

const XssVulnerability = BaseVulnerability.extend({
  source: z.string().optional(),
  source_detail: z.string().optional(),
  path: z.string().optional(),
  sink_function: z.string().optional(),
  render_context: z.string().optional(),
  encoding_observed: z.string().optional(),
  verdict: z.string().optional(),
  mismatch_reason: z.string().optional(),
  witness_payload: z.string().optional(),
}).passthrough();

const AuthVulnerability = BaseVulnerability.extend({
  source_endpoint: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  missing_defense: z.string().optional(),
  exploitation_hypothesis: z.string().optional(),
  suggested_exploit_technique: z.string().optional(),
}).passthrough();

const SsrfVulnerability = BaseVulnerability.extend({
  source_endpoint: z.string().optional(),
  vulnerable_parameter: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  missing_defense: z.string().optional(),
  exploitation_hypothesis: z.string().optional(),
  suggested_exploit_technique: z.string().optional(),
}).passthrough();

const AuthzVulnerability = BaseVulnerability.extend({
  endpoint: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  role_context: z.string().optional(),
  guard_evidence: z.string().optional(),
  side_effect: z.string().optional(),
  reason: z.string().optional(),
  minimal_witness: z.string().optional(),
}).passthrough();

// Reconciled queue entries merge the six per-class queues plus SAST findings.
// Loose on purpose: the reconcile agent normalizes class-specific fields.
const ReconciledVulnerability = BaseVulnerability.extend({
  source_class: z.string().optional(),
  merged_ids: z.array(z.string()).optional(),
}).passthrough();

// SAST-lite findings use queue shape with _sastId join key (upstream
// _sast-enrichment-procedure.txt convention).
const SastFinding = BaseVulnerability.extend({
  _sastId: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  cwe: z.string().optional(),
}).passthrough();

const MiscellaneousVulnerability = BaseVulnerability.extend({
  cwe: z.string().optional(),
  source_endpoint: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  missing_defense: z.string().optional(),
  observable_signal: z.string().optional(),
  exploitation_hypothesis: z.string().optional(),
  suggested_exploit_technique: z.string().optional(),
  proof_criterion: z.string().optional(),
}).passthrough();

// Upstream producer ID namespaces (apps/worker/src/ai/reconciliation/refs.ts).
// Vuln agents must mint IDs as <PREFIX>-VULN-NN (e.g. INJ-VULN-01).
const REF_PREFIX = {
  injection: "INJ",
  xss: "XSS",
  auth: "AUTH",
  authz: "AUTHZ",
  ssrf: "SSRF",
  miscellaneous: "MISC",
};

function producerIdPattern(vulnClass) {
  return new RegExp(`^${REF_PREFIX[vulnClass]}-VULN-0*[1-9][0-9]*$`);
}

function validateQueueIds(vulnerabilities, vulnClass) {
  const errors = [];
  const pattern = producerIdPattern(vulnClass);
  const seen = new Set();
  for (const entry of vulnerabilities) {
    const id = entry?.ID;
    if (typeof id !== "string" || !pattern.test(id)) {
      errors.push(`ID "${String(id)}" must match ${REF_PREFIX[vulnClass]}-VULN-NN (e.g. ${REF_PREFIX[vulnClass]}-VULN-01)`);
    } else if (seen.has(id)) {
      errors.push(`Duplicate ID "${id}": each entry needs its own ${REF_PREFIX[vulnClass]}-VULN-NN ID`);
    } else {
      seen.add(id);
    }
  }
  return errors;
}

const queueSchema = (entry) => z.object({ vulnerabilities: z.array(entry) });

const DELIVERABLE_TYPES = {
  CODE_ANALYSIS: { filename: "pre_recon_deliverable.md" },
  RECON: { filename: "recon_deliverable.md" },
  INJECTION_ANALYSIS: { filename: "injection_analysis_deliverable.md" },
  INJECTION_QUEUE: { filename: "injection_exploitation_queue.json", schema: queueSchema(InjectionVulnerability), vulnClass: "injection" },
  INJECTION_EVIDENCE: { filename: "injection_exploitation_evidence.md" },
  XSS_ANALYSIS: { filename: "xss_analysis_deliverable.md" },
  XSS_QUEUE: { filename: "xss_exploitation_queue.json", schema: queueSchema(XssVulnerability), vulnClass: "xss" },
  XSS_EVIDENCE: { filename: "xss_exploitation_evidence.md" },
  AUTH_ANALYSIS: { filename: "auth_analysis_deliverable.md" },
  AUTH_QUEUE: { filename: "auth_exploitation_queue.json", schema: queueSchema(AuthVulnerability), vulnClass: "auth" },
  AUTH_EVIDENCE: { filename: "auth_exploitation_evidence.md" },
  AUTHZ_ANALYSIS: { filename: "authz_analysis_deliverable.md" },
  AUTHZ_QUEUE: { filename: "authz_exploitation_queue.json", schema: queueSchema(AuthzVulnerability), vulnClass: "authz" },
  AUTHZ_EVIDENCE: { filename: "authz_exploitation_evidence.md" },
  SSRF_ANALYSIS: { filename: "ssrf_analysis_deliverable.md" },
  SSRF_QUEUE: { filename: "ssrf_exploitation_queue.json", schema: queueSchema(SsrfVulnerability), vulnClass: "ssrf" },
  SSRF_EVIDENCE: { filename: "ssrf_exploitation_evidence.md" },
  MISCELLANEOUS_ANALYSIS: { filename: "miscellaneous_analysis_deliverable.md" },
  MISCELLANEOUS_QUEUE: { filename: "miscellaneous_exploitation_queue.json", schema: queueSchema(MiscellaneousVulnerability), vulnClass: "miscellaneous" },
  MISCELLANEOUS_EVIDENCE: { filename: "miscellaneous_exploitation_evidence.md" },
  SAST_ANALYSIS: { filename: "sast_deliverable.md" },
  SAST_FINDINGS: { filename: "sast_findings.json", schema: queueSchema(SastFinding) },
  RECONCILED_QUEUE: { filename: "reconciled_exploitation_queue.json", schema: queueSchema(ReconciledVulnerability) },
  AUTH_VALIDATION: { filename: "auth_validation.json" },
  SARIF_REPORT: { filename: "security_assessment_report.sarif" },
  JSON_REPORT: { filename: "security_assessment_report.json" },
  REPORT: { filename: "comprehensive_security_assessment_report.md" },
};

server.tool(
  "save_deliverable",
  "Save a penetration testing deliverable file with validation",
  {
    deliverable_type: z.string().describe("Type of deliverable (e.g., CODE_ANALYSIS, RECON, INJECTION_QUEUE)"),
    file_path: z.string().optional().describe("Path to file on disk to save as deliverable"),
    content: z.string().optional().describe("Inline content to save (use for small content like JSON queues)"),
  },
  async ({ deliverable_type, file_path, content }) => {
    const typeConfig = DELIVERABLE_TYPES[deliverable_type];
    if (!typeConfig) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          status: "error",
          message: `Unknown deliverable_type: ${deliverable_type}. Valid types: ${Object.keys(DELIVERABLE_TYPES).join(", ")}`,
          retryable: false,
        })}],
      };
    }

    const deliverablesDir = path.join(targetDir, "deliverables");

    const outputPath = path.join(deliverablesDir, typeConfig.filename);

    try {
      fs.mkdirSync(deliverablesDir, { recursive: true });

      if (file_path && content) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            status: "error",
            message: "Provide either file_path or content, not both",
            retryable: true,
          })}],
        };
      }
      if (file_path) {
        // Copy from file_path to deliverables directory.
        // Containment: the source must resolve INSIDE the target dir.
        // Absolute paths and ../ escapes are rejected (arbitrary local file
        // disclosure into deliverables, e.g. via prompt-injected paths).
        const resolvedPath = path.resolve(targetDir, file_path);
        const contained = resolvedPath === targetDir ||
          resolvedPath.startsWith(targetDir + path.sep);
        if (!contained) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: `file_path escapes the target directory: ${file_path}`,
              retryable: false,
            })}],
          };
        }
        let stat;
        try {
          stat = fs.statSync(resolvedPath);
        } catch {
          stat = null;
        }
        if (!stat || !stat.isFile()) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: `File not found or not a regular file: ${resolvedPath}`,
              retryable: true,
            })}],
          };
        }
        // Symlink guard: resolve the real path (statSync follows links) and
        // re-check containment, otherwise workspace/link -> /etc/passwd escapes.
        let realPath;
        try {
          realPath = fs.realpathSync(resolvedPath);
        } catch {
          realPath = null;
        }
        const realContained = typeof realPath === "string" &&
          (realPath === targetDir || realPath.startsWith(targetDir + path.sep));
        if (!realContained) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: `file_path resolves outside the target directory: ${file_path}`,
              retryable: false,
            })}],
          };
        }
        if (stat.size > 10 * 1024 * 1024) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: `File too large (>10MB): ${resolvedPath}`,
              retryable: false,
            })}],
          };
        }
        fs.copyFileSync(resolvedPath, outputPath);
      } else if (content) {
        if (content.length > 10 * 1024 * 1024) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: "content too large (>10MB)",
              retryable: false,
            })}],
          };
        }
        fs.writeFileSync(outputPath, content, "utf-8");
      } else {
        return {
          content: [{ type: "text", text: JSON.stringify({
            status: "error",
            message: "Either file_path or content must be provided",
            retryable: true,
          })}],
        };
      }

      // Validate queue files against per-class Zod schemas + ID namespace.
      let validated = true;
      let validation_errors;
      if (typeConfig.schema) {
        try {
          const raw = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
          const parsed = typeConfig.schema.safeParse(raw);
          if (!parsed.success) {
            validated = false;
            validation_errors = parsed.error.issues.map(
              (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
            );
          } else if (typeConfig.vulnClass && Array.isArray(raw.vulnerabilities)) {
            const idErrors = validateQueueIds(raw.vulnerabilities, typeConfig.vulnClass);
            if (idErrors.length > 0) {
              validated = false;
              validation_errors = idErrors;
            }
          }
        } catch (e) {
          validated = false;
          validation_errors = [`JSON parse error: ${String(e)}`];
        }
      } else if (typeConfig.filename.endsWith(".json")) {
        // Fallback: any other JSON deliverable — basic structural check
        try {
          JSON.parse(fs.readFileSync(outputPath, "utf-8"));
        } catch {
          validated = false;
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({
          status: validated ? "success" : "validation_failed",
          filepath: outputPath,
          validated,
          ...(validation_errors ? { validation_errors } : {}),
        })}],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          status: "error",
          message: String(err),
          retryable: true,
        })}],
      };
    }
  }
);

// === generate_totp tool ===

server.tool(
  "generate_totp",
  "Generate a TOTP code for multi-factor authentication",
  {
    secret: z.string().describe("Base32-encoded TOTP secret"),
    digits: z.number().optional().default(6).describe("Number of digits (default: 6)"),
    period: z.number().optional().default(30).describe("Time period in seconds (default: 30)"),
  },
  async ({ secret, digits, period }) => {
    try {
      if (typeof secret !== "string" || secret.length === 0 || secret.length > 500) {
        throw new Error("secret must be a non-empty string under 500 chars");
      }
      if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
        throw new Error("digits must be an integer between 4 and 10");
      }
      if (!Number.isInteger(period) || period < 5 || period > 300) {
        throw new Error("period must be an integer between 5 and 300 seconds");
      }
      // Decode base32 secret
      const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
      let bits = "";
      for (const c of cleanSecret) {
        const val = base32chars.indexOf(c);
        if (val === -1) throw new Error(`Invalid base32 character: ${c}`);
        bits += val.toString(2).padStart(5, "0");
      }
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
      }
      const key = Buffer.from(bytes);

      // Calculate TOTP
      const epoch = Math.floor(Date.now() / 1000);
      const counter = Math.floor(epoch / period);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      const hmac = crypto.createHmac("sha1", key);
      hmac.update(counterBuffer);
      const hash = hmac.digest();

      const offset = hash[hash.length - 1] & 0x0f;
      const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

      const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, "0");

      return {
        content: [{ type: "text", text: JSON.stringify({
          code: otp,
          valid_for: period - (epoch % period),
          digits,
        })}],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: String(err),
        })}],
      };
    }
  }
);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
