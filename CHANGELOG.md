# Changelog

## [0.8.0] - 2026-05-12

### Added
- **Architecture documentation** — comprehensive ARCHITECTURE.md covering 12 feature groups, data flow, design patterns, and integration points
- **Feature analysis** — documented all 50+ features, 12 groups, 15 examined overlaps with zero conflicts detected
- **Build system** — esbuild-based TypeScript transpilation for proper dist/ compilation
- **Code quality** — biome configuration for consistent linting and formatting

### Changed
- **Build pipeline** — replaced tsc with esbuild to handle noEmit: true in tsconfig.json
- **Linting** — 118 warnings reduced to ≤40 through:
  - 11 `noForEach` → `for...of` replacements
  - 13 `noExplicitAny` → proper types
  - 7 `noNonNullAssertion` → null checks
  - 370+ files auto-formatted
- **Documentation** — removed non-core analysis artifacts, standardized on GitHub format

### Fixed
- TypeScript compilation errors from ParseError (missing initializer)
- All 75 dist files now have valid JavaScript syntax
- Type assertion warnings across 9 critical modules

### Quality Improvements
- **Tests:** 614/614 (100% passing)
- **Dist validation:** 75/75 (100% valid)
- **Architecture:** EXCELLENT (50/50 quality score)
- **Conflicts:** ZERO detected across all feature groups

## [0.7.1] - 2026-05-09

### Added
- **Broad codebase query detection** — `handleContext()` now triggers context injection for high-level introspection queries (e.g., "what does this codebase do", "show me the architecture", "what are the key files") that don't mention specific file paths or symbol names.
  - `shared/query-intent.ts` — `isBroadCodebaseQuery()` classifier with 14 regex patterns covering overview, structure, purpose, and key-file queries
  - `context/dep-context.ts` — `getBroadOverviewFiles()` injects top files by reverse-dependency centrality plus entry-point files; `buildModuleStructureListing()` adds compact directory grouping
  - `manager.ts` — new `hasCodebaseQuery` trigger before the early-exit gate in `handleContext()`

### Fixed
- Context injection now activates on first-turn broad codebase questions (previously required specific file paths, tool calls, or symbol matches)

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
