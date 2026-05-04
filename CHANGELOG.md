# Changelog

## [0.7.0] - 2026-05-04

### Added
- **Intelligent Retrieval** — scored file retrieval via symbol index, filename matching, and dependency proximity
  - `context/retrieval.ts` — RetrievalEngine with multi-signal scoring (3×symbolMatch + 2×filenameMatch + 1×depProximity)
  - Symbol exports extracted from all 3 parsers (TypeScript, Python, Rust) into `FileIndex.exports[]`
  - Inverted symbol index (`symbol→files[]`) built during graph construction
  - Reverse dependency index (`file→dependents[]`) for impact analysis
- **Transitive dependency resolution** — configurable via `dependencyDepth` (1-3, default 1)
- **Hashline dry-run mode** — `dry_run: true` validates anchors and shows diff without writing
- **Pruning telemetry** — `✂️ Pruned 5/30 (17%)` notifications via pi-telemetry
- **Repo map relevance sorting** — files sorted by modification time (most recent first)
- **Compact unified guidance** — 5-line tool overview in system prompt covering hashline + LSP

### Changed
- `ContextInjector.buildInjection()` — accepts optional `RetrievalEngine` and `transitiveDepth` params
- `RepositoryIndex` now includes `reverseDeps` and `symbolIndex` fields
- Manager wired retrieval into session state with `s.retrieval` field
- Pruning plugin fires telemetry notifications on each cycle

### Package Rename
- Package renamed from `pi-slim` to `pi-scope`
- Skill directory: `skills/pi-slim/` → `skills/pi-scope/`
- All internal docs, comments, and identifiers updated

## [0.6.0] - 2026-05-04

### Changed
- **Documentation rewrite** — README, CONTRIBUTING, architecture, SKILL.md fully updated to reflect current codebase
- **Stale code removed** — `recordAutomation()` dead function, stale "automation" comments in manager/plugin/telemetry
- **Stale docs deleted** — cleanup-plan, naming-refactor-plan, hashline-integration-plan execution docs

## [0.5.0] - 2026-05-04

### Changed
- **Naming & folder structure refactor** — `injectors/` → `context/`, `detect/` + `persistence/` → `shared/`, plugins consolidated

## [0.4.0] - 2026-05-04

### Removed
- **Dead code cleanup** — `core/context-monitor.ts`, `automation/` (4 files), `metrics/metrics-collector.ts`, `shared/lifecycle.ts`
- **~1,691 LOC removed** (−20%), **10 stale docs** deleted

## [0.3.0] - 2026-05-04

### Added
- **Hashline edit system** — 6 pure modules extracted from oh-my-pi: `hashline/line-hash.ts`, `normalize.ts`, `core.ts`, `diff.ts`, `diff-preview.ts`, `streaming.ts`
- **`hashline_edit` tool** — registered via `defineTool`, wraps hashline core with file I/O
- **LSP navigation** — 3 tools (`lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`) + LSP service
- **94 new tests** (419 total)

## [0.2.0] - 2026-05-04

### Added
- **Context intelligence adoption** from pi-me — ExtensionLifecycle, Plugin system, ContextMonitor, pruning plugins, automation triggers
- **Telemetry helpers** for consolidated pi-telemetry integration
- **325 tests** across 28 test files

## [0.1.0] - 2024

### Added
- Initial release — AST indexing with tree-sitter, repo map, dependency context, config file support
