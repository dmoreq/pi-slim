---
name: pi-slim
description: Use when working with AST-indexed projects where pi-slim provides skeleton-based dependency context, repo maps, hashline editing, LSP navigation, and token-efficient code awareness
---

# pi-slim: AST-Powered Context Injection

pi-slim is an automatic context injection plugin for pi. It parses your project's source files into compact AST **skeletons** (signatures only, no bodies), injects them into every LLM call, and provides hash-verified editing and LSP code navigation — saving ~85-96% tokens vs naive full-file reads.

## What pi-slim Does for You

### Context Injection (Automatic)

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names per file |
| `<dep-context>` | Every turn | Skeleton signatures for mentioned files + their imports |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md (if present) |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |

### Hashline Editing (Tools for LLM)

The `hashline_edit` tool edits files using `LINE+BIGRAM` anchors (e.g. `42nd`). The agent sees hash-annotated file content from reads, then references specific lines by their anchor — no file re-read needed.

### LSP Navigation (Tools for LLM)

Three tools provide code intelligence via lazily-started language servers:

| Tool | What it does |
|------|-------------|
| `lsp_go_to_definition` | Find where a symbol is defined |
| `lsp_find_references` | Find all usages of a symbol |
| `lsp_hover` | Get type info at cursor position |

**You don't need to configure anything** — it works automatically.

## Interpreting the Output

### `<repo-map>`

```xml
<repo-map>
  (root)
    index.ts  createApp, defineRoutes
    src/
      auth.ts  authenticate, authorize
</repo-map>
```

### `<dep-context>`

When you mention `auth.ts`, pi-slim injects the skeleton of `auth.ts` plus everything it imports:

```xml
<dep-context>
## Active files
### src/auth.ts
export function authenticate(token: string): User { ... }

## Direct dependencies
### src/auth/models.ts
export interface User { ... }
</dep-context>
```

### `/slim` Command

Shows injection stats for the session:

```
── slim session stats ──────────────────
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
─────────────────────────────────────────
```

## When to Use Other Tools

pi-slim provides **forward** dependency info (what does X import?). For other analysis needs:

| You want | Use | Why |
|---------|-----|-----|
| "What files import X?" | `search` / `ripgrep` | Reverse dependency lookup |
| "Find where function Y is called" | `search` | Text-based call site discovery |
| "Find code with a specific structure" | `ast_grep` (semgrep) | AST-level pattern matching |
| "How many LOC in this project?" | `count_lines` (tokei) | Code statistics |

## Performance Notes

- First session in a project indexes ~1K files in 1-2 seconds
- Subsequent sessions load from `.pi/slim/` cache instantly
- Index is gzip-compressed (~84% smaller on disk)
- Hashline anchors add ~2 tokens per line to output
- LSP servers start lazily on first navigation call

## Commands

| Command | Description |
|---------|-------------|
| `/slim` | Show injection stats for current/last session |
| `/hashline-read <file>` | Read a file with hashline anchors |

## Common Pitfalls

- **Very large projects (>10K files):** First indexing takes longer; set `exclude` patterns in `.pi/slim.jsonc`
- **pi-slim doesn't do reverse dep lookups:** Use `search "import.*from.*foo"` via pi-sherlock tools
- **The dep graph only covers 1st-degree imports** (direct imports, not transitive chains)
- **LSP requires language server binaries on $PATH:** `typescript-language-server`, `gopls`, `pyright-langserver`, or `rust-analyzer`
