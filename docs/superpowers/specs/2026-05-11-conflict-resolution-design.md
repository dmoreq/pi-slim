# Conflict Resolution Design
**Date:** 2026-05-11  
**Status:** Approved  
**Scope:** Resolve 10 architectural conflicts identified in the pi-scope feature analysis report.

---

## Background

A full feature analysis of the pi-scope codebase identified 10 conflicts across three categories:

- **Dead code / duplicated logic** — `ActionableInsightsGenerator` fully duplicates `ContextIntelligenceEngine`; `SessionOrchestrator` is an unfinished stub; `ReadAwarenessPlugin` contradicts `hashline_edit`'s core workflow.
- **Type and guidance correctness** — LSP tool guidance conflates `hover` and `go_to_definition`; `graph-lsp-hover.ts` redefines types from `graph-types.ts`; `CommunityPruningPlugin` pattern matching never fires.
- **Architecture / data-flow** — `enhancedBlock` bypasses the `InjectionPipeline`'s token budget; repo-map smart-activation is an invisible closure condition; `graph-wikipedia.ts` uses an undocumented `(analysis as any).graph` cast.

---

## Approach: Phased by Risk

Three phases, each independently mergeable:

| Phase | Category | Risk | Behaviour change |
|---|---|---|---|
| 1 | Pure deletions | Low | None |
| 2 | Type & guidance fixes | Low | Guidance text only |
| 3 | Pipeline architecture | Medium | Token accounting, injection order |

---

## Phase 1 — Pure Deletions

### 1a — Delete `context/actionable-insights.ts`

**Conflict:** `ActionableInsightsGenerator` is a dead class (never imported outside its own file) that duplicates `ContextIntelligenceEngine.generateActionableGuidance()`. The one behavioural difference: it sorts god nodes by criticality (`CRITICAL → IMPORTANT → NORMAL`) before slicing the top-5, whereas the active engine does not.

**Resolution:**
1. Add `private sortGodNodesByRisk(nodes: GodNode[]): GodNode[]` to `ContextIntelligenceEngine`. Sort order: `CRITICAL=0, IMPORTANT=1, NORMAL=2`, then descending `inDegree` as tiebreaker.
2. Apply the sort before `.slice(0, 5)` in `generateRiskWarnings()`.
3. Delete `context/actionable-insights.ts`.

**Files changed:** `context/intelligence-engine.ts` (add sort method, apply it), `context/actionable-insights.ts` (deleted).

---

### 1b — Delete the `session/` directory

**Conflict:** `SessionOrchestrator`, `StateManager`, `ConfigManager`, `NotificationService` and their interfaces (8 files) are a scaffolded but incomplete refactor of `SessionManager`. `SessionOrchestrator.handleContext()` returns a stub string. `SessionManager` is the fully-implemented path with no plans to replace it.

**Resolution:**
1. Remove `readonly sessionOrchestrator?: SessionOrchestrator` field and `deps?.sessionOrchestrator` constructor parameter from `manager.ts`.
2. Remove the `import type { SessionOrchestrator }` import from `manager.ts`.
3. Delete the entire `session/` directory (all 8 files).

**Files changed:** `manager.ts` (remove field + import), `session/` directory (deleted entirely).

---

### 1c — Remove `ReadAwarenessPlugin`

**Conflict:** `ReadAwarenessPlugin` blocks `write`/`edit` calls on files not explicitly opened via the `read` tool. `hashline_edit`'s primary use-case is editing from the AST skeleton without re-reading — making the plugin and the tool mutually contradictory. The safety guarantee is broken: skeleton injection reads are not tracked.

**Resolution:**
1. Delete `plugins/read-awareness.ts`.
2. Remove `this.pluginManager.register(new ReadAwarenessPlugin())` from `SessionManager` constructor.
3. Remove the `ReadAwarenessPlugin` import from `manager.ts`.

**Files changed:** `plugins/read-awareness.ts` (deleted), `manager.ts` (remove import + registration).

---

### 1d — Fix `graph-wikipedia.ts` fragile cast

**Conflict:** `generateWikiPage` uses `(analysis as any).graph` as a fallback, bypassing the type system. The function already accepts an explicit `graph?: GraphifyGraph | null` parameter — the cast is unnecessary.

**Resolution:**
1. Remove the `(analysis as any).graph` fallback from `const effectiveGraph = ...`.
2. The assignment becomes: `const effectiveGraph = graph ?? null`.
3. Add a JSDoc note that callers must pass the graph explicitly.

**Files changed:** `context/graph-wikipedia.ts` (1-line change).

---

## Phase 2 — Type & Guidance Fixes

### 2a — Clarify LSP tool guidance in `ContextIntelligenceEngine`

**Conflict:** Guidance text conflates `lsp_hover` ("for context before editing") and `lsp_go_to_definition` ("to locate symbols") inconsistently. Both answer "what is this symbol?" but for different sub-intents.

**Resolution:** Adopt precise, non-overlapping descriptions throughout `intelligence-engine.ts`:

| Tool | When to recommend | Canonical guidance text |
|---|---|---|
| `lsp_go_to_definition` | Navigation intent: `definition` or `file_location` | "Jump to the canonical declaration" |
| `lsp_hover` | Navigation intent: type/docs lookup | "Get type info and docs without opening the file" |
| `lsp_find_references` | Navigation intent: `references` | "Enumerate all call sites and usages" |

Update `generateWorkflowGuidance()` (the always-on tips block) and `navigationToolSuggestion()` (the dynamic per-request-type helper) to use these canonical strings. Do not change tool names or registration — text only.

**Files changed:** `context/intelligence-engine.ts` (guidance string updates).

---

### 2b — Fix `graph-lsp-hover.ts` type duplication

**Conflict:** `graph-lsp-hover.ts` defines `GodNodeInfo` and `ImpactAnalysis` interfaces that partially redeclare fields already on `GodNode` and `CommunityAnalysis` in `context/graph-types.ts`.

**Resolution:**
1. Delete the `GodNodeInfo` interface. Replace usages inside `graph-lsp-hover.ts` with the imported `GodNode` type from `graph-types.ts`. Move the `recommendation: string` field (the only new addition) to a local inline type: `GodNode & { recommendation: string }`.
2. Delete the `ImpactAnalysis` interface. Replace with a local slim type `LocalImpactAnalysis` that composes fields rather than redeclaring `GodNode` properties.
3. Add `import type { GodNode, CommunityAnalysis, GraphifyAnalysis } from './graph-types.js'` at the top of the file.

This keeps the file internally functional (it's currently inactive) while eliminating the parallel type hierarchy so it can be wired up cleanly in the future.

**Files changed:** `context/graph-lsp-hover.ts` (import additions, interface replacements).

---

### 2c — Fix `CommunityPruningPlugin` pattern matching

**Conflict:** `containsNonRelevantContent()` matches `/Community \d+/gi` and `community-`, which never appear in the actual injected content. The plugin is conditionally registered but effectively never prunes anything.

**Resolution:** Replace the dead patterns with strings that match the real injection markers produced by `smart-repo-map.ts`, `smart-dep-context.ts`, and `intelligence-engine.ts`:

```
ACTUAL MARKERS TO MATCH:
  "GRAPH-PRIORITIZED NAVIGATION"   ← SmartRepositoryMapGenerator
  "🏗️ ARCHITECTURAL CONTEXT"       ← SmartDependencyContextGenerator
  "🏗️ ARCHITECTURAL GUIDANCE"      ← ContextIntelligenceEngine
  "## Graph Analysis Insights"      ← handleBeforeAgentStart
  "🎯 HIGH-PRIORITY SYMBOLS"        ← SmartDependencyContextGenerator
  "🎯 FOCUS AREAS"                  ← SmartRepositoryMapGenerator
```

Update `containsNonRelevantContent()` to check for this set of strings. Update `trimToRelevantContent()`'s section-boundary detection to split on these headers rather than `Community N`.

**Files changed:** `plugins/community-pruning-plugin.ts` (`containsNonRelevantContent`, `trimToRelevantContent`).

---

## Phase 3 — Pipeline Architecture

### 3a — Move `enhancedBlock` into the `InjectionPipeline`

**Conflict:** `handleBeforeAgentStart` appends `graphSection` and `intelligenceSection` after `pipeline.build()`, outside token accounting. `handleContext` builds `enhancedBlock` (guidance + smart dep context) and prepends it to `depContext` with no budget check. Total injected tokens can silently exceed `maxRepoMapTokens + maxInjectionTokens`.

**Resolution:** Register all produced content as named `PipelineSource` entries before `pipeline.build()`. Both `handleBeforeAgentStart` and `handleContext` use this unified order:

| Priority | Source name | Content producer | Hook |
|---|---|---|---|
| 1 | `repo-map` | `buildRepoMapSource()` (see §3b) | `before_agent_start` only |
| 2 | `provider-guidance` | `loadProviderGuidance()` | `before_agent_start` only |
| 3 | `graph-insights` | God nodes / communities / cycles block | `before_agent_start` only |
| 4 | `context-intelligence` | `ContextIntelligenceEngine.generateActionableGuidance()` | Both hooks |
| 5 | `smart-dep-context` | `SmartDependencyContextGenerator.generateEnhancedDependencyContext()` | Both hooks |
| 6 | `context-files` | `loadContextFiles()` | `before_agent_start` only |
| 7 | `dep-context` | `ContextInjector.buildInjection()` | `context` only |

`combinedBudget = maxRepoMapTokens + maxInjectionTokens` is enforced over all sources. Sources beyond budget are skipped in priority order (existing pipeline behaviour — no change to `InjectionPipeline.build()`).

**Contract for existing flags:** `slim.maxRepoMapTokens` and `slim.maxInjectionTokens` retain their current meaning; their sum becomes the total session budget. No new config keys introduced.

**Trigger conditions unchanged:** `handleContext` currently gates `dep-context` injection behind signals (`hasFilePattern`, `hasToolCall`, `hasSymbolMatch`, `hasCodebaseQuery`). These gates remain. The pipeline assembles only what is registered — unregistered sources (e.g. `dep-context` when no trigger fires) simply do not appear. `context-intelligence` and `smart-dep-context` are registered unconditionally on every `handleContext` call; their `produce()` methods may return `null` when there is nothing to say.

**Phase ordering constraint:** Phase 1 must be merged before Phase 3. Both touch `manager.ts`: Phase 1 removes the `sessionOrchestrator` field and `ReadAwarenessPlugin` registration; Phase 3 restructures the hook methods. Applying Phase 3 on top of an unpatched Phase 1 will produce merge conflicts.

**Files changed:** `manager.ts` (restructure `handleBeforeAgentStart` and `handleContext` to register all sources before `build()`).

---

### 3b — Make Smart Repo-map activation explicit

**Conflict:** The smart vs raw repo-map decision is an invisible closure condition inside `handleBeforeAgentStart`. Manual re-registration of `repo-map` would silently skip the smart enhancement.

**Resolution:** Extract a named helper in `manager.ts`:

```typescript
function buildRepoMapSource(
  baseMap: string,
  insights: ContextInsights,
  graph: GraphifyAnalysis | null,
): PipelineSource {
  return {
    name: 'repo-map',
    priority: 1,
    produce(): string | null {
      if (!baseMap) return null
      if (graph) {
        return new SmartRepositoryMapGenerator()
          .generatePrioritizedRepoMap(baseMap, insights, graph)
      }
      return baseMap
    },
  }
}
```

`handleBeforeAgentStart` calls `buildRepoMapSource(s.repoMap, snapshot.insights, snapshot.graph ?? this.graphService.analysis ?? null)`. The branching is named, visible, and testable.

**Files changed:** `manager.ts` (extract `buildRepoMapSource` function, call it in `handleBeforeAgentStart`).

---

### 3c — Token tracking for guidance sources

**Conflict:** Once `enhancedBlock` flows through the pipeline, its tokens are automatically tracked in `result.sources`. The existing `SessionStats` records only `repo-map`, `provider-guidance`, and `context-files` injections.

**Resolution:** Extend `SessionStats.recordDepContextInjection` (or add `recordGuidanceInjection`) to record tokens for `context-intelligence` and `smart-dep-context` sources. Map `result.sources` entries to stats calls in the updated `handleBeforeAgentStart`/`handleContext`.

**Files changed:** `metrics/tracker.ts` (add stat methods), `manager.ts` (call new stat methods).

---

### 3d — Test coverage for Phase 3

Three new test cases required before merging Phase 3:

1. **`pipeline.ts`** — Assert that a source registered beyond `maxTokens` budget is present in `result.sources` with `injected: false, trimmed: true`, even when it is registered after a high-priority source.
2. **`manager.ts` integration** — Assert that total tokens across all `result.sources` never exceeds `maxRepoMapTokens + maxInjectionTokens` when all sources produce content.
3. **`buildRepoMapSource()`** — Unit test: with non-null `graph` → output contains `GRAPH-PRIORITIZED NAVIGATION` prefix; with null `graph` → output equals the raw `baseMap` string.

---

## Summary of Files Changed

| File | Phase | Change type |
|---|---|---|
| `context/actionable-insights.ts` | 1a | **Deleted** |
| `context/intelligence-engine.ts` | 1a, 2a | Modified (sort method, guidance text) |
| `session/` (8 files) | 1b | **Deleted** |
| `manager.ts` | 1b, 1c, 3a, 3b, 3c | Modified (remove refs, restructure hooks) |
| `plugins/read-awareness.ts` | 1c | **Deleted** |
| `context/graph-wikipedia.ts` | 1d | Modified (remove cast) |
| `context/graph-lsp-hover.ts` | 2b | Modified (import types, remove redefs) |
| `plugins/community-pruning-plugin.ts` | 2c | Modified (fix patterns) |
| `metrics/tracker.ts` | 3c | Modified (add stat methods) |
| `context/pipeline.ts` | — | No change (existing logic sufficient) |

---

## Out of Scope

- Wiring `graph-lsp-hover.ts` into the active LSP hover tool (future work)
- Completing the `graph-wikipedia.ts` generator with a trigger mechanism (future work)
- Wiring `graph-retrieval-boost.ts` into `RetrievalEngine` (separate initiative)
