#!/bin/bash
# Shannon audit logger hook for Claude Code
# Logs tool usage to audit-logs/session.jsonl

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/audit-logs"
mkdir -p "$LOG_DIR"
echo "{\"ts\":\"$TS\",\"tool\":\"$TOOL\"}" >> "$LOG_DIR/session.jsonl"
exit 0
