# @pi/smart-context

**AST-powered project context for the pi coding agent.** Reduces token waste by injecting compact code skeletons (not full files) into every LLM call, automatically resolving imports and dependencies.

- **~85-92% token reduction** per referenced file vs. full-file reads
- **Zero-config** — auto-indexes your project on first session
- **Dependency-aware** — when you mention `foo.ts`, it also injects `foo`'s imports
- **Multi-language** — TypeScript, Python, Rust (extensible)

---

## Quick Start

```bash
pi install @pi/smart-context
# Or from source:
pi install /path/to/pi-smart-context
```

Restart pi. The first session in each project will index your source files (takes ~1-2 seconds for 1,000 files). Subsequent sessions load from cache instantly.

**No configuration required** — the defaults work for most projects.

---

## How It Works

### At session start

The extension builds an **AST-based index** of all `.ts`, `.tsx`, `.py`, and `.rs` files in your project:

1. **Parse** — each file is parsed via [tree-sitter](https://tree-sitter.github.io/)
2. **Extract** — only signatures are kept (function headers, class shapes, type definitions) — no bodies, no comments
3. **Graph** — import statements are resolved into a dependency graph
4. **Cache** — the index is saved to `.pi/smart-context/` for instant reload

### On every LLM call

**Before the first turn:**
```
<repo-map>  ← compact directory tree with exported names (once per session)
<context-files>  ← AGENTS.local.md, CLAUDE.md etc. (once per session)
<provider-guidance>  ← provider-specific guidance (once per session)
```

**Before every turn:**
```
<dep-context>  ← skeleton signatures for mentioned files + their imports
```

The pipeline orders these by priority and trims to a shared token budget, so you always get the most relevant context.

---

## Configuration

### CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `smart-context.enabled` | boolean | `true` | Master switch |
| `smart-context.maxRepoMapTokens` | number | `4000` | Token budget for repo map |
| `smart-context.maxInjectionTokens` | number | `8000` | Token budget for per-turn dep-context |
| `smart-context.scanLastNMessages` | number | `10` | Messages to scan for file mentions |
| `smart-context.contextFiles.enabled` | boolean | `true` | Load AGENTS.local.md etc. |
| `smart-context.contextFiles.filenames` | string | `AGENTS.local.md,CLAUDE.local.md` | Comma-separated filenames |
| `smart-context.providerGuidance.enabled` | boolean | `true` | Load CLAUDE.md/CODEX.md/GEMINI.md |

### Config file (`.pi/smart-context.jsonc`)

Project-local config with comments:

```jsonc
{
  // Reduce repo map for large projects
  "maxRepoMapTokens": 2000,
  // Enable for all languages
  "exclude": ["**/node_modules/**", "**/vendor/**"],
  // Disable context files if not needed
  "contextFiles": { "enabled": false }
}
```

Global config at `~/.pi/agent/smart-context.jsonc` overrides defaults; project config overrides global.

---

## Token Savings

The extension reports token savings in `/smart-context`:

```
── smart-context session stats ──────────────────
  ...
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
  Unique files seen: 45
─────────────────────────────────────────────────
```

A skeleton is typically **8-15%** of the full file size. You save the other 85-92%.

---

## Commands

| Command | Description |
|---------|-------------|
| `/smart-context` | Show injection stats for the current or last session |

---

## Supported Languages

| Language | Extensions | Skeletons | Imports |
|----------|-----------|-----------|---------|
| TypeScript | `.ts`, `.tsx` | Classes, functions, interfaces, types, enums | Relative `./foo`, `../bar` |
| Python | `.py` | Classes, function signatures (indented) | Relative `from .module` |
| Rust | `.rs` | `fn`, `struct`, `enum`, `trait`, `impl` | `mod x;`, `use crate::`, `use super::` |

Adding a new language: implement the `LanguageParser` interface (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Project Status

Active development. See [PLAN.md](PLAN.md) for the optimization roadmap.

### What's next

- [x] DRY utilities, shared paths, single-source schema
- [x] Concern-based folder structure (config/, indexer/, injectors/, ...)
- [x] SOLID refactoring: 80-line extension.ts, OCP handler registry
- [x] Early-exit scanning, token savings tracking
- [ ] Benchmark tool for comparing skeleton vs full-file costs
- [ ] Go and Java parser support
- [ ] NPM publish

---

## Development

```bash
npm install              # install dependencies
npm test                 # run tests (vitest)
npm run build            # compile TypeScript
npm run test:watch       # watch mode
```

---

## License

MIT — see [LICENSE](LICENSE)
