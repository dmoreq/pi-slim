---
name: pi-scope-lsp
description: Use when you need go-to-definition, find-references, hover type info, or LSP diagnostics via pi-scope; when LSP tools return errors; or when setting up language servers for code navigation
---

# pi-scope LSP Code Navigation

## Prerequisites: Install LSP Servers

Each language needs its LSP server on `$PATH`. pi-scope logs which are found and which are missing at session start.

```bash
# TypeScript / JavaScript (recommended for all TS/JS projects)
npm install -g typescript typescript-language-server

# Python
pip install pyright

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

**Missing server?** The corresponding `lsp_*` tool logs a warning and skips that language — no crash, no blocking.

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `lsp_go_to_definition` | Find where a symbol is defined | `path`, `line` (0-indexed), `column` (0-indexed) |
| `lsp_find_references` | Find all usages of a symbol | `path`, `line`, `column` |
| `lsp_hover` | Get type info and docs at cursor | `path`, `line`, `column` |

All three tools use **0-indexed** line and column positions.

## Supported Languages & Required Servers

| Language | Server Binary | Command | Extensions |
|----------|-------------|---------|----|
| TypeScript/JS | `typescript-language-server` | `--stdio` | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx` |
| Python | `pyright-langserver` | `--stdio` | `.py`, `.pyi` |
| Go | `gopls` | (no args) | `.go` |
| Rust | `rust-analyzer` | (no args) | `.rs` |

**Servers must be on `$PATH`.** Install them via your package manager (npm, pip, go install, rustup).

## Graph-Enhanced Hover (When Native Graph Analysis Active)

When native graph analysis has run on the computed code index, the `lsp_hover` tool returns **enhanced information** beyond standard LSP type info:

| Extra Field | What it shows |
|-------------|---------------|
| **God Node Status** | ⭐ if the symbol is a god node, with CRITICAL/HIGH/MEDIUM/LOW criticality |
| **Centrality** | In-degree, out-degree, PageRank score |
| **Community** | Which functional group the symbol belongs to |
| **Surprising Connections** | Cross-community edges involving this symbol |
| **Impact Analysis** | How many dependents would be affected by a change |

This is automatic — no extra configuration needed. All standard LSP type info is still returned.

## How It Works

1. **Lazy startup** — language servers start on first tool call, not at session start
2. **Per-language** — one server instance per language (cached for the session)
3. **Auto-injection** — results feed into the next context turn's `extraPaths`, making resolved files available in the dep-context without manual reads

## Example Usage

```typescript
// Go to definition
lsp_go_to_definition({
  path: "src/auth.ts",
  line: 5,     // 0-indexed
  column: 10
})

// Find all references
lsp_find_references({
  path: "src/auth.ts",
  line: 5,
  column: 10
})

// Hover for type info
lsp_hover({
  path: "src/auth.ts",
  line: 5,
  column: 10
})
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "No language server available" | File extension not mapped | Only `.ts`, `.tsx`, `.py`, `.rs`, `.go` files have LSP support |
| "LSP error: spawn ENOENT" | Server binary not found | Install the binary on `$PATH` |
| "LSP request timed out" | Server unresponsive | Check server health, restart pi session |
| "No definition found" | Symbol not defined in the file tree | Try typing a more precise position |
| Empty hover result | Position has no type info | Move cursor to a symbol (not whitespace) |

## Tips

- **Position is 0-indexed** (line 0 = first line, column 0 = first character)
- **Results are file paths** — resolved files appear in the next dep-context automatically
- **One server per language** — switching between `.ts` and `.py` files starts both servers
- **Session lifetime** — servers live until `session_shutdown`, then killed with SIGTERM (+ 3s grace, then SIGKILL)
