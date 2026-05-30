# graphify Integration — Implementation Progress

> Last updated: 2025-05-30  
> All 609 tests passing across 51 test files.

---

## Summary

The graphify integration is **complete**. All six planned deliverables have been
implemented, tested, and committed.

| # | Deliverable | Status | Commit |
|---|-------------|--------|--------|
| 1 | `persistence/graph-cache.ts` | ✅ Complete (pre-existing) | `ab4234f` |
| 2 | `metrics/graph-metrics.ts` | ✅ Complete | `1af694f` |
| 3 | `plugins/community-pruning-plugin.ts` | ✅ Complete | `ed12a91` |
| 4 | `manager.ts` graphify integration | ✅ Complete | `29b2d3a` |
| 5 | Integration test (end-to-end) | ✅ Complete | `71df9c6` |
| 6 | This document | ✅ Complete | — |

---

## What Was Built

### 1. `persistence/graph-cache.ts` (pre-existing, verified complete)

Persistent JSON cache for `GraphAnalysis` stored alongside the index in
`.pi/pi-scope/graph-cache.json`.

- **Cache key**: `indexFingerprint` — `files:N|symbols:N|deps:N` string that
  changes whenever the RepoIndex changes, triggering a fresh analysis.
- **Version guard**: `GRAPH_CACHE_VERSION = 1` — bumping this integer forces
  all clients to rebuild.
- Exports: `serializeAnalysis`, `deserializeAnalysis`, `saveGraphCache`,
  `loadGraphCache`, `graphCacheExists`, `clearGraphCache`, `getGraphCacheStats`.

---

### 2. `metrics/graph-metrics.ts`

Three metric groups computed from a completed `GraphAnalysis`:

| Type | Key fields |
|------|-----------|
| `GraphQualityMetrics` | `score/100`, godNodeCount, communityCount, cycleCount, bottleneckCount, surpriseCount, density, avgDegree |
| `GraphPerformanceMetrics` | nodeCount, edgeCount, analysisMs, cacheHit, throughput (nodes/ms) |
| `GraphTokenMetrics` | godNodeCoverage, activeCommunityRatio, estimatedSavings (inactive-community heuristic) |

**Quality score formula** (0–100):
```
score = 100 − min(cycleCount×2, 40) − min(godNodeCount, 20) + min(communityCount−1, 10)
```

`buildGraphMetricsSummary(analysis, analysisMs, cacheHit)` is the single entry
point used by `manager.loadGraph()`. `formatGraphMetricsSummary()` renders a
debug-log block with all three groups.

**Tests**: `tests/metrics/graph-metrics.test.ts` — 18 tests.

---

### 3. `plugins/community-pruning-plugin.ts`

A `Plugin`-interface implementation that reduces cross-community noise in
the live conversation history.

**Algorithm (per turn):**
1. Skip if: no graph analysis, single community, or < 3 messages.
2. Build `nodeId → communityId` map from the analysis.
3. Vote on the active community by matching `.ts/.py/…` filename tokens in
   the last 3 user messages against graph node paths.
4. Walk `developer`-role messages backwards; prune any that contain no node
   from the active community — **except** the most-recent injection (always
   preserved).

**Node-ID format** (from `graph/bridge.ts`):
- `file:relative/path/to/file.ts` (module nodes)
- `file:relative/path/to/file.ts:SymbolName` (symbol nodes)

Registered in `SessionManager` constructor alongside `ContextPruningPlugin`:
```typescript
this.pluginManager.register(new CommunityPruningPlugin(this.graphService))
```

**Tests**: `tests/plugins/community-pruning-plugin.test.ts` — 13 tests.

---

### 4. `manager.ts` graphify integration

Four targeted changes across four files:

#### `services/graph-service.ts`
- `GraphResult` gains `cacheHit: boolean`.
- `analyzeFromIndex()` returns `cacheHit: true` on cache hit, `false` on fresh
  build.

#### `services/telemetry-service.ts`
- `onGraphLoaded(nodeCount, edgeCount, communityCount?)` — when `communityCount > 1`
  the notification reads `"Graph: N nodes, N edges, N communities"` instead of
  the two-field form.

#### `ui/notifications.ts`
- `StatusBarState` gains optional `graphCommunityCount?: number`.
- `buildStatusText()` appends `"N comm"` when `graphCommunityCount > 1`.

#### `manager.ts`
- `_graphCommunityCount` private field mirrors community count for status bar.
- `loadGraph()` now:
  1. Times the analysis (`analysisStart → analysisMs`).
  2. Sets `_graphCommunityCount`.
  3. Calls `buildGraphMetricsSummary(analysis, analysisMs, cacheHit)`.
  4. Emits a `console.warn` when cycles are detected.
  5. Passes `communityCount` to `telemetry.onGraphLoaded()`.
- `statusBarState()` passes `graphCommunityCount` (only when > 1).
- Constructor registers `CommunityPruningPlugin(this.graphService)`.

---

### 5. `tests/integration/graphify-integration.test.ts`

End-to-end integration test using a real 5-file TypeScript fixture
(`db.ts → logger.ts → auth.ts → user.ts → api.ts`).

| Phase | Tests | What it covers |
|-------|-------|----------------|
| 1: Load & Analyze | 3 | Index runs, analysis produced, graph stats in session state |
| 2: Cache | 2 | `graph-cache.json` written after first start; second start yields identical metrics |
| 3: Dashboard | 3 | System prompt contains `Graph Analysis Insights`; status bar updated; `comm` suffix present when > 1 community |
| 4: Plugin | 3 | Both plugins registered; `handleContext` survives with community-pruning active |

Total: **11 tests**.

---

## Test Coverage

| Area | Test file | Tests |
|------|-----------|------:|
| Persistence (graph-cache) | `tests/integration/graph.test.ts` Phase 5 | 3 |
| Graph metrics | `tests/metrics/graph-metrics.test.ts` | 18 |
| Community pruning plugin | `tests/plugins/community-pruning-plugin.test.ts` | 13 |
| Graphify E2E | `tests/integration/graphify-integration.test.ts` | 11 |
| **Total new** | | **45** |
| **Full suite** | 51 files | **609** |

---

## Architecture — How It Fits Together

```
SessionManager.start()
  └─ loadGraph(projectRoot, stats)
       ├─ GraphService.analyzeFromIndex(index, projectRoot, cacheDir)
       │    ├─ loadGraphCache()          ← persistence/graph-cache.ts
       │    │    └─ cache hit → return { analysis, cacheHit: true }
       │    └─ cache miss
       │         ├─ repoIndexToCodeGraph()   ← graph/bridge.ts
       │         ├─ GraphAnalyzer.analyze()  ← graph/analyzers/
       │         ├─ assembleGraphAnalysis()
       │         └─ saveGraphCache()         ← persistence/graph-cache.ts
       ├─ buildGraphMetricsSummary()     ← metrics/graph-metrics.ts
       ├─ telemetry.onGraphLoaded(n, e, communities)
       └─ setLspGraphAnalysis(analysis)

SessionManager.constructor()
  ├─ new ContextPruningPlugin()
  └─ new CommunityPruningPlugin(graphService)   ← plugins/community-pruning-plugin.ts

SessionManager.handleContext()
  └─ pluginManager.runHook('onContext', messages)
       ├─ ContextPruningPlugin.onContext()    removes duplicates/obsolete
       └─ CommunityPruningPlugin.onContext()  prunes off-community injections

StatusBarState.graphCommunityCount  → buildStatusText() → "N comm"
                                                         ← ui/notifications.ts
```

---

## Known Limitations / Future Work

- **`metrics/graph-metrics.ts` — `estimatedSavings`** is a rough heuristic
  (50 files × 80 tokens × inactive communities). Real savings depend on actual
  skeleton sizes.
- **Community detection on small graphs** — Louvain often returns a single
  community for < 10 nodes. The `CommunityPruningPlugin` correctly no-ops in
  this case.
- **`graphCommunityCount` in status bar** — Only shown when > 1 community to
  avoid cluttering single-community (small) projects.
- **Graph cache TTL** — Currently invalidated only by `indexFingerprint` change.
  A time-based TTL (e.g. 24 h) could be added as a future enhancement.
