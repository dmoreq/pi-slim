# Naming & Folder Structure Refactor — pi-slim v0.5.0

## Problems Identified

### 1. `injectors/` — Vague Name
Contains 5 files that all do **context injection** for the LLM system prompt. The name "injectors" is too generic — it could mean anything.

| File | Actual Purpose |
|------|---------------|
| `repo-map.ts` | Generates repo directory tree with exported names |
| `dep-context.ts` | Builds dependency skeleton injection for mentioned files |
| `context-files.ts` | Loads AGENTS.local.md/CLAUDE.local.md |
| `guidance.ts` | Loads provider-specific guidance files |
| `pipeline.ts` | Orchestrates the injection pipeline (budget allocation) |

**✅ Fix:** Rename to `context/` — all are context injection modules.

### 2. `parsers/` — Contains Both Interface + Implementations
`language-parser.ts` is a 6-line interface. The 3 implementations (`typescript-parser.ts`, `python-parser.ts`, `rust-parser.ts`) are in the same dir. Clean — keep as-is.

### 3. `plugins/` — Duplicate Concerns
`pruning-rules.ts` contains the **pure logic** (dedup, supersede, error-purge). `context-pruning.ts` is the **plugin wrapper** that integrates via PluginManager.

**✅ Fix:** Merge into `context-pruning.ts` — the separation adds no value since there's only one consumer.

### 4. `tools/` — Mixed Concerns
Contains:
- `hashline-editor.ts` — tool wrapping hashline core
- `lsp-navigation.ts` — tools wrapping LSP service
- `lsp-navigation-service.ts` — LSP service singleton (not a tool)

`lsp-navigation-service.ts` is a **service layer**, not a tool. It shouldn't be in `tools/`.

**✅ Fix:** Move `lsp-navigation-service.ts` → `lsp/service.ts`. Keep tool registrations in `tools/`.

### 5. `config/` — Two Files Already Well Divided
`schema.ts` = Zod schema + defaults. `loader.ts` = file I/O + config loading. Keep as-is.

### 6. `indexer/` — Three Files, Clear Naming
`engine.ts` = tree-sitter indexing. `cache.ts` = disk cache. `index-store.ts` = save/load. Keep as-is.

### 7. `detect/` — Single File in Its Own Directory
`file-detector.ts` detects file paths in tool calls. This is really a **shared utility** — it belongs in `shared/`.

### 8. `persistence/` — Single File
`runtime-state.ts` persists session state. Keep as `persistence/` — clear enough. Or merge into `shared/` since it's a utility.

### 9. `metrics/` — Two Files
`cost-estimator.ts` estimates token cost savings. `tracker.ts` tracks session stats. Keep as `metrics/`.

### 10. `ui/` — Single File
`notifications.ts` formats notifications/status bar. Keep as `ui/`.

### 11. `lsp/` — Four Files, All LSP
`client.ts`, `launch.ts`, `language.ts`, `path-utils.ts`. Plus `lsp/service.ts` if we move it here.

### 12. `shared/` — 7 Files, Too Broad
Contains types, utilities, and plugin infrastructure. This is the "catch-all" bucket.

**✅ Fix:** Split into specific sub-modules:
- `shared/types.ts` → keep (core types)
- `shared/plugin.ts` + `shared/plugin-manager.ts` → keep (plugin system, separate concern)
- `shared/token.ts` → keep (token estimation utility)
- `shared/paths.ts` → keep (path utilities)
- `shared/message.ts` → keep (message extraction utilities)
- `shared/telemetry-helpers.ts` → keep (telemetry utilities)
- `shared/file-detector.ts` → moved from `detect/`
- `shared/runtime-state.ts` → moved from `persistence/`

### 13. Root Files
`extension.ts`, `manager.ts`, `vitest.config.ts` — keep.

### 14. Tests Mirror Source
Tests currently mirror source structure (`tests/injectors/` → source `injectors/`). This is good — keep.

### 15. Empty/Dead Directories
- `core/` — empty (was deleted in v0.4.0 cleanup). Remove.
- `types/` — empty (never had files). Remove.

## Proposed New Structure

```
pi-slim/
├── extension.ts                  ← Pi extension wiring
├── manager.ts                    ← SessionManager (orchestrator)
├── vitest.config.ts
├── tsconfig.json
├── package.json
│
├── context/                      ← WAS: injectors/ + config/
│   ├── config.ts                 ← WAS: config/loader.ts
│   ├── schema.ts                 ← WAS: config/schema.ts (Zod)
│   ├── pipeline.ts               ← WAS: injectors/pipeline.ts
│   ├── repo-map.ts               ← WAS: injectors/repo-map.ts
│   ├── dep-context.ts            ← WAS: injectors/dep-context.ts
│   ├── context-files.ts          ← WAS: injectors/context-files.ts
│   └── guidance.ts               ← WAS: injectors/guidance.ts
│
├── hashline/                     ← Pure hashline modules (KEEP)
│   ├── line-hash.ts
│   ├── normalize.ts
│   ├── core.ts
│   ├── diff.ts
│   ├── diff-preview.ts
│   └── streaming.ts
│
├── lsp/                          ← LSP client (was lsp/ + tools/lsp-navigation-service.ts)
│   ├── client.ts
│   ├── launch.ts
│   ├── language.ts
│   ├── path-utils.ts
│   └── service.ts                ← WAS: tools/lsp-navigation-service.ts
│
├── indexer/                      ← AST indexing (KEEP)
│   ├── engine.ts
│   ├── cache.ts
│   └── index-store.ts
│
├── parsers/                      ← Language parsers (KEEP)
│   ├── language-parser.ts
│   ├── typescript-parser.ts
│   ├── python-parser.ts
│   └── rust-parser.ts
│
├── plugins/                      ← Plugin system (KEEP, MERGE pruning-rules into context-pruning)
│   ├── plugin.ts                 ← WAS: shared/plugin.ts
│   ├── plugin-manager.ts         ← WAS: shared/plugin-manager.ts
│   ├── context-pruning.ts        ← WAS: plugins/context-pruning.ts (merged pruning-rules logic)
│   └── read-awareness.ts
│
├── tools/                        ← Pi tools (KEEP, move service out)
│   ├── hashline-editor.ts
│   └── lsp-navigation.ts
│
├── metrics/                      ← Metrics & stats (KEEP)
│   ├── tracker.ts
│   └── cost-estimator.ts
│
├── shared/                       ← Utilities (was shared/ + detect/ + persistence/)
│   ├── types.ts
│   ├── token.ts
│   ├── paths.ts
│   ├── message.ts
│   ├── telemetry-helpers.ts
│   ├── file-detector.ts          ← WAS: detect/file-detector.ts
│   └── runtime-state.ts          ← WAS: persistence/runtime-state.ts
│
├── ui/                           ← UI helpers (KEEP)
│   └── notifications.ts
│
├── skills/                       ← pi skill definitions (KEEP)
│   └── pi-slim/SKILL.md
│
├── docs/                         ← Documentation (KEEP)
│   ├── architecture.md
│   ├── cleanup-plan.md
│   └── hashline-integration-plan.md
│
└── tests/                        ← Mirrors source structure
    ├── context/                  ← WAS: tests/injectors/ + tests/config/
    ├── hashline/
    ├── indexer/
    ├── parsers/
    ├── plugins/
    ├── shared/
    ├── metrics/
    ├── ui/
    └── ...
```

## Key Improvements

| Before | After | Rationale |
|--------|-------|-----------|
| `injectors/` | `context/` | "injectors" is vague — "context" describes what it builds |
| `config/` (separate) | `context/config.ts` | Config is part of context management — same concern |
| `detect/file-detector.ts` | `shared/file-detector.ts` | Single utility file doesn't need its own directory |
| `persistence/runtime-state.ts` | `shared/runtime-state.ts` | Single utility file doesn't need its own directory |
| `tools/lsp-navigation-service.ts` | `lsp/service.ts` | Service belongs with the LSP client, not the tools |
| `shared/plugin.ts` + `shared/plugin-manager.ts` | `plugins/plugin.ts` + `plugins/plugin-manager.ts` | Plugin interface and manager belong with the plugins |
| `plugins/pruning-rules.ts` (separate) | Merged into `plugins/context-pruning.ts` | Only one consumer — no need for separation |
| `core/`, `types/` (empty) | Removed | Dead directories |

## Files Changed

| File | Action |
|------|--------|
| `injectors/pipeline.ts` | Move to `context/pipeline.ts` |
| `injectors/repo-map.ts` | Move to `context/repo-map.ts` |
| `injectors/dep-context.ts` | Move to `context/dep-context.ts` |
| `injectors/context-files.ts` | Move to `context/context-files.ts` |
| `injectors/guidance.ts` | Move to `context/guidance.ts` |
| `config/loader.ts` | Move to `context/config.ts` |
| `config/schema.ts` | Move to `context/schema.ts` |
| `detect/file-detector.ts` | Move to `shared/file-detector.ts` |
| `persistence/runtime-state.ts` | Move to `shared/runtime-state.ts` |
| `tools/lsp-navigation-service.ts` | Move to `lsp/service.ts` |
| `shared/plugin.ts` | Move to `plugins/plugin.ts` |
| `shared/plugin-manager.ts` | Move to `plugins/plugin-manager.ts` |
| `plugins/pruning-rules.ts` | Merge into `plugins/context-pruning.ts` |
| `manager.ts` | Update all import paths |
| `extension.ts` | Update all import paths |
| `tests/` | Mirror all file moves |
| `tsconfig.json` | Update `include` paths |
| `package.json` | Update `files` field |

## Effort

- Phase 1: Move files, update imports — **15 min**
- Phase 2: Merge `pruning-rules.ts` into `context-pruning.ts` — **5 min**
- Phase 3: Update tests — **10 min**
- Phase 4: Run tests, fix any path issues — **5 min**
- Phase 5: Update CHANGELOG, commit, tag — **5 min**

**Total: ~40 minutes**
