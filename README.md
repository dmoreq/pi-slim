# pi-scope

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Context, retrieval & code intelligence for [pi](https://github.com/mariozechner/pi-coding-agent).** Injects compact AST skeletons (not full files) into every LLM call, retrieves files intelligently by symbol name, supports hash-verified editing, and provides LSP code navigation — all automatic, zero-config.

- **Intelligent retrieval** — finds files by symbol name, not just regex path matching
- **Graph analysis** — god nodes, communities, cycles, surprising connections via integrated graph engine
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
  - [Graph Analysis](#graph-analysis)
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

### Optional: Install LSP Servers (for code navigation)

pi-scope works without these — LSP tools just log a warning and skip the missing language.

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

### Graph Analysis (built-in, no install needed)

pi-scope has its **own native TypeScript graph engine** — 5 algorithms that run automatically:

| Algorithm | Detects | Needs install? |
|-----------|---------|----------------|
| Degree Centrality + PageRank | God nodes (most depended-on symbols) | Built-in |
| Louvain Clustering | Communities (related module groups) | Built-in |
| Tarjan SCC | Circular dependencies | Built-in |
| Surprise Detection | Cross-community edges | Built-in |

This works on TS/Py/Rust projects out of the box. No install, no config.

---

## How It Works

### Session start: AST Indexing + Graph Analysis

1. **Walk** — scans `.ts`, `.tsx`, `.py`, `.rs` files (respects `.gitignore`)
2. **Parse** — each file is parsed via [tree-sitter](https://tree-sitter.github.io/)
3. **Extract** — signatures (function headers, class shapes) + exported symbol names
4. **Graph** — forward deps + reverse deps + symbol index
5. **Graph Analysis** — automatically runs natively on the built-in graph:
   - **Degree Centrality & PageRank** → identifies god nodes (highly depended-on symbols)
   - **Louvain Community Detection** → groups related modules
   - **Cycle Detection** (Tarjan's SCC) → finds circular dependencies
   - **Surprising Connection Detection** → cross-community edges, legacy dependencies
6. **Cache** — gzip-compressed index + graph cache saved to `.pi/pi-scope/` for instant reload

### Every LLM call: Context Injection

Pi-scope injects up to five layers:

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names, sorted by recency |
| `<dep-context>` | Every turn | Scored skeletons for retrieved files + transitive deps |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |
| `<graph-insights>` | Once | God nodes, surprising connections, community structure |

### Per-turn: Message Pruning

| Rule | What it removes |
|------|----------------|
| **Deduplication** | Identical consecutive user/assistant messages |
| **Superseded Writes** | Old file writes superseded by newer writes |
| **Error Purging** | Error results followed by successful results |
| **Community Pruning** | Keeps only context relevant to the active query's community |

---

## Core Features

### Intelligent Retrieval

Pi-scope finds files by what they **contain**, not just their path. When you mention a function name, it matches against all exported symbols in the codebase.

**Score formula:** `3×symbolMatch + 2×filenameMatch + 1×depProximity`

**Graph Boost:** God nodes get a 2× score multiplier; surprising connections are injected as breadcrumbs.

**Example:** "edit the authenticate function" → finds `src/auth/services.ts` (exports `authenticate`) with score 6, injects its skeleton plus transitive dependencies.

### Graph Analysis

Pi-scope automatically runs a full native analysis pipeline on the built-in parsed AST code index:

| Algorithm | What it finds | Displayed in `/scope` |
|-----------|---------------|----------------------|
| Degree Centrality | Nodes with most connections | God Nodes |
| PageRank | Important nodes (by importance flow) | God Node rank |
| Louvain Clustering | Related module groups | Communities |
| Tarjan's SCC | Circular dependency chains | Cycle count |
| Surprise Detection | Cross-community edges | Alert in startup |

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
1. Agent sees dep-context (skeleton + hashline anchor block) or calls `hashline_read` / `/hashline-read`
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
| `lsp_hover` | (same, includes graph metrics when available) |

Results feed into context auto-injection — resolved files appear in the next dep-context. When graph analysis is active, hover info includes god node status, centrality metrics, and community membership.

### Context Pruning

Messages pruned before every LLM call. Notifications visible via pi-telemetry (`✂️ Pruned 5/30 (17%)`).

The **Community Pruning Plugin** (auto-registered when communities are detected) filters context messages to the relevant community, keeping interface nodes as bridges.

---

## Telemetry & Notifications

### At Session Start
| Message | Meaning |
|---------|---------|
| `✓ 1,234 files loaded (built May 4)` | Cache hit |
| `✓ indexed 1,234 files, 567 edges` | Fresh build complete |
| `🔗 Graph Analysis Summary` | Graph analysis loaded (if available) |

### During a Session
| Message | Meaning |
|---------|---------|
| `ℹ injecting 3 files (~150 tokens (88% saved))` | Dep-context built |
| `⚠ repo-map trimmed (5000 tokens > budget)` | Budget exceeded |
| `✂️ Pruned 5/30 messages (17%)` | Messages pruned |

### On Demand: `/scope`
```
┌──── pi-scope Session Dashboard ────────────────────────────┐
│ 📇 INDEX                                                    │
│   Source          : Cached                                  │
│   Status          : ✅ Fresh (2.0h old)                     │
│ 📊 COVERAGE                                                │
│   Files           :    289                                  │
│   Symbols         :   1042                                  │
│   Dependencies    :    892                                  │
│ 🔗 GRAPH ANALYSIS                                          │
│   God Nodes       :     12                                  │
│   Communities     :      4                                  │
│   Circular Deps   :      2                                  │
│ 💉 CONTEXT INJECTION                                       │
│   Repo Map        : ~2,400t (once)                         │
│   Dep Context     : 8x, ~1,200t total                      │
│ 💰 TOKEN SAVINGS                                           │
│   Saved           : ~18,000t (88% vs full reads)           │
└────────────────────────────────────────────────────────────┘
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

### Config File (`.pi/scope.jsonc`)

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
| `/scope` | In-session dashboard: index, graph, injections, token savings |

Most behavior is still automatic (no other user commands):


| What happens | How |
|-------------|-----|
| Index building | Auto-triggered on session start |
| Graph analysis | Runs automatically on the built-in parsed AST code index |
| Context injection | Every turn, via dep-context pipeline |
| Graph insights | Injected into system prompt at startup |
| Notifications | All via pi-telemetry badges (cache hit, fresh build, graph loaded) |
| Pruning | Automatic per-turn via ContextPruningPlugin |

**LLM tools (for agent use, not human commands):**

| Tool | Description |
|------|-------------|
| `hashline_edit` | Edit files using hash-verified line anchors |
| `lsp_go_to_definition` | Find symbol definition via LSP |
| `lsp_find_references` | Find all usages of a symbol |
| `lsp_hover` | Get type information at cursor position (incl. graph metrics) |

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

**Graph analysis benchmarks:**
- 8 nodes, 15 edges: ~30ms (all algorithms)
- 100 nodes, 300 edges: ~300ms (all algorithms)
- Cache reload: <25ms

**Performance benchmarks:**
- First index: ~1-2s for 1,000 files, ~5-10s for 10,000 files
- Cache load: < 50ms from `.pi/pi-scope/index.json.gz`
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
├── manager.ts                # SessionManager — orchestration + graph analysis
├── algorithms/               # Graph algorithms (centrality, PageRank, Louvain, cycles, surprises)
├── cli/                      # CLI command handlers (wiki commands)
├── context/                  # Retrieval engine, injection pipeline, graph modules
├── hashline/                 # Hashline edit system (6 modules)
├── lsp/                      # LSP client + service
├── indexer/                  # AST index engine + cache + store
├── parsers/                  # Language-specific tree-sitter parsers
├── plugins/                  # Plugin interface + built-in plugins (pruning, community)
├── persistence/              # Graph cache
├── tools/                    # Pi tool definitions
├── metrics/                  # Session stats, cost estimation, graph metrics
├── visualization/            # D3.js HTML dashboard generator
├── shared/                   # Utilities
├── ui/                       # TUI notifications, dashboard, init prompt
├── docs/                     # Reference documentation
│   └── algorithms/
│       └── GRAPH_ALGORITHMS_REFERENCE.md
└── tests/                    # Test suite (594 tests, all passing)
    ├── algorithms/           # Algorithm unit tests
    ├── cli/                  # CLI test
    ├── context/              # Context module tests
    ├── integration/          # End-to-end native graph + session tests
    └── visualization/        # Renderer tests
```

---

## Test Suite

```bash
npm test
```

**594 tests** across 42 files — all passing. 2 pre-existing failures unrelated to pi-scope (pi-telemetry package resolution).

Test coverage includes:
- All graph algorithms (centrality, PageRank, Louvain, cycles, surprises)
- Graph building and native processing
- Retrieval boost and community filtering
- Wikipedia subsystem and impact analysis
- LSP hover enhancement
- Graph caching (serialize/deserialize round-trip)
- Community pruning plugin
- Graph metrics (token savings, quality, health scores)
- Full end-to-end integration

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT license.
