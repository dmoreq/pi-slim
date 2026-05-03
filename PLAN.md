# pi-slim: Optimization & Refactor Plan

**Goal:** Reduce token waste for LLM agents via DRY code, SOLID architecture, and cost-aware design.
**Target:** v1.0.0 — production-ready plugin.

---

## 1. Code Review Findings

### 1.1 DRY Violations

| # | Violation | Location | Impact |
|---|-----------|----------|--------|
| D1 | `estimateTokens()` defined 3× | `index.ts:115`, `context-injector.ts:19`, `pipeline.ts:155` | Fix one → others stale |
| D2 | `textOf()` / `textContent()` — same logic, different names | `index.ts:110`, `context-injector.ts:13` | Confusion, maintenance tax |
| D3 | `DEFAULT_CONFIG` in `types.ts` duplicated in `config.ts` zod defaults | `types.ts:27`, `config.ts:26` | Two sources of truth |
| D4 | `.pi/smart-context` path hardcoded in `store.ts` AND `state.ts` AND `stats.ts` | `store.ts:12`, `state.ts:36`, `stats.ts:145` | Path change requires 3 edits |
| D5 | `summary()` / `report()` field mapping duplicated with field names | `stats.ts:100-155` | Adding a stat requires 4+ edits |

### 1.2 SOLID Violations

| # | Principle | Violation | Location |
|---|-----------|-----------|----------|
| S1 | SRP | `index.ts` handles: flags, config, session lifecycle, pipeline orchestration, message scanning, stats, notifications | `index.ts` (500+ lines) |
| S2 | SRP | `context-injector.ts` both detects file paths AND builds injection blocks | Entire file |
| S3 | OCP | Adding a new injection source requires modifying `before_agent_start` + `switch` in `index.ts` | `index.ts:325-420` |
| S4 | OCP | Adding a new language parser requires modifying `IndexEngine` constructor | `index-engine.ts:84-86` |
| S5 | ISP | `SessionState` is a flat bag of 10+ fields mixing concerns | `index.ts:131-143` |
| S6 | DIP | `index.ts` directly instantiates all dependencies | `index.ts:240-270` |

### 1.3 Token Waste Opportunities

| # | Issue | Estimated waste | Fix |
|---|-------|----------------|-----|
| T1 | `<repo-map>` and `<dep-context>` may overlap — same file skeletons appear in both | 10-30% first-turn tokens | Dedup across injection sources |
| T2 | `scanLastNMessages=10` always scans 10 even if only 1 has file refs | ~20% scanning overhead | Early-exit when no file patterns |
| T3 | Every `context` event logs notification even when no injection happens | Unnecessary console output | Gate notifications behind stats threshold |
| T4 | Provider-guidance files loaded fresh each `before_agent_start` call | Redundant I/O on cold start | Cache loaded files in session state |
| T5 | No LLM call cost tracking — can't measure savings | Missed optimization feedback | Add token savings estimates to stats |

### 1.4 Structural Issues

| # | Issue | Current | Target |
|---|-------|---------|--------|
| F1 | Flat `src/` — 13 files with no grouping | `src/context-*.ts`, `src/index-engine.ts`, etc. | `/core/`, `/injectors/`, `/indexer/` |
| F2 | Parsers in subdir, others flat — inconsistent | Only `parsers/` is nested | All modules grouped by concern |
| F3 | `bin/debug.ts` at project root | `bin/debug.ts` | `tools/debug.ts` |
| F4 | Tests flat in `tests/` | `tests/*.test.ts` | `tests/core/`, `tests/injectors/` |
| F5 | Docs mixed: skill doc + migration plan + design specs | `docs/*.md` | `docs/architecture.md`, `docs/usage.md` |

### 1.5 Naming Issues

| # | Current Name | Problem | Proposed Name |
|---|-------------|---------|---------------|
| N1 | `index.ts` | Ambiguous — index of what? | `extension.ts` |
| N2 | `index-engine.ts` | Verbose, inconsistent with module pattern | `indexer/engine.ts` |
| N3 | `disk-cache.ts` | "Disk" is implied, no other cache type | `cache/cache.ts` |
| N4 | `context-injector.ts` | Too similar to `context-files.ts` | `injectors/dep-context.ts` |
| N5 | `context-files.ts` | Too similar to `context-injector.ts` | `injectors/context-files.ts` |
| N6 | `provider-guidance.ts` | Verbose | `injectors/guidance.ts` |
| N7 | `repo-map-generator.ts` | Verbose, "Generator" is noise | `injectors/repo-map.ts` |
| N8 | `store.ts` | Ambiguous — store of what? | `indexer/index-store.ts` |
| N9 | `stats.ts` | Too generic | `metrics/tracker.ts` |
| N10 | `notify.ts` | Too generic, collides with common name | `ui/notifications.ts` |
| N11 | `state.ts` | Too generic | `persistence/runtime-state.ts` |
| N12 | `config.ts` | Collides with common naming | `config/loader.ts` |

---

## 2. Optimization Plan (6 Phases)

### Phase A: Shared Utilities (DRY Fixes)

**Goal:** Eliminate all 5 DRY violations.

**A1:** Create `src/utils/token.ts`
```typescript
/** Rough token estimation: chars ÷ 4. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
```
→ Migrate callers in `index.ts`, `context-injector.ts`, `pipeline.ts`

**A2:** Create `src/utils/message.ts`
```typescript
/** Extract text content from any message format. */
export function extractText(content: unknown): string
```
→ Merge `textOf()` and `textContent()` into one function

**A3:** Create `src/config/schema.ts`
```typescript
/** Single source of truth for SlimConfig defaults. */
export const DEFAULT_CONFIG: SlimConfig = produceDefaults()
```
→ Remove `DEFAULT_CONFIG` from `types.ts`, derive from zod schema

**A4:** Create `src/paths.ts`
```typescript
/** Unified path constants for .pi/smart-context directory. */
export const SLIM_DIR = join('.pi', 'smart-context')
export function slimDir(projectRoot: string): string
```
→ Use in `store.ts`, `state.ts`, `stats.ts`

**A5:** Refactor `SessionRecord` to use a builder pattern:
```typescript
// Instead of manual field mapping in summary(), report(), toRecord()
// Use a single `fields()` method that returns all key-value pairs
```

### Phase B: Folder Restructure + Renaming

**Goal:** Eliminate all structure and naming issues (F1-F5, N1-N12).

**New structure:**

```
src/
├── extension.ts              # (was index.ts) — entry point, lifecycle wiring
├── paths.ts                  # Unified path constants
├── types.ts                  # Core shared types
│
├── config/
│   ├── loader.ts             # (was config.ts) — loadConfig()
│   └── schema.ts             # Zod schema + DEFAULT_CONFIG (single source)
│
├── indexer/
│   ├── engine.ts             # (was index-engine.ts) — IndexEngine
│   ├── index-store.ts        # (was store.ts) — persist/load index
│   └── cache.ts              # (was disk-cache.ts) — DiskCache
│
├── injectors/
│   ├── pipeline.ts           # (pipeline.ts — keep name, it's good)
│   ├── repo-map.ts           # (was repo-map-generator.ts)
│   ├── dep-context.ts        # (was context-injector.ts)
│   ├── context-files.ts      # (keep name — clear purpose)
│   └── guidance.ts           # (was provider-guidance.ts)
│
├── detect/
│   └── file-detector.ts      # (keep name — clear purpose)
│
├── metrics/
│   └── tracker.ts            # (was stats.ts) — SessionStats
│
├── persistence/
│   └── runtime-state.ts      # (was state.ts)
│
├── ui/
│   └── notifications.ts      # (was notify.ts)
│
└── utils/
    ├── token.ts              # estimateTokens()
    └── message.ts            # extractText()
```

**Tests mirror structure:**
```
tests/
├── utils/
│   ├── token.test.ts
│   └── message.test.ts
├── config/
│   ├── loader.test.ts
│   └── schema.test.ts
├── indexer/
│   ├── engine.test.ts
│   ├── index-store.test.ts
│   └── cache.test.ts
├── injectors/
│   ├── pipeline.test.ts
│   ├── repo-map.test.ts
│   ├── dep-context.test.ts
│   ├── context-files.test.ts
│   └── guidance.test.ts
├── detect/
│   └── file-detector.test.ts
├── metrics/
│   └── tracker.test.ts
├── persistence/
│   └── runtime-state.test.ts
├── ui/
│   └── notifications.test.ts
└── parsers/
    ├── typescript-parser.test.ts
    ├── python-parser.test.ts
    └── rust-parser.test.ts
```

### Phase C: SOLID Refactoring

**Goal:** Extract responsibilities from `extension.ts` into modular classes.

**C1:** Extract `SessionManager` class
```typescript
// Manages session lifecycle, state initialization, cleanup
class SessionManager {
  start(ctx, config): Promise<SessionState>
  shutdown(): void
}
```
→ Removes 150 lines from `extension.ts`

**C2:** Extract `InjectionOrchestrator` class
```typescript
// Owns the before_agent_start pipeline logic
class InjectionOrchestrator {
  buildPipeline(session, ctx): InjectionPipeline
  recordStats(session, result): void
}
```
→ Removes 100 lines from `extension.ts`

**C3:** Extract `FileScanner` class
```typescript
// Owns the context event message scanning + extra path detection
class FileScanner {
  scanMessages(messages, projectRoot): { textMessages, extraPaths }
}
```
→ Removes 50 lines from `extension.ts`

**C4:** Register injection sources via configuration not switch statements
```typescript
// Before (OCP violation):
switch (entry.name) {
  case 'repo-map': ... break
  case 'provider-guidance': ... break
  case 'context-files': ... break
}

// After (OCP compliant):
const handlers: Record<string, InjectionHandler> = {
  'repo-map': { onInject: (s, t) => s.recordRepoMapInjection(t) },
  'provider-guidance': { onInject: (s, t, c) => s.recordGuidance(t, c) },
  'context-files': { onInject: (s, t, c) => s.recordContextFiles(t, c) },
}
```

**C5:** Language parser registry via configuration
```typescript
// indexer/engine.ts — register parsers by extension
const PARSERS: LanguageParserRegistration[] = [
  { extensions: ['.ts', '.tsx'], create: () => new TypeScriptParser() },
  { extensions: ['.py'],         create: () => new PythonParser() },
  { extensions: ['.rs'],         create: () => new RustParser() },
]
```

### Phase D: Token Cost Optimization

**Goal:** Reduce token waste and measure savings.

**D1:** Cross-injection dedup
```typescript
// pipeline.ts — dedup files between repo-map and dep-context
// When both inject the same file skeleton, include it once
```

**D2:** Early-exit message scanning
```typescript
// detect file-pattern presence before iterating all messages
if (!text.match(/\.(ts|tsx|py|rs)/)) skip this message
```

**D3:** Cost estimator
```typescript
// metrics/cost-estimator.ts
// Given a context block, estimate cost savings vs reading full files
export function estimateSavings(
  skeletonTokens: number,
  fullFileTokens: number,
  avoidedReads: number,
): CostEstimate
```

**D4:** Lazy provider-guidance caching
```typescript
// Session state caches loaded guidance files, no reload on 2nd turn
```

### Phase E: Technical Documentation

**Goal:** GitHub-standard docs for open-source release.

**E1:** `README.md` — rewritten for public audience
```
- Badge section (npm, license, CI)
- Quick start (pi install ...)
- What it does (repo map, dep context, context files, guidance)
- Configuration (flags, JSONC config)
- Token savings (benchmarks)
- Development (how to build, test, contribute)
```

**E2:** `docs/architecture.md`
```
- Data flow diagram (ASCII)
- Extension lifecycle hook map
- Component dependency graph
```

**E3:** `docs/usage.md`
```
- Installation
- Configuration reference
- Per-language support matrix
- Troubleshooting
```

**E4:** `CONTRIBUTING.md`
```
- Prerequisites
- Setup
- Code style
- Adding a language parser
- Testing guidelines
```

**E5:** `LICENSE` — MIT (consistent with pi-me)

### Phase F: Benchmarking & Release

**Goal:** v1.0.0 with measurable cost claims.

**F1:** Add benchmark mode to debug tool:
```bash
npx tsx tools/benchmark.ts --project ~/my-app
# Output:
#   Files indexed: 1,234
#   Skeleton vs full size: 8.3% (91.7% token savings)
#   Index build time: 1.2s
#   Cache load time: 0.05s
```

**F2:** Add token savings to `/smart-context` report:
```
Token savings: ~4,200 tokens saved this session (12 full reads avoided)
```

**F3:** Bump to v1.0.0, release on npm

---

## 3. Execution Order

```
Phase A (DRY fixes) ──────→ Phase B (restructure) ──────→ Phase C (SOLID)
        │                           │                           │
        ↓                           ↓                           ↓
  2-3 sessions                 1 session                   3-4 sessions
        │                           │                           │
        └──────────┬────────────────┘                           │
                   ↓                                            │
            Phase D (cost opt) ──────────────┬──────────────────┘
                   │                         │
                   ↓                         ↓
            Phase E (docs)            Phase F (benchmark)
                   │                         │
                   └──────────┬──────────────┘
                              ↓
                       v1.0.0 Release
```

---

## 4. Task Breakdown

### Phase A1: `src/utils/token.ts` + `src/utils/message.ts`

**Files to create:**
- `src/utils/token.ts` — `estimateTokens()`
- `src/utils/message.ts` — `extractText()`

**Files to modify:**
- `src/index.ts` — replace `estimateTokens()`, `textOf()`
- `src/context-injector.ts` — replace `estimateTokens()`, `textContent()`
- `src/pipeline.ts` — replace `estimateTokens()`

**Tests:** Move existing tests or create `tests/utils/token.test.ts`

### Phase A2: `src/paths.ts`

**Files to create:**
- `src/paths.ts` — `SLIM_DIR`, `slimDir()`

**Files to modify:**
- `src/store.ts` — use `slimDir()`
- `src/state.ts` — use `slimDir()`
- `src/stats.ts` — use `slimDir()`

### Phase A3: `src/config/schema.ts`

**Files to create:**
- `src/config/schema.ts` — move `SlimConfigSchema` + `DEFAULT_CONFIG` here

**Files to modify:**
- `src/types.ts` — remove `DEFAULT_CONFIG`
- `src/config.ts` → `src/config/loader.ts` — import schema from `schema.ts`

### Phase B: Folder Restructure

**New directory layout** (create directories + move files):
```
mkdir -p src/{config,indexer,injectors,detect,metrics,persistence,ui,utils}
mkdir -p tests/{config,indexer,injectors,detect,metrics,persistence,ui,utils}
```

**Move + rename files:**
- `src/index.ts` → `src/extension.ts`
- `src/config.ts` → `src/config/loader.ts`
- `src/index-engine.ts` → `src/indexer/engine.ts`
- `src/disk-cache.ts` → `src/indexer/cache.ts`
- `src/store.ts` → `src/indexer/index-store.ts`
- `src/repo-map-generator.ts` → `src/injectors/repo-map.ts`
- `src/context-injector.ts` → `src/injectors/dep-context.ts`
- `src/provider-guidance.ts` → `src/injectors/guidance.ts`
- `src/stats.ts` → `src/metrics/tracker.ts`
- `src/state.ts` → `src/persistence/runtime-state.ts`
- `src/notify.ts` → `src/ui/notifications.ts`
- `src/file-detector.ts` → `src/detect/file-detector.ts`

**Update `tsconfig.json`:**
- Keep `rootDir: "./src"` — works with subdirectories

**Update `package.json`:**
- Change `"main": "./dist/extension.js"`

### Phase C: SOLID Refactoring

Create `src/extension-manager.ts`:
```typescript
// Extracts session lifecycle + orchestration from extension.ts
export class ExtensionManager {
  private session: SessionState | null = null

  async handleSessionStart(pi, ctx): Promise<void>
  handleBeforeAgentStart(event, ctx): BeforeAgentStartResult | undefined
  handleContext(event, ctx): ContextResult | undefined
  async handleSessionShutdown(ctx): Promise<void>
}
```

Refactor `extension.ts` to:
```typescript
export default function smartContextExtension(pi: ExtensionAPI): void {
  registerFlags(pi)
  registerCommand(pi)
  
  const manager = new ExtensionManager()
  pi.on('session_start',      (e, ctx) => manager.handleSessionStart(pi, ctx))
  pi.on('before_agent_start', (e, ctx) => manager.handleBeforeAgentStart(e, ctx))
  pi.on('context',            (e, ctx) => manager.handleContext(e, ctx))
  pi.on('session_shutdown',   (e, ctx) => manager.handleSessionShutdown(ctx))
}
```

### Phase D: Cost Optimization

- Add dedup logic in `pipeline.ts:build()`
- Add early-exit in `detect/file-detector.ts`
- Create `src/metrics/cost-estimator.ts`
- Cache guidance files in session state

### Phase E: Documentation

Create:
- `README.md` (rewrite)
- `docs/architecture.md`
- `docs/usage.md`
- `CONTRIBUTING.md`
- `LICENSE`

### Phase F: Benchmark & Release

- Create `tools/benchmark.ts`
- Bump version in `package.json`
- Publish to npm

---

## 5. Token Savings Target

| Optimization | Est. token reduction | Per |
|-------------|---------------------|-----|
| Skeleton vs full file content | 85-92% | Per file |
| Cross-injection dedup | 5-15% | First turn |
| Early-exit message scan | 10-30% | Per turn with no code context |
| Lazy guidance loading | ~500 tokens | First turn |
| **Total est. savings** | **60-80%** | **Per agent turn** |

---

## 6. Success Criteria

1. All 126+ existing tests pass after restructuring
2. No regressions in injection behavior
3. `extension.ts` < 200 lines (was 500+)
4. All DRY violations eliminated (0 duplicate utility functions)
5. SOLID: OCP-compliant injection source registration
6. Cost metrics visible in `/smart-context` report
7. GitHub-standard docs (README, CONTRIBUTING, LICENSE, architecture docs)
8. v1.0.0 published on npm
