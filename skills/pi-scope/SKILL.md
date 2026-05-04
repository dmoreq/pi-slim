---
name: pi-scope
description: AST-powered context injection, intelligent symbol-based file retrieval, hashline editing, and LSP code navigation for pi
---

# pi-scope: Context, Retrieval & Code Intelligence

pi-scope parses your project's source files into compact AST skeletons, retrieves files intelligently by symbol name and relevance, supports hash-verified editing, and provides LSP code navigation — saving ~85-97% tokens vs naive full-file reads.

## What pi-scope Does for You

### Intelligent Retrieval (Automatic)

pi-scope finds files by **what they export**, not just their filename. When you mention a function name, it matches against the symbol index built at session start.

**Scoring:** `3×symbolMatch + 2×filenameMatch + 1×depProximity`

### Context Injection (Automatic)

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names, sorted by recency |
| `<dep-context>` | Every turn | Scored skeletons for retrieved files + transitive deps |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |

### Hashline Editing

The `hashline_edit` tool edits files using `LINE+BIGRAM` anchors. The agent sees hash-annotated content and references lines by anchor — no file re-read.

**Dry-run mode:** `dry_run: true` validates without writing.

### LSP Navigation

Three tools: `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`. Results auto-inject into next context.

## Commands

| Command | Description |
|---------|-------------|
| `/slim` | Show injection stats for current/last session |
| `/hashline-read <file>` | Read a file with hash anchors |

## Common Pitfalls

- **Large projects (>10K files):** Set `exclude` patterns in `.pi/slim.jsonc`
- **Reverse dep lookups:** Use `search`/`ripgrep` via pi-sherlock
- **LSP requires binaries on $PATH:** `typescript-language-server`, `gopls`, `pyright-langserver`, `rust-analyzer`
- **First-degree imports only** in dep graph (transitive configurable via `dependencyDepth`)
