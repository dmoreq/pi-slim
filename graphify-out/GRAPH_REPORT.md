# Graph Report - pi-scope  (2026-05-09)

## Corpus Check
- 143 files · ~106,527 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1556 nodes · 2508 edges · 89 communities (82 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `86f59e59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]

## God Nodes (most connected - your core abstractions)
1. `join()` - 28 edges
2. `GraphifyAnalysis` - 27 edges
3. `SessionManager` - 26 edges
4. `GraphifyGraph` - 24 edges
5. `ActionableInsightsGenerator` - 17 edges
6. `ContextIntelligenceEngine` - 17 edges
7. `generateWikiPage()` - 17 edges
8. `GodNode` - 16 edges
9. `computeLineHash()` - 15 edges
10. `RepoIndex` - 14 edges

## Surprising Connections (you probably didn't know these)
- `writeFileAt()` --calls--> `join()`  [INFERRED]
  tests/context/guidance.test.ts → services/graph-service.ts
- `writeProjectConfig()` --calls--> `join()`  [INFERRED]
  tests/context/loader.test.ts → services/graph-service.ts
- `writeFileAt()` --calls--> `join()`  [INFERRED]
  tests/context/context-files.test.ts → services/graph-service.ts
- `writeFixture()` --calls--> `join()`  [INFERRED]
  tests/integration/session-workflow.test.ts → services/graph-service.ts
- `writeFileAt()` --calls--> `join()`  [INFERRED]
  tests/shared/file-detector.test.ts → services/graph-service.ts

## Communities (89 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (44): baseEmptyEdit, chitChat, communityAuth, defGuidance, defInsights, detectedGodNodes, editing, empty (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (36): buildModuleStructureListing(), ContextInjector, ENTRY_POINT_NAMES, getBroadOverviewFiles(), Message, BAR, BAZ, EXT (+28 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (47): allNodes, auth, authFile, baseline, boosted, breadcrumbs, communities, communityMap (+39 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (45): categorizeSurprises(), computeSurpriseStats(), filterHighImpactSurprises(), getSurpriseNodes(), getSurpriseRecommendation(), getTopSurprises(), SurpriseReason, SurpriseStats (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (33): computeOperationSupport(), createLSPClient(), CreateLSPClientOptions, LSPCallHierarchyIncomingCall, LSPCallHierarchyItem, LSPCallHierarchyOutgoingCall, LSPClientInfo, LSPClientState (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (19): event, join(), SessionManager, buildCitationRegex(), buildPathRegex(), cleanPath(), DEFAULT_EXTENSIONS, DetectorOptions (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (40): code:typescript (// tests/shared/intelligence-types.test.ts), code:bash (git add context/intelligence-engine.ts tests/context/intelli), code:typescript (// tests/context/actionable-insights.test.ts), code:typescript (// context/actionable-insights.ts), code:bash (git add context/actionable-insights.ts tests/context/actiona), code:typescript (// tests/integration/enhanced-context.test.ts), code:typescript (// manager.ts (modify lines 111-192, the start method and re), code:typescript (// manager.ts - modify handleContext method (around line 350) (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (39): AST Skeleton Injection, At Session Start, CLI Flags, code:bash (pi install git:github.com/dmoreq/pi-scope), code:bash (# TypeScript / JavaScript), code:bash (pip install graphifyy && cd your-project && graphify .), code:xml (<dep-context>), code:block5 (┌──── pi-scope Session Dashboard ───────────────────────────) (+31 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (36): AnalysisWithGraph, createCommunitySection(), createDependenciesSection(), createDependentsSection(), createEmptyWikiPage(), createGodNodeSection(), createMetricsSection(), createOverviewSection() (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (21): ActionableInsightsGenerator, godNodesToCommunityLabels(), def, emptyGraph, fileLoc, generator, guidance, insights (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (26): analyzeImpact(), CommunityInfo, computeGraphMetrics(), createCommunityInfo(), createGodNodeInfo(), createSurpriseInfo(), EnhancedHoverInfo, enhanceHoverWithGraphMetrics() (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (24): combineImportanceScores(), getPageRankStats(), PageRankScore, rankByPageRank(), a, b, c, combined (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (23): analyzeSymbolImpact(), ChangeImpact, computeImpactStats(), determineRiskLevel(), findAffectedCommunities(), findCommunityForNode(), findDirectDependents(), findTransitiveDependents() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (16): computeDegreeCentrality(), identifyGodNodesByDegree(), computePageRank(), identifyGodNodesByPageRank(), detectSurprisingConnections(), clearGraphCache(), deserializeAnalysis(), getGraphCacheStats() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (22): adjustIndentation(), applyIndentDelta(), BomResult, buildIndentProfile(), computeUniformIndentDelta(), convertLeadingTabsToSpaces(), countLeadingWhitespace(), detectIndentChar() (+14 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (21): Anomaly, Cycle, CycleDetectionResult, detectAllCycles(), detectAnomalies(), detectCyclesDFS(), detectHighCoupling(), detectOrphans() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (23): Analytics Plugin, Built-in Plugins, code:bash (pip install graphifyy && cd your-project && graphify .), code:typescript (interface Plugin {), code:typescript (import { SessionManager } from 'pi-scope';), code:typescript (// Customize pruning), code:typescript (const reader = new ReadAwarenessPlugin();), code:typescript (// Manual configuration) (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (14): CommunitySizing, godNodeMatchesSymbol(), GodNode, GraphifyAnalysis, PipelineBuildResult, PipelineSource, SmartRepositoryMapGenerator, analysis (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (16): PluginError, PluginHookName, Plugin, PluginToolCallResult, afterRejectPlugin, all, allowPlugin, badPlugin (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (20): Anchor, applyEdit(), applyHashlineEdits(), buildResult(), collectBoundaryWarning(), collectLinePrefixStats(), dedupeEdits(), ensureContent() (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (22): All Config Options, code:bash (# Already installed. Verify with:), code:bash (# TypeScript / JavaScript), code:bash (pip install graphifyy && cd your-project && graphify .), code:jsonc ({), code:json ({), code:bash (# Disable pi-scope for a session), Config File Path (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (19): getGraphStats(), loadGraphifyJson(), loadGraphifyJsonFromDefaults(), loadGraphifyJsonSync(), LoadResult, saveGraphifyJson(), formatValidationErrors(), GRAPHIFY_GRAPH_SCHEMA (+11 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (20): buildNeighborMap(), computeDensity(), computeGlobalModularity(), computeModularityDelta(), countEdgesInCommunity(), countEdgesOutside(), detectCommunitiesLouvain(), findBottlenecksInCommunity() (+12 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (13): BuildMetadata, collectMetadata(), IndexResult, IndexService, extractMetadata(), IndexMetadata, LanguageCoverage, StoredIndexV2 (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (21): Auto-install Command, code:bash (# These are installed automatically when you run: pi install), code:bash (# TypeScript / JavaScript), code:bash (# No install needed — visualization is pure D3.js via CDN), code:bash (pip install graphifyy && cd your-project && graphify .), code:bash (npm install -g typescript typescript-language-server && pip ), code:block6 (## Graph Analysis Insights), Common Pitfalls (+13 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (19): DegreeScore, getDegreeCentralityStats(), identifyBottlenecksByDegree(), rankByInDegree(), a, b, bottlenecks, c (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.1
Nodes (20): [0.1.0] - 2024, [0.2.0] - 2026-05-04, [0.3.0] - 2026-05-04, [0.4.0] - 2026-05-04, [0.5.0] - 2026-05-04, [0.6.0] - 2026-05-04, [0.7.0] - 2026-05-04, [0.7.1] - 2026-05-09 (+12 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (13): applyPruningRules(), ContextMessage, deduplicate(), DEFAULT_RULE_CONFIG, hashContent(), PruningRuleConfig, purgeErrors(), supersedeWrites() (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.1
Nodes (19): Adding a Hashline Edit Operation, Adding a Language Parser, Adding a Retrieval Signal, Adding an LSP Server, Code Style, code:bash (git clone <your-fork>), code:block2 (pi-scope/), code:typescript (export class GoParser implements LanguageParser {) (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (17): buildGuidanceNotification(), DEFAULT_PROVIDER_GUIDANCE_OPTIONS, formatProviderGuidanceSection(), getCandidateFiles(), getDirectories(), globMatch(), GuidanceConfig, loadGuidanceConfig() (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.19
Nodes (14): BeforeAgentStartEvent, SessionState, OptionalGraphAnalysisLoader, buildStatusText(), clearStatusBar(), error(), info(), StatusBarState (+6 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (16): Anomaly, Bottleneck, Community, CommunityAnalysis, ConfidenceScore, EnhancedGraphInsights, GraphContext, GraphMetrics (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.16
Nodes (13): LanguageParser, BLOCK_TYPES, nodeSig(), parser, RustParser, SIGNATURE_TYPES, parser, result (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (18): Auto-Rebase, code:bash (# Verify:), code:block2 (1tz|import { readFile } from 'fs'), code:block3 (hashline_edit({), code:block4 (hashline_edit({), code:block5 (Auto-rebased anchor 42nd → 44nd (line shifted within ±5; has), code:block6 (Edit rejected: 1 line has changed since the last read (marke), Common Pitfalls (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (15): deepMerge(), getLineAndColumn(), GLOBAL_CONFIG_PATH, isPlainObject(), loadConfig(), parseJsonc(), readConfigFile(), config (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (16): buildStartupNotification(), ContextFile, ContextFileOptions, DEFAULT_CONTEXT_FILE_OPTIONS, formatContextSection(), formatDisplayPath(), getAncestorDirs(), loadContextFiles() (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.15
Nodes (13): produceDefaults(), AnyFn, CODEBASE_PATTERNS, FLAGS, registerFlags(), smartContextExtension(), registerHashlineTool(), findRefsTool (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (15): ch(), fileLines, lines, r, tryRebaseAnchor(), validateLineRef(), computeLineHash(), formatHashLine() (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.25
Nodes (13): SessionRecord, SCOPE_DIR, scopeDir(), readState(), readStateSync(), removeState(), stateDir(), statePath() (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (15): code:block1 (score(file) = 3 × symbolMatch + 2 × filenameMatch + 1 × depP), code:xml (<dep-context>), code:block3 (**God Nodes (most depended-on symbols):**), code:bash (pip install graphifyy && cd your-project && graphify .), code:block5 (<dep-context>), Common Mistakes, Graph Data Is Already In Your Context, How File Retrieval Works (+7 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (14): beforeAgentEvent, contextEvent, DEFAULT_CONFIG, defaults, editCallResult, editUnreadResult, hasAuthContext, manager (+6 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (14): Adding a New Language, Cache Behavior, code:bash (# Already installed. Verify with:), code:typescript (interface LanguageParser {), code:typescript (interface FileIndex {), code:typescript (constructor(projectRoot, config) {), How Parsing Works, LanguageParser Interface (+6 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (6): ContextPruningPlugin, config, messages, mockCtx, msgs, stats

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (9): buildIgnore(), DEFAULT_IGNORES, full, ignore, IgnoreInstance, IndexEngine, rel, _require (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (8): computeGraphHealthScore(), computeGraphTokenSavings(), estimateResultsTokens(), generateGraphSummary(), GraphAggregateStats, GraphPerformanceBenchmark, GraphQualityMetrics, GraphTokenSavings

### Community 48 - "Community 48"
Cohesion: 0.15
Nodes (12): authDeps, authPath, barPath, DEFAULT_CONFIG, engine, engine1, engine2, fooPath (+4 more)

### Community 49 - "Community 49"
Cohesion: 0.32
Nodes (11): gunzipAsync, gzipAsync, indexPath(), loadStore(), mapPath(), saveStore(), StoredIndex, StoredIndexV3 (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.15
Nodes (6): DiskCache, cache, cache2, cachePath, data, SAMPLE

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (4): InjectionPipeline, parts, pipeline, result

### Community 52 - "Community 52"
Cohesion: 0.24
Nodes (11): buildCompactHashlineDiffPreview(), collapseMiddle(), CompactHashlineDiffOptions, CompactHashlineDiffPreview, Entry, EntryKind, fmt(), groupRuns() (+3 more)

### Community 53 - "Community 53"
Cohesion: 0.2
Nodes (7): extractNames(), RepoMapGenerator, files, gen, index, map, RepoIndex

### Community 54 - "Community 54"
Cohesion: 0.17
Nodes (11): code:block1 (SmartCtx: 1,234 files | map ~3,500t | 12 inj | 1 ctx | 1 gui), code:block2 (savingsRatio = 1 - (skeletonTokens / (skeletonTokens + fullF), code:json ({), Debugging Injection Issues, No User Commands Needed, Notification Types, pi-scope Telemetry & Monitoring, Session Data Files (+3 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (11): Available Tools, code:bash (# TypeScript / JavaScript (recommended for all TS/JS project), code:typescript (// Go to definition), Example Usage, Graph-Enhanced Hover (When Graph Data Available), How It Works, pi-scope LSP Code Navigation, Prerequisites: Install LSP Servers (+3 more)

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (10): context, definitionInsights, fileContext, fileLocationInsights, generator, insights, lines, mockGraphAnalysis (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.18
Nodes (9): js, OUT, outPath, rel, SKIP_DIRS, SRC, TS_EXTS, tsFiles (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.29
Nodes (10): detectLineEnding(), normalizeToLF(), restoreLineEndings(), stripBom(), ensureInit(), HashlineEditDetails, HashlineEditResult, hashlineTool (+2 more)

### Community 60 - "Community 60"
Cohesion: 0.24
Nodes (7): BODY_TYPES, DECLARATION_TYPES, nodeSignature(), parser, result, TypeScriptParser, walk()

### Community 62 - "Community 62"
Cohesion: 0.2
Nodes (9): code:bash (npm run test:intelligence), code:bash (npm run test:intelligence:watch), code:bash (npm run build:intelligence), Configuration, Enhanced context intelligence, Performance, Session flow, Testing (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (3): ReadAwarenessPlugin, mockCtx, tools

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (6): ChunkEmitter, emitter, HashlineStreamOptions, last, resolved, ResolvedOptions

### Community 66 - "Community 66"
Cohesion: 0.31
Nodes (6): DiffResult, formatNumberedDiffLine(), generateDiffString(), diff, preview, r

### Community 67 - "Community 67"
Cohesion: 0.31
Nodes (6): extractFunctionSig(), parser, PythonParser, parser, result, walk()

### Community 68 - "Community 68"
Cohesion: 0.33
Nodes (6): buildChecksums(), checkIndexFreshness(), detectChangedFiles(), getGitCommit(), hashFile(), StalenessResult

### Community 69 - "Community 69"
Cohesion: 0.22
Nodes (9): code:xml (<enhanced-dep-context>), code:xml (<smart-repo-map>), code:xml (<graph-insights>), code:xml (<actionable-insights>), code:xml (<dep-context>), Enhanced Context Layers, Layer 1: Actionable Graph Insights, Layer 2: Enhanced Dependency Context (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.43
Nodes (7): GraphEdge, GraphNode, fileLabel(), fileNodeId(), inferSymbolType(), repoIndexToFileGraph(), repoIndexToGraphifyGraph()

### Community 71 - "Community 71"
Cohesion: 0.25
Nodes (8): 1. Context Intelligence Engine, 2. Enhanced Context Generators, 3. Pattern Detection System, code:typescript (export class ContextIntelligenceEngine {), code:typescript (export class ActionableInsightsGenerator {), code:typescript (export class SmartDepContextGenerator {), code:typescript (export class AgentPatternDetector {), System Components

### Community 73 - "Community 73"
Cohesion: 0.29
Nodes (5): ExtensionContext, event, messages, mockAnalysis, spy

### Community 74 - "Community 74"
Cohesion: 0.38
Nodes (6): COMMUNITY_COLORS, DEFAULT_VISUALIZATION_OPTIONS, generateGraphVisualization(), generateHtmlTemplate(), GraphVisualizationOptions, saveVisualization()

### Community 75 - "Community 75"
Cohesion: 0.43
Nodes (3): buildDisplayLineSet(), formatCodeFrameLine(), HashlineMismatchError

### Community 76 - "Community 76"
Cohesion: 0.29
Nodes (6): Conclusion, Current Issues, Enhanced Context Intelligence System Design, Executive Summary, Problem Statement, Root Cause

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (5): edgeTypes, formatted, graph, result, types

### Community 78 - "Community 78"
Cohesion: 0.4
Nodes (4): buildCostEstimate(), CostEstimate, estimateFileSavings(), result

### Community 80 - "Community 80"
Cohesion: 0.4
Nodes (4): mockRecordError, mockRecordEvent, mockRecordMetric, mockTelemetryHeartbeat

### Community 81 - "Community 81"
Cohesion: 0.4
Nodes (5): Implementation Strategy, Phase 1: Foundation (Week 1), Phase 2: Enhanced Contexts (Week 2), Phase 3: Dynamic Guidance (Week 3), Phase 4: Learning & Optimization (Week 4)

### Community 82 - "Community 82"
Cohesion: 0.4
Nodes (5): code:typescript (// Enhanced: manager.ts), code:typescript (// Enhanced: context/pipeline.ts), Context Pipeline Enhancement, Integration Points, SessionManager Modifications

### Community 83 - "Community 83"
Cohesion: 0.5
Nodes (4): Qualitative Indicators, Quantitative Metrics, Success Metrics, Target Improvements

### Community 84 - "Community 84"
Cohesion: 0.5
Nodes (4): Implementation Risks, Risk Analysis, Technical Risks, User Experience Risks

### Community 85 - "Community 85"
Cohesion: 0.5
Nodes (4): Enhanced Graph Integration, File Renaming Completed ✅, Graph Implementation Improvements, Native TypeScript Implementation ✅

### Community 86 - "Community 86"
Cohesion: 0.5
Nodes (4): Integration Tests, Testing Strategy, Unit Tests, User Acceptance Tests

### Community 87 - "Community 87"
Cohesion: 0.5
Nodes (4): code:block1 (God Nodes: Client (26 connections), AsyncClient (25 connecti), code:block2 (⚠️ HIGH-IMPACT SYMBOLS (edit carefully):), Core Philosophy, Solution Architecture

## Knowledge Gaps
- **711 isolated node(s):** `SessionState`, `FLAGS`, `CODEBASE_PATTERNS`, `AnyFn`, `GraphVisualizationOptions` (+706 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GraphifyAnalysis` connect `Community 17` to `Community 0`, `Community 2`, `Community 3`, `Community 8`, `Community 73`, `Community 74`, `Community 10`, `Community 12`, `Community 9`, `Community 46`, `Community 13`, `Community 56`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `ActionableInsightsGenerator` connect `Community 9` to `Community 17`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `join()` connect `Community 13` to `Community 34`, `Community 35`, `Community 68`, `Community 5`, `Community 38`, `Community 40`, `Community 44`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 58`, `Community 29`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `join()` (e.g. with `.persist()` and `loadGuidanceConfig()`) actually correct?**
  _`join()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SessionState`, `FLAGS`, `CODEBASE_PATTERNS` to the rest of the system?**
  _711 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._