# pi-scope

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Context, retrieval & code intelligence for [pi](https://github.com/mariozechner/pi-coding-agent).** Injects compact AST skeletons (not full files) into every LLM call, retrieves files intelligently by symbol name, supports hash-verified editing, and provides LSP code navigation — all automatic, zero-config.

- **Intelligent retrieval** — finds files by symbol name, not just regex path matching
- **~85-96% token reduction** vs full-file reads via AST skeletons
- **Hashline editing** — edit files without re-reading them (hash-verified line anchors)
- **LSP navigation** — go-to-definition, find references, hover type info
- **Reverse dependency graph** — impact analysis and proximity scoring
- **Zero-config** — auto-indexes on first session, cache loads instantly
- **Multi-language** — TypeScript, Python, Rust (extensible)
- **Telemetry** — injection stats, token savings, pruning visibility

---

## Table of Contents

- [Installation](#installation)
- [How It Works](#how-it-works)
- [Core Features](#core-features)
  - [Intelligent Retrieval](#intelligent-retrieval)
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
pi install git:github.com/dmoreq/pi-scope
```

Restart pi. First session indexes your project (~1-2s for 1,000 files). Subsequent sessions load from cache instantly.

---

## How It Works

### Session start: AST Indexing

1. **Walk** — scans `.ts`, `.tsx`, `.py`, `.rs` files (respects `.gitignore`)
2. **Parse** — each file is parsed via [tree-sitter](https://tree-sitter.github.io/)
3. **Extract** — signatures (function headers, class shapes) + exported symbol names
4. **Graph** — forward deps + reverse deps + symbol index
5. **Cache** — gzip-compressed index saved to `.pi/slim/` for instant reload

### Every LLM call: Context Injection

Pi-scope injects up to four layers:

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names, sorted by recency |
| `<dep-context>` | Every turn | Scored skeletons for retrieved files + transitive deps |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |

### Per-turn: Message Pruning

| Rule | What it removes |
|------|----------------|
| **Deduplication** | Identical consecutive user/assistant messages |
| **Superseded Writes** | Old file writes superseded by newer writes |
| **Error Purging** | Error results followed by successful results |

---

## Core Features

### Intelligent Retrieval

Pi-scope finds files by what they **contain**, not just their path. When you mention a function name, it matches against all exported symbols in the codebase.

**Score formula:** `3×symbolMatch + 2×filenameMatch + 1×depProximity`

**Example:** "edit the authenticate function" → finds `src/auth/services.ts` (exports `authenticate`) with score 6, injects its skeleton plus transitive dependencies.

### AST Skeleton Injection

When pi-scope retrieves `src/auth.ts`, it injects its skeleton plus the skeletons of everything it imports:

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

The `hashline_edit` tool edits files using **hash-verified line anchors** — no file re-read needed.

**Workflow:**
1. Agent sees skeleton with hash annotations or calls `/hashline-read`
2. References lines by `LINE+BIGRAM` anchor (e.g. `"1tz"`)
3. Hash validated against current content. Auto-rebases within ±5 lines on shift
4. Compact diff preview returned with added/removed line counts

**Dry-run mode:** `dry_run: true` validates anchors and shows the diff without writing.

### LSP Code Navigation

Three tools via lazily-started language servers:

| Tool | Server |
|------|--------|
| `lsp_go_to_definition` | `typescript-language-server`, `gopls`, `pyright-langserver`, `rust-analyzer` |
| `lsp_find_references` | (same, starts on first call) |
| `lsp_hover` | (same) |

Results feed into context auto-injection — resolved files appear in the next dep-context.

### Context Pruning

Messages pruned before every LLM call. Notifications visible via pi-telemetry (`✂️ Pruned 5/30 (17%)`).

---

## Telemetry & Notifications

### At Session Start
| Message | Meaning |
|---------|---------|
| `✓ 1,234 files loaded (built May 4)` | Cache hit |
| `✓ indexed 1,234 files, 567 edges` | Fresh build complete |

### During a Session
| Message | Meaning |
|---------|---------|
| `ℹ injecting 3 files (~150 tokens (88% saved))` | Dep-context built |
| `⚠ repo-map trimmed (5000 tokens > budget)` | Budget exceeded |
| `✂️ Pruned 5/30 messages (17%)` | Messages pruned |

### On Demand: `/slim`
```
── pi-scope session stats ─────────────────
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
─────────────────────────────────────────────
```

---

## Configuration

### CLI Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.enabled` | boolean | `true` | Master switch |
| `slim.maxRepoMapTokens` | number | `4000` | Token budget for repo map |
| `slim.maxInjectionTokens` | number | `8000` | Token budget for dep-context |
| `slim.scanLastNMessages` | number | `10` | Messages to scan for mentions |
| `slim.dependencyDepth` | number | `1` | Transitive dep depth (1-3) |
| `slim.contextFiles.enabled` | boolean | `true` | Load AGENTS.local.md etc. |
| `slim.contextFiles.filenames` | string | `AGENTS.local.md,CLAUDE.local.md` | Comma-separated filenames |
| `slim.providerGuidance.enabled` | boolean | `true` | Load CLAUDE.md/CODEX.md/GEMINI.md |

### Config File (`.pi/slim.jsonc`)

```jsonc
{
  "maxRepoMapTokens": 2000,
  "dependencyDepth": 2,
  "exclude": ["**/node_modules/**", "**/*.generated.*"]
}
```

**Priority:** CLI flags > project config > global config > defaults.

---

## Commands

| Command | Description |
|---------|-------------|
| `/slim` | Show injection stats for current or last session |
| `/hashline-read <file>` | Read a file with hash anchors |

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

| Scenario | Without pi-scope | With pi-scope |
|----------|----------------|---------------|
| Find a file by function name | grep or guess (~200t) | Symbol index (~0t) |
| Understand a file | Full read (~200t) | Skeleton (~20t) |
| Find a definition | Full read (~200t) | LSP go-to-def (~2t) |
| Edit a function | Full read + edit (~200t) | Hashline anchor (~0t) |
| **Total per file touch** | **~800t** | **~22t (97% less)** |

**Performance benchmarks:**
- First index: ~1-2s for 1,000 files, ~5-10s for 10,000 files
- Cache load: < 50ms from `.pi/slim/index.json.gz`
- Pruning overhead: < 5ms per turn

---

## Development

```bash
npm install && npm test && npm run build
```

### Project structure

```
pi-scope/
├── extension.ts              # Extension entry point
├── manager.ts                # SessionManager — orchestration
├── context/                  # Retrieval engine + injection pipeline
├── hashline/                 # Hashline edit system (6 modules)
├── lsp/                      # LSP client + service
├── indexer/                  # AST index engine + cache + store
├── parsers/                  # Language-specific tree-sitter parsers
├── plugins/                  # Plugin interface + built-in plugins
├── tools/                    # Pi tool definitions
├── metrics/                  # Session stats + cost estimation
├── shared/                   # Utilities
├── ui/                       # TUI notifications
└── tests/                    # Test suite (mirrors source structure)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT license.
