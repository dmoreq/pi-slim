# pi-slim

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/pi-slim)](https://www.npmjs.com/package/pi-slim)

**AST-powered project context for [pi](https://github.com/mariozechner/pi-coding-agent).** Injects compact code skeletons (not full files) into every LLM call, plus hashline editing with hash-verified anchors, and LSP-based code navigation — all automatic, zero-config.

- **~85-92% token reduction** vs full-file reads via AST skeletons
- **Hashline editing** — edit files without re-reading them (LINE+bigram anchors)
- **LSP navigation** — go-to-definition, find references, hover type info
- **Zero-config** — auto-indexes on first session, cache loads instantly
- **Multi-language** — TypeScript, Python, Rust (extensible)
- **Telemetry** — injection stats, token savings, cost attribution

---

## Table of Contents

- [Installation](#installation)
- [How It Works](#how-it-works)
- [Core Features](#core-features)
  - [AST Skeleton Injection](#ast-skeleton-injection)
  - [Hashline Editing](#hashline-editing)
  - [LSP Code Navigation](#lsp-code-navigation)
  - [Context Pruning](#context-pruning)
- [Telemetry & Notifications](#telemetry--notifications)
- [Configuration](#configuration)
- [Commands](#commands)
- [Supported Languages](#supported-languages)
- [Performance & Cost Savings](#performance--cost-savings)
- [Development](#development)
- [Contributing](#contributing)

---

## Installation

```bash
pi install git:github.com/dmoreq/pi-slim
```

Restart pi. First session in each project indexes your source files (~1-2s for 1,000 files). Subsequent sessions load from cache instantly.

---

## How It Works

### Session start: AST Indexing

1. **Walk** — scans `.ts`, `.tsx`, `.py`, `.rs` files (respects `.gitignore`)
2. **Parse** — each file is parsed via [tree-sitter](https://tree-sitter.github.io/)
3. **Extract** — only signatures are kept (function headers, class shapes, type definitions)
4. **Graph** — import statements are resolved into a one-directional dependency graph
5. **Cache** — gzip-compressed index saved to `.pi/slim/` for instant reload

### Every LLM call: Context Injection

Pi-slim injects up to four layers:

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names per file |
| `<dep-context>` | Every turn | Skeleton signatures for mentioned files + imports |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |

### Per-turn: Message Pruning

Before building dependency context, redundant messages are pruned automatically:

| Rule | What it removes |
|------|----------------|
| **Deduplication** | Identical consecutive user/assistant messages |
| **Superseded Writes** | Old file writes superseded by newer writes |
| **Error Purging** | Error results followed by successful results |

### Session end: Stats Persistence

Stats recorded to `.pi/slim/stats.jsonl` — visible via `/slim`.

---

## Core Features

### AST Skeleton Injection

When you mention `src/auth.ts`, pi-slim injects its skeleton plus the skeletons of everything it imports:

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

Skeletons are **function/class signatures only** — ~8-15% of full file size.

### Hashline Editing

The `hashline_edit` tool lets you edit files using **hash-verified line anchors** — no file re-read needed.

**Workflow:**

1. The agent reads a file and sees hashline-annotated content:
   ```
   1tz|function hi() {
   2mr|  return x;
   3rd|}
   ```
2. The agent references specific lines by their `LINE+BIGRAM` anchor:
   ```json
   { "path": "src/auth.ts", "edits": [{ "loc": { "range": { "pos": "1tz", "end": "3rd" } }, "content": ["function hi() {", "  return 42;", "}"] }] }
   ```
3. The anchor hash is validated against the current file content
4. If the line shifted (e.g., code was added above), auto-rebase finds it within ±5 lines
5. A compact diff preview is returned with added/removed line counts

**Supported operations:**

| Operation | Description | Anchor format |
|-----------|-------------|-------------|
| `append` | Append to end of file | `"append"` |
| `prepend` | Prepend to beginning of file | `"prepend"` |
| `append` (at anchor) | Insert after specific line | `{ "append": "42nd" }` |
| `prepend` (at anchor) | Insert before specific line | `{ "prepend": "42nd" }` |
| `range` | Replace a range of lines | `{ "range": { "pos": "10ab", "end": "20cd" } }` |

**Get hashline-annotated file content:**
```bash
/hashline-read src/auth.ts
```

### LSP Code Navigation

Three tools provide code intelligence via language servers:

| Tool | Description | Server started |
|------|-------------|---------------|
| `lsp_go_to_definition` | Find where a symbol is defined | `typescript-language-server`, `gopls`, `pyright-langserver`, `rust-analyzer` |
| `lsp_find_references` | Find all usages of a symbol | (same, starts lazily on first call) |
| `lsp_hover` | Get type info at cursor position | (same) |

**Usage:**
```json
{ "path": "src/auth.ts", "line": 10, "column": 5 }
```

Servers start lazily on the first tool call and shut down automatically when the session ends.

### Context Pruning

Messages are pruned before every LLM call. Stats tracked:

| Metric | Where to see |
|--------|-------------|
| Messages pruned | `/slim` command |
| Prune percentage | `/slim` command |
| Disable pruning | `slim.plugins.pruning=false` flag |

---

## Telemetry & Notifications

Pi-slim outputs real-time notifications via pi-telemetry. Here's what you'll see:

### At Session Start

| Message | What it means |
|---------|---------------|
| `✓ 1,234 files loaded (built May 4)` | Cache hit — loaded from `.pi/slim/` |
| `⚠ store corrupted, rebuilding...` | Cache invalid — re-indexing |
| `ℹ indexing project...` | First run — building index from scratch |
| `✓ indexed 1,234 files, 567 edges → .pi/slim/` | Index complete |

### During a Session

| Message | What it means |
|---------|---------------|
| `ℹ injecting 3 files (~150 tokens (88% saved)): src/auth.ts, src/db.ts` | Dep-context built for mentioned files. Token savings vs full reads shown. |
| `⚠ repo-map trimmed (5000 tokens > budget)` | Injection layer exceeded budget — increase `maxRepoMapTokens` to include it |

### At Session End

| Message | What it means |
|---------|---------------|
| `ℹ session summary — index: 1,234 files \| repo-map: ~3,500t \| dep-context: 12x, ~2,400t \| saved ~18,000t (88%)` | Full session statistics |

### On Demand: `/slim`

Shows complete stats for the current (or last) session:

```
── slim session stats ───────────────────────
  Index source     : cache
  Files indexed    : 1,234
  Dep edges        : 567
  Repo map         : ~3,500t (once)
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
  Unique files seen: 45
─────────────────────────────────────────────
```

---

## Configuration

### CLI Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.enabled` | boolean | `true` | Master switch |
| `slim.maxRepoMapTokens` | number | `4000` | Token budget for repo map |
| `slim.maxInjectionTokens` | number | `8000` | Token budget for per-turn dep-context |
| `slim.scanLastNMessages` | number | `10` | Messages to scan for file path mentions |
| `slim.contextFiles.enabled` | boolean | `true` | Load AGENTS.local.md etc. |
| `slim.contextFiles.filenames` | string | `AGENTS.local.md,CLAUDE.local.md` | Comma-separated filenames |
| `slim.providerGuidance.enabled` | boolean | `true` | Load CLAUDE.md/CODEX.md/GEMINI.md |

### Config File (`.pi/slim.jsonc`)

```jsonc
{
  "maxRepoMapTokens": 2000,
  "exclude": ["**/node_modules/**", "**/vendor/**", "**/*.generated.*"],
  "contextFiles": { "enabled": false }
}
```

**Priority:** CLI flags > project config (`.pi/slim.jsonc`) > global config (`~/.pi/agent/slim.jsonc`) > defaults.

---

## Commands

| Command | Description |
|---------|-------------|
| `/slim` | Show injection stats for current or last session |
| `/hashline-read <file>` | Read a file with hashline anchors (e.g. `42nd|function hi() {`) |

**Tools registered for LLM use:**

| Tool | Description |
|------|-------------|
| `hashline_edit` | Edit files using hash-verified line anchors |
| `lsp_go_to_definition` | Find symbol definition via LSP |
| `lsp_find_references` | Find all usages of a symbol |
| `lsp_hover` | Get type information at cursor position |

---

## Supported Languages

| Language | Extensions | Skeleton Extraction | Import Resolution |
|----------|-----------|-------------------|-------------------|
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | Classes, functions, interfaces, types, enums | Relative `./foo`, `../bar` |
| Python | `.py`, `.pyi` | Classes, function signatures | Relative `from .module` |
| Rust | `.rs` | `fn`, `struct`, `enum`, `trait`, `impl` | `mod x;`, `use crate::`, `use super::` |

---

## Performance & Cost Savings

| Scenario | Without pi-slim | With pi-slim v0.5.0 |
|----------|----------------|---------------------|
| Understand a file | Full read (~200t) | Skeleton (~20t) |
| Find a definition | Full read (~200t) | LSP go-to-def (~2t) |
| Edit a function | Full read + edit (~200t) | Hashline anchor (~0t) |
| **Total per file touch** | **~600t** | **~22t (96% less)** |

**Performance benchmarks:**

- **First index:** ~1-2s for 1,000 files, ~5-10s for 10,000 files
- **Cache load:** < 50ms from `.pi/slim/index.json.gz`
- **Disk size:** Gzip-compressed ~84% smaller than raw JSON
- **Pruning overhead:** < 5ms per turn

### Tuning Large Projects

```jsonc
{
  "exclude": ["**/node_modules/**", "**/*.test.ts", "**/examples/**"],
  "maxRepoMapTokens": 2000,
  "maxInjectionTokens": 6000
}
```

If you see `trimmed` warnings, increase the budget.

---

## Development

```bash
npm install                 # install dependencies
npm test                    # run all tests (vitest)
npm run build               # compile TypeScript
npm run test:watch          # watch mode
```

### Project structure

```
pi-slim/
├── extension.ts              # Extension entry point
├── manager.ts                # Session lifecycle and orchestration
├── context/                  # LLM context injection pipeline
├── hashline/                 # Hashline edit system (6 pure modules)
├── lsp/                      # LSP client, server launcher, service
├── indexer/                  # AST index engine + cache + store
├── parsers/                  # Language-specific tree-sitter parsers
├── plugins/                  # Plugin interface + built-in plugins
├── tools/                    # Pi tool definitions (hashline, LSP)
├── metrics/                  # Session stats + cost estimation
├── shared/                   # Utilities (types, token, paths, telemetry)
├── ui/                       # TUI notification formatting
└── tests/                    # Test suite (mirrors source structure)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE)
