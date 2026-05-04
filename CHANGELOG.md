# Changelog

## [0.5.0] - 2026-05-04

### Changed (Naming & Folder Structure Refactor)

| Directory | Before | After | Rationale |
|-----------|--------|-------|----------|
| `injectors/` + `config/` | 7 files in 2 dirs | `context/` (7 files) | "injectors" is vague — "context" describes what it builds. Config is part of context. |
| `detect/` + `persistence/` | 2 single-file dirs | Merged into `shared/` | Single utility files don't need their own directories. |
| `shared/plugin.ts` + `plugin-manager.ts` | In `shared/` | `plugins/` | Plugin interfaces belong with the plugins, not in a catch-all shared bucket. |
| `tools/lsp-navigation-service.ts` | In `tools/` | `lsp/service.ts` | Service belongs with the LSP client, not among tool registrations. |
| `plugins/pruning-rules.ts` | Separate file | Merged into `context-pruning.ts` | Only one consumer — unnecessary split. |

**Deleted empty directories**: `injectors/`, `config/`, `detect/`, `persistence/`, `core/`, `types/`

### Impact
- All 300 tests passing, tsc clean
- Import paths updated across 40+ files
- No functional changes — pure reorganization

## [0.4.0] - 2026-05-04

### Removed (Dead Code Cleanup)
- **Deleted `core/context-monitor.ts`** — unused. SessionManager tracks everything inline.
- **Deleted `automation/`** (4 files: auto-compactor, auto-recapper, automation-manager, triggers) — all dead code, never wired into production.
- **Deleted `metrics/metrics-collector.ts`** — never instantiated.
- **Deleted `shared/lifecycle.ts`** — consolidated the only-used `ensureRegistered()` pattern into `manager.ts`. Removed 200+ lines of unused hooks/helpers.
- **Deleted 9 planning documents** — merge/planning docs from context-intel adoption (all phases complete): `00_START_HERE.md`, `EXECUTIVE_SUMMARY.txt`, `CODE_PATTERNS.md`, `IMPLEMENTATION_ROADMAP.md`, `INTEGRATION_SUMMARY.md`, `MERGE_PLAN.md`, `QUICK_START.md`, `README_MERGE.md`, `docs/hashline-extension-plan.md`, `docs/adopt-lsp-navigation-plan.md`.
- **Deleted 6 orphaned test files** — tests for deleted modules.

### Changed
- Consolidated `shared/types.ts` — removed duplicate `SessionStats` interface (now imported from metrics/tracker only).
- Cleaned `package.json` `files` field — removed deleted directories.
- Cleaned `tsconfig.json` — removed deleted directory references.

### Code Metrics
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Production LOC | ~8,434 | ~6,743 | **−1,691 (−20%)** |
| Source files | 48 | 36 | **−12** |
| Test files | 33 | 25 | **−6** |
| Tests | 419 | 300 | **−29** (tests of deleted modules) |
| Stale docs | 136KB | 0KB | **−136KB** |
| Dead code | ~1,097 lines | 0 | **−100%** |

## [0.3.0] - 2026-05-04

### Added
- **Hashline Edit System** — precise line-targeted edits via hash-verified anchors (no file re-read needed):
  - `hashline/line-hash.ts` — xxHash32 bigram hashing (compatible with oh-my-pi/Bun, uses xxhash-wasm)
  - `hashline/normalize.ts` — line ending, BOM, Unicode, and indentation normalization utilities
  - `hashline/core.ts` — anchor parsing, hash validation, auto-rebase, edit application, diff preview
  - `hashline/diff.ts` — numbered-line diff generation for hashline previews
  - `hashline/diff-preview.ts` — compact diff preview builder (pairs -/+ into modifications)
  - `hashline/streaming.ts` — streaming hashline-formatted output for large files
- **94 new tests** across 5 test files for hashline modules (419 total, all passing)
- **New dependencies**: `xxhash-wasm` (replace `Bun.hash.xxHash32`), `diff` (for diff generation)
- **`hashline_edit` tool** — registered via `defineTool`/`registerTool`, wraps hashline core with file I/O:
  - Handles file read, BOM/line-ending normalization, edit validation, write-back
  - Auto-rebases anchors within ±5 lines on hash mismatch
  - File creation via `append`/`prepend` loc when file doesn't exist
  - Returns compact diff preview with added/removed line counts
  - Hashline usage guidance injected into system prompt via `before_agent_start`
- **`/hashline-read` command** — reads a file and outputs hashline-annotated content
- **LSP Navigation System** — three tools for code intelligence:
  - `lsp_go_to_definition` — find where a symbol is defined
  - `lsp_find_references` — find all usages of a symbol
  - `lsp_hover` — get type info and documentation at cursor
  - Lazy server startup (TypeScript, Python, Go, Rust) on first call
  - Graceful shutdown on session end
  - Wraps the adopted LSP client from pi-lens in `lsp/`

### SOLID / DRY Compliance
| Principle | Implementation |
|-----------|---------------|
| **S** (SRP) | Each hashline module does ONE thing: hashing, normalization, editing, diffing, or streaming |
| **O** (OCP) | New edit operations via `HashlineEdit` union type — no core switch changes |
| **L** (LSP) | `HashlineMismatchError` extends `Error` — all existing handlers work unchanged |
| **I** (ISP) | Streaming is a separate module, not mixed into core logic |
| **D** (DIP) | Core depends on pure `line-hash.ts` functions, not on file I/O |
| **DRY** | All normalization/hashing/diff logic lives once. No duplication with other edit tools |

## [0.2.0] - 2026-05-04

### Added
- **ExtensionLifecycle base class** (SRP) — base class for lifecycle-aware extensions with telemetry helpers
- **Plugin system** (OCP) — Plugin interface + PluginManager for extensible architecture
- **ContextMonitor** — single source of truth for session state tracking (messages, tool calls, files, tokens)
- **ContextPruningPlugin** — automatic message pruning with 3 rules:
  - Deduplication (remove identical consecutive messages)
  - Superseded Writes (remove old writes superseded by newer ones)
  - Error Purging (remove errors followed by success)
- **ReadAwarenessPlugin** — prevents edits to files that haven't been read first
- **AutomationManager** — trigger-based automation system with 4 built-in triggers:
  - `recap-hint`: Suggest `/recap` after 20+ messages and 10 min idle
  - `context-warning`: Warn when context window > 80% full
  - `file-tracking`: Suggest handoff prep when 10+ files modified
  - `high-activity`: Suggest recap when 50+ tool calls
- **AutoRecapper** — session recap generation for handoff and summarization
- **AutoCompactor** — conversation compaction via pruning rules + message limits
- **MetricsCollector** — centralized metrics collection for pi-telemetry
- **Telemetry helpers** (DRY) — 6 consolidated functions replacing ~50 lines of inline telemetry calls
- **325 tests** (200 new) across 28 test files — 0 regressions

### Changed
- **SessionManager refactored** — now extends ExtensionLifecycle, uses PluginManager, consolidated telemetry
- **INJECTION_HANDLERS removed** — replaced by plugin-based injection via PluginManager
- **Architecture docs updated** — added plugin system, automation, telemetry layers
- **README expanded** — added sections on pruning, automation, plugins, telemetry
- **Types merged** — TokenUsage and SessionStats added to shared/types.ts from context-intel

### Fixed
- Edge case in hashContent when message content is undefined
- Missing error boundaries in plugin hook execution
- Telemetry null-safety in all helper functions

### Technical Debt
- SOLID principles enforced: SRP, OCP, LSP, DIP, ISP, DRY
- ~120KB of new production code across 15 source files
- All TypeScript compiles with strict mode — zero errors
- All tests pass with zero regressions

## [0.1.0] - 2024-11-XX

### Added
- Initial release
- AST indexing with tree-sitter (TypeScript, Python, Rust)
- Repo map injection
- Dependency context injection
- Config file support (.pi/slim.jsonc)
- Zero-config auto-indexing
- Gzip-compressed cache

## [0.0.1] - 2024-10-XX

### Added
- Proof of concept
- Basic file walking and skeleton extraction
- Single-language support (TypeScript)
