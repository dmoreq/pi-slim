---
name: pi-scope
description: AST-powered context injection, intelligent symbol-based file retrieval, graph analysis, hashline editing, and LSP code navigation for pi
---

# pi-scope: Context, Retrieval, Graph Analysis & Code Intelligence

pi-scope parses your project's source files into compact AST skeletons, retrieves files intelligently by symbol name and relevance, runs graph analysis to identify god nodes and communities, supports hash-verified editing, and provides LSP code navigation — saving ~85-97% tokens vs naive full-file reads.

## Prerequisites: Install Required Tools

Before first use, ensure the following tools are available on `$PATH`. pi-scope will detect which are present and work with what's available — missing tools just disable the corresponding feature.

### Essential (npm deps, auto-installed by pi)
```bash
# These are installed automatically when you run: pi install git:github.com/dmoreq/pi-scope
# No action needed. But verify:
npm ls diff ignore jsonc-parser pi-telemetry tree-sitter tree-sitter-python tree-sitter-rust tree-sitter-typescript vscode-jsonrpc xxhash-wasm zod 2>/dev/null | head -3
```

### LSP Servers (for code navigation — optional, one per language you use)
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

**If a server is missing, the corresponding `lsp_*` tool will log a warning and skip that language.** No crash, no blocking.

### Graph Visualization (optional — for HTML dashboard)
```bash
# No install needed — visualization is pure D3.js via CDN
# Just open the generated .html file in a browser
```

### Graph Data (built-in, no install needed)

pi-scope has its **own native TypeScript graph engine** that runs automatically on every startup:
| Algorithm | What it detects | Type |
|-----------|-----------------|------|
| Degree Centrality + PageRank | God nodes — most depended-on symbols | Built-in |
| Louvain Clustering | Communities — related module groups | Built-in |
| Tarjan SCC | Circular dependencies | Built-in |
| Surprise Detection | Cross-community edges | Built-in |

This works on the 3 languages pi-scope parses (TypeScript, Python, Rust). No install needed.

For richer graphs (15+ languages, LLM-assisted extraction), you can point pi-scope at graphifyy output:
```bash
pip install graphifyy && cd your-project && graphify .
# pi-scope auto-detects graphify-out/graph.json on next start
```

**Without graphifyy:** pi-scope runs its own graph engine. You lose nothing for TS/Py/Rust projects.

### Auto-install Command

If any LSP server is missing, this one-liner installs all of them:
```bash
npm install -g typescript typescript-language-server && pip install pyright && go install golang.org/x/tools/gopls@latest && rustup component add rust-analyzer
```

## What pi-scope Does for You

### Intelligent Retrieval (Automatic)

pi-scope finds files by **what they export**, not just their filename. When you mention a function name, it matches against the symbol index built at session start.

**Scoring:** `3×symbolMatch + 2×filenameMatch + 1×depProximity`

**Graph boost:** God nodes (highly depended-on symbols) get a 2× score multiplier. Surprising connections (cross-community edges) are injected as context breadcrumbs.

### Context Injection (Automatic — no commands needed)

| Layer | Injected | What it provides |
|-------|----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names, sorted by recency |
| `<dep-context>` | Every turn | Scored skeletons for retrieved files + transitive deps |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |
| `<graph-insights>` | Once | God nodes, communities, cycle count (if graph data available) |

All notifications about what was injected appear as pi-telemetry badges — no user commands needed.

### Graph Analysis (Automatic When graphify-out/graph.json Exists)

When `graphify-out/graph.json` is found at session start, pi-scope automatically runs:

| Algorithm | What it detects | Effect |
|-----------|-----------------|--------|
| **Degree Centrality + PageRank** | God nodes — symbols everything depends on | 2× retrieval boost, auto-injected into system prompt |
| **Louvain Clustering** | Communities — related module groups | Community pruning plugin filters irrelevant context |
| **Cycle Detection (Tarjan SCC)** | Circular dependencies | Count shown in telemetry |
| **Surprise Detection** | Cross-community edges | Injected as context breadcrumbs |

### Hashline Editing

The `hashline_edit` tool edits files using `LINE+BIGRAM` anchors. The agent sees hash-annotated content and references lines by anchor — no file re-read.

**Dry-run mode:** `dry_run: true` validates without writing.

### LSP Navigation

Three tools: `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`. When graph analysis is active, hover info includes god node status, centrality metrics, and community membership. Results auto-inject into next context.

## How Graph Data Flows Into Your Context

You do NOT need to run any commands. Here's what the agent sees in its system prompt automatically:

```
## Graph Analysis Insights
**Graph:** 144 nodes, 330 edges, 6 communities
**God Nodes (most depended-on symbols):**
  - `Client` (26 connections, CRITICAL)
  - `AsyncClient` (25 connections, CRITICAL)
  - `Response` (24 connections, IMPORTANT)
**Communities:**
  - Transport Layer: 8 nodes
  - Auth & Security: 9 nodes
  - Client API: 3 nodes
**Notable connections:**
  - `Timeout` → `URL` (cross-community)
```

**Use this information when:**
- **Suggesting which files to edit** — prioritize god nodes (they affect more code)
- **Explaining architecture** — reference communities and god nodes as landmarks
- **Assessing change risk** — god nodes with CRITICAL criticality need careful review
- **Navigating unfamiliar codebases** — start with god nodes, drill into communities

## Common Pitfalls

- **LSP servers not on $PATH:** Run the install commands above. pi-scope logs which are found and which are missing.
- **Large projects (>10K files):** Set `exclude` patterns in `.pi/slim.jsonc`
- **First-degree imports only** in dep graph (transitive configurable via `dependencyDepth`)
- **Graph data not used everywhere** — graph analysis only runs at startup; incremental code changes don't trigger re-analysis (future feature)
- **Richer graphs via graphifyy:** `pip install graphifyy && graphify .` extends graph coverage to 15+ languages and adds LLM-assisted extraction. pi-scope's native graph engine (TS/Py/Rust) works without it.
