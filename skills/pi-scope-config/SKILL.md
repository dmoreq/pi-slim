---
name: pi-scope-config
description: Use when configuring pi-scope settings, troubleshooting indexing or performance issues, changing token budgets, setting up LSP servers, or customizing context injection behavior
---

# pi-scope Configuration

## Prerequisites: Install Required Tools

Before first use, ensure required tools are on `$PATH`. pi-scope works with what's available — missing tools just disable the corresponding feature.

### Essential (npm deps, auto-installed by pi)
```bash
# Already installed. Verify with:
npm ls diff ignore jsonc-parser pi-telemetry tree-sitter tree-sitter-python tree-sitter-rust tree-sitter-typescript vscode-jsonrpc xxhash-wasm zod 2>/dev/null | head -3
```

### LSP Servers (for code navigation — one per language you use)
```bash
# TypeScript / JavaScript
npm install -g typescript typescript-language-server

# Python
pip install pyright

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

If a server is missing, the corresponding `lsp_*` tool logs a warning and skips that language — no crash.

### Graph Data (built-in, no install needed)

pi-scope has its own native TypeScript graph engine (degree centrality, PageRank,
Louvain clustering, cycle detection, surprise detection) for TS/Py/Rust projects.
No install needed.

For richer graphs with 15+ language support, point pi-scope at graphifyy output:
```bash
pip install graphifyy && cd your-project && graphify .
# pi-scope auto-detects graphify-out/graph.json on next session start
```

## Configuration Layers (Priority: Highest Wins)

| Priority | Layer | Location |
|----------|-------|----------|
| 1 | CLI flags | `--slim.enabled=false` etc. |
| 2 | Project config | `<project>/.pi/slim.jsonc` |
| 3 | Global config | `~/.pi/agent/slim.jsonc` |
| 4 | Hardcoded defaults | `context/schema.ts` |

## All Config Options

### Core

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.enabled` | boolean | `true` | Master switch — disables all injection |
| `slim.maxRepoMapTokens` | number | `4000` | Token budget for repo-map (injected once, first turn) |
| `slim.maxInjectionTokens` | number | `8000` | Token budget for per-turn dep-context injection |
| `slim.scanLastNMessages` | number | `10` | Messages scanned for file path/symbol mentions |
| `slim.dependencyDepth` | number (0-3) | `1` | Transitive dep depth. 0 = no deps, 1 = direct only, 3 = deep |
| `slim.exclude` | string[] | `["**/node_modules/**", ...]` | Glob patterns to exclude from indexing |

### Context Files

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.contextFiles.enabled` | boolean | `true` | Load AGENTS.local.md etc. |
| `slim.contextFiles.filenames` | string | `AGENTS.local.md,CLAUDE.local.md` | Comma-separated filenames searched at each ancestor dir |

### Provider Guidance

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.providerGuidance.enabled` | boolean | `true` | Load CLAUDE.md/CODEX.md/GEMINI.md by provider |

### Config File Path

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.config` | string | — | Custom path to JSONC config file |

## Example `.pi/slim.jsonc`

```jsonc
{
  // Use // comments — JSONC is parsed by jsonc-parser
  "maxRepoMapTokens": 2000,
  "maxInjectionTokens": 4000,
  "dependencyDepth": 2,
  "exclude": [
    "**/node_modules/**",
    "**/*.generated.*",
    "**/vendor/**",
    "**/test-fixtures/**"
  ],
  "contextFiles": {
    "enabled": true,
    "filenames": ["AGENTS.local.md", "CLAUDE.local.md", "TEAM.local.md"],
    "sectionTitle": "Project Context"
  },
  "providerGuidance": {
    "enabled": false
  }
}
```

## Provider Guidance Config (`~/.pi/agent/agent-guidance.json`)

Customize which files are loaded per provider/model:

```json
{
  "providers": {
    "anthropic": ["CLAUDE.md"],
    "openai": ["CODEX.md"]
  },
  "models": {
    "claude-sonnet-*": ["SONNET.md"],
    "gpt-4*": ["GPT4.md"]
  }
}
```

## Performance Tuning

| Problem | Fix |
|---------|-----|
| **Slow first index (>10s)** | Add `exclude` patterns for large vendor/test directories |
| **Too many skeletons injected per turn** | Lower `maxInjectionTokens` |
| **Repo-map too large / trimmed** | Lower `maxRepoMapTokens` or add `exclude` patterns |
| **Dep graph too deep** | Set `dependencyDepth: 1` (direct only) |
| **Scans too few/too many messages** | Adjust `scanLastNMessages` |
| **Disable pi-scope entirely** | Set `slim.enabled: false` |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| "No such file" for LSP | Required binary not on `$PATH`. Install: `typescript-language-server`, `pyright-langserver`, `gopls`, `rust-analyzer` |
| Index builds every session | Cache corrupt. Delete `.pi-cache/slim.json` and `.pi/slim/index.json.gz` |
| Config changes not applied | Check layer priority. CLI flags > project config > global config |
| "store corrupted, rebuilding" | Index version mismatch — auto-recovers |
| Context file not found | File must exist in project root or ancestor directory; filenames must match exactly |

## Quick Reference

```bash
# Disable pi-scope for a session
pi --slim.enabled=false

# Check current stats
/scope

# Read a file with hash anchors
/hashline-read src/auth.ts

# Show limited repo-map
pi --slim.maxRepoMapTokens=1000
```
