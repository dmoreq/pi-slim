# pi-slim

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/pi-slim)](https://www.npmjs.com/package/pi-slim)

**AST-powered project context for [pi](https://github.com/mariozechner/pi-coding-agent).** Reduces token waste by injecting compact code skeletons (not full files) into every LLM call, with automatic import resolution and dependency awareness.

- **~85-92% token reduction** per referenced file vs. full-file reads
- **Zero-config** — auto-indexes on first session
- **Dependency-aware** — mentions `foo.ts` and gets its imports too
- **Multi-language** — TypeScript, Python, Rust (extensible)

---

## Table of Contents

- [Installation](#installation)
- [How It Works](#how-it-works)
- [Injection Layers](#injection-layers)
- [Configuration](#configuration)
- [Commands](#commands)
- [Supported Languages](#supported-languages)
- [Performance](#performance)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```bash
pi install git:github.com/dmoreq/pi-slim
```

Restart pi. First session in each project indexes your source files (~1-2s for 1,000 files). Subsequent sessions load from cache instantly.

---

## How It Works

### Session start: AST indexing

1. **Walk** — scans all `.ts`, `.tsx`, `.py`, `.rs` files (respects `.gitignore` and configurable `exclude` patterns)
2. **Parse** — each file is parsed via [tree-sitter](https://tree-sitter.github.io/)
3. **Extract** — only signatures are kept (function headers, class shapes, type definitions) — no bodies, no comments
4. **Graph** — import statements are resolved into a one-directional dependency graph
5. **Cache** — gzip-compressed index saved to `.pi/slim/` for instant reload

### Every LLM call: context injection

The pipeline injects up to four layers per turn, ordered by priority and trimmed to a shared token budget:

| Layer | Frequency | What it provides |
|-------|-----------|-----------------|
| `<repo-map>` | Once (first turn) | Directory tree with exported names per file |
| `<dep-context>` | Every turn | Skeleton signatures for mentioned files + 1st-degree imports |
| `<context-files>` | Once | AGENTS.local.md, CLAUDE.local.md (if present) |
| `<provider-guidance>` | Once | Provider-specific CLAUDE.md / CODEX.md / GEMINI.md |

---

## Injection Layers

### `<repo-map>`

Compact project overview — injected once into the system prompt:

```xml
<repo-map>
  (root)
    index.ts  createApp, defineRoutes
    src/
      auth.ts  authenticate, authorize
    config/
      db.ts  DatabaseConfig
</repo-map>
```

Use this to answer "where does X live?" without reading any files.

### `<dep-context>`

When you mention a file (e.g., `src/auth.ts`), pi-slim injects its skeleton plus the skeletons of everything it directly imports:

```xml
<dep-context>
## Active files
### src/auth.ts
export function authenticate(token: string): User { ... }
export function authorize(role: Role): boolean { ... }

## Direct dependencies
### src/auth/models.ts
export interface User { ... }
export enum Role { ... }
</dep-context>
```

Skeletons are **function/class signatures only** — ~8-15% of full file size.

### `<context-files>` / `<provider-guidance>`

Loads project-local markdown files from ancestor directories (`.pi/`, project root, home):
- **Context files:** AGENTS.local.md, CLAUDE.local.md
- **Guidance:** CLAUDE.md (Anthropic), CODEX.md (OpenAI), GEMINI.md (Google)

---

## Configuration

### CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `slim.enabled` | boolean | `true` | Master switch |
| `slim.maxRepoMapTokens` | number | `4000` | Token budget for repo map |
| `slim.maxInjectionTokens` | number | `8000` | Token budget for per-turn dep-context |
| `slim.scanLastNMessages` | number | `10` | Messages to scan for file mentions |
| `slim.contextFiles.enabled` | boolean | `true` | Load AGENTS.local.md etc. |
| `slim.contextFiles.filenames` | string | `AGENTS.local.md,CLAUDE.local.md` | Comma-separated filenames |
| `slim.providerGuidance.enabled` | boolean | `true` | Load CLAUDE.md/CODEX.md/GEMINI.md |

### Config file (`.pi/slim.jsonc`)

Project-local config overrides CLI flags:

```jsonc
{
  // Reduce repo map for large projects
  "maxRepoMapTokens": 2000,
  // Skip generated and vendor files
  "exclude": ["**/node_modules/**", "**/vendor/**", "**/*.generated.*"],
  // Disable context files if not needed
  "contextFiles": { "enabled": false }
}
```

Global config at `~/.pi/agent/slim.jsonc` applies to all projects; project config overrides global.

### Config priority

1. **CLI flags** (highest)
2. **Project config** (`.pi/slim.jsonc`)
3. **Global config** (`~/.pi/agent/slim.jsonc`)
4. **Hardcoded defaults**

---

## Commands

| Command | Description |
|---------|-------------|
| `/slim` | Show injection stats for the current or last session |

Example output:

```
── slim session stats ──────────────────
  Index source     : fresh
  Files indexed    : 1,234
  Dep edges        : 567
  Repo map         : ~3,500t (once)
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
  Unique files seen: 45
─────────────────────────────────────────
```

---

## Supported Languages

| Language | Extensions | Skeletons | Import Resolution |
|----------|-----------|-----------|-------------------|
| TypeScript | `.ts`, `.tsx` | Classes, functions, interfaces, types, enums | Relative `./foo`, `../bar` |
| Python | `.py` | Classes, function signatures (indented) | Relative `from .module` |
| Rust | `.rs` | `fn`, `struct`, `enum`, `trait`, `impl` | `mod x;`, `use crate::`, `use super::` |

To add a language: implement the `LanguageParser` interface — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Performance

- **First index:** ~1-2 seconds for 1,000 files, ~5-10s for 10,000 files
- **Cache load:** < 50ms from `.pi/slim/index.json.gz`
- **Disk size:** Gzip-compressed index is ~84% smaller than raw JSON
- **Token savings:** Skeletons are 8-15% of full file size — 85-92% saved per referenced file

### Tuning

For large projects, increase exclusion patterns or reduce token budgets in `.pi/slim.jsonc`:

```jsonc
{
  "exclude": ["**/node_modules/**", "**/*.test.ts", "**/examples/**"],
  "maxRepoMapTokens": 2000,
  "maxInjectionTokens": 6000
}
```

If you see `trimmed` warnings in the log, increase the budget.

---

## Development

```bash
npm install              # install dependencies
npm test                 # run tests (vitest)
npm run build            # compile TypeScript
npm run test:watch       # watch mode
```

### Project structure

```
pi-slim/
├── extension.ts              # Extension entry point (lifecycle wiring)
├── manager.ts                # Session lifecycle and orchestration
├── shared/                   # Shared utilities (types, paths, token, message)
├── config/                   # Config schema and loader
├── indexer/                  # Index engine, disk cache, persistent store
├── injectors/                # Context injection pipeline and sources
├── detect/                   # File path detection from messages/tools
├── metrics/                  # Token tracking and cost estimation
├── parsers/                  # Language-specific AST parsers
├── persistence/              # Runtime state file I/O
├── ui/                       # TUI notification formatting
├── skills/                   # pi skill definitions
├── tests/                    # Test suite (mirrors source structure)
└── docs/                     # Architecture documentation
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and how to add a language parser or injection source.

---

## License

MIT — see [LICENSE](LICENSE)
