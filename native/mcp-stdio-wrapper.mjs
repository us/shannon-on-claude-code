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
  version: "1.0.0",
});

// === save_deliverable tool ===

// Per-vuln-class Zod schemas for exploitation queue validation.
// Mirrors apps/worker/src/ai/queue-schemas.ts in upstream (KeygraphHQ/shannon).
// All extension fields are optional — agents may omit ones that don't apply.

const BaseVulnerability = z.object({
  ID: z.string(),
  vulnerability_type: z.string(),
  externally_exploitable: z.boolean(),
  confidence: z.string(),
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
});

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
});

const AuthVulnerability = BaseVulnerability.extend({
  source_endpoint: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  missing_defense: z.string().optional(),
  exploitation_hypothesis: z.string().optional(),
  suggested_exploit_technique: z.string().optional(),
});

const SsrfVulnerability = BaseVulnerability.extend({
  source_endpoint: z.string().optional(),
  vulnerable_parameter: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  missing_defense: z.string().optional(),
  exploitation_hypothesis: z.string().optional(),
  suggested_exploit_technique: z.string().optional(),
});

const AuthzVulnerability = BaseVulnerability.extend({
  endpoint: z.string().optional(),
  vulnerable_code_location: z.string().optional(),
  role_context: z.string().optional(),
  guard_evidence: z.string().optional(),
  side_effect: z.string().optional(),
  reason: z.string().optional(),
  minimal_witness: z.string().optional(),
});

const queueSchema = (entry) => z.object({ vulnerabilities: z.array(entry) });

const DELIVERABLE_TYPES = {
  CODE_ANALYSIS: { filename: "code_analysis_deliverable.md" },
  RECON: { filename: "recon_deliverable.md" },
  INJECTION_ANALYSIS: { filename: "injection_analysis_deliverable.md" },
  INJECTION_QUEUE: { filename: "injection_exploitation_queue.json", schema: queueSchema(InjectionVulnerability) },
  INJECTION_EVIDENCE: { filename: "injection_exploitation_evidence.md" },
  XSS_ANALYSIS: { filename: "xss_analysis_deliverable.md" },
  XSS_QUEUE: { filename: "xss_exploitation_queue.json", schema: queueSchema(XssVulnerability) },
  XSS_EVIDENCE: { filename: "xss_exploitation_evidence.md" },
  AUTH_ANALYSIS: { filename: "auth_analysis_deliverable.md" },
  AUTH_QUEUE: { filename: "auth_exploitation_queue.json", schema: queueSchema(AuthVulnerability) },
  AUTH_EVIDENCE: { filename: "auth_exploitation_evidence.md" },
  AUTHZ_ANALYSIS: { filename: "authz_analysis_deliverable.md" },
  AUTHZ_QUEUE: { filename: "authz_exploitation_queue.json", schema: queueSchema(AuthzVulnerability) },
  AUTHZ_EVIDENCE: { filename: "authz_exploitation_evidence.md" },
  SSRF_ANALYSIS: { filename: "ssrf_analysis_deliverable.md" },
  SSRF_QUEUE: { filename: "ssrf_exploitation_queue.json", schema: queueSchema(SsrfVulnerability) },
  SSRF_EVIDENCE: { filename: "ssrf_exploitation_evidence.md" },
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
    fs.mkdirSync(deliverablesDir, { recursive: true });

    const outputPath = path.join(deliverablesDir, typeConfig.filename);

    try {
      if (file_path) {
        // Copy from file_path to deliverables directory
        const resolvedPath = path.resolve(targetDir, file_path);
        if (!fs.existsSync(resolvedPath)) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "error",
              message: `File not found: ${resolvedPath}`,
              retryable: true,
            })}],
          };
        }
        fs.copyFileSync(resolvedPath, outputPath);
      } else if (content) {
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

      // Validate queue files against per-class Zod schemas.
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
