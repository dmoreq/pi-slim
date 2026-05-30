# Báo Cáo Phân Tích Tính Năng Pi-Scope Extension

> Tác giả: Claude Code  
> Ngày cập nhật: 2026-05-30  
> Phiên bản: pi-scope v0.7.0  
> Số tests: **690/690 pass** (81 file test)  
> Kế hoạch đã hoàn tất: [Hashline v2](HASHLINE_ADOPTION_PLAN_VI.md) · [LSP v1](LSP_ADOPTION_PLAN_VI.md) · [Graph adoption v1](GRAPH_ADOPTION_PLAN_VI.md)  

---

## Mục Lục

1. [Tổng Quan](#1-tổng-quan)
2. [Nhóm 1: Hệ Thống Index & Cache](#2-nhóm-1-hệ-thống-index--cache)
3. [Nhóm 2: Context Injection Pipeline](#3-nhóm-2-context-injection-pipeline)
4. [Nhóm 3: Code-Graph Analysis](#4-nhóm-3-code-graph-analysis)
5. [Nhóm 4: Intelligence Engine & Pattern Detection](#5-nhóm-4-intelligence-engine--pattern-detection)
6. [Nhóm 5: Retrieval Engine](#6-nhóm-5-retrieval-engine)
7. [Nhóm 6: Provider Guidance](#7-nhóm-6-provider-guidance)
8. [Nhóm 7: Context Files](#8-nhóm-7-context-files)
9. [Nhóm 8: Plugin System](#9-nhóm-8-plugin-system)
10. [Nhóm 9: LSP Integration](#10-nhóm-9-lsp-integration)
11. [Nhóm 10: Hashline Editor](#11-nhóm-10-hashline-editor)
12. [Nhóm 11: File Detector](#12-nhóm-11-file-detector)
13. [Nhóm 12: Query Intent & Auto-Reindex](#13-nhóm-12-query-intent--auto-reindex)
14. [Nhóm 13: Metrics & Tracking](#14-nhóm-13-metrics--tracking)
15. [Đánh Giá Tổng Thể](#15-đánh-giá-tổng-thể)
16. [Các Cơ Hội Cải Thiện](#16-các-cơ-hội-cải-thiện)

---

## 1. Tổng Quan

Pi-scope là một extension cho coding agent Pi, cung cấp **ngữ cảnh thông minh** (context injection), **điều hướng code** (code navigation), và **phân tích cấu trúc codebase** thông qua 13 nhóm tính năng độc lập nhau.

### Sơ đồ luồng dữ liệu tổng quát

```
Mỗi lần start session
    │
    ├─ IndexEngine: parse AST → RepoIndex
    ├─ GraphService: RepoIndex → CodeGraph → GraphAnalysis (cache)
    ├─ RetrievalEngine: khởi tạo từ RepoIndex
    ├─ LSP: probe servers (optional), register 9 navigation tools + graph_symbol_impact
    └─ PluginManager: ContextPruning, CommunityPruning, HashlineSteer/Validate, LspSteer, GraphSteer

Mỗi lượt LLM call
    │
    ├─ handleBeforeAgentStart (lần đầu)
    │    ├─ RepoMap (graph-prioritized)
    │    ├─ GraphInsights (god nodes, communities, anomalies, bottlenecks)
    │    ├─ ContextIntelligence (workflow guidance)
    │    ├─ ProviderGuidance (CLAUDE.md, CODEX.md...)
    │    └─ ContextFiles (AGENTS.local.md...)
    │
    └─ handleContext (mỗi turn)
         ├─ FileDetector + compiler-error locations: paths từ tool/bash output
         ├─ LSP path inject (cùng turn): tool args, details.paths, compiler hints
         ├─ RetrievalEngine: score + rank files (+ graph god/community boost)
         ├─ ContextInjector: build dep-context (+ hashline anchors)
         ├─ Graph pulse (compact, sau insights lần đầu) — god nodes + active community
         ├─ SmartDepContext: HIGH-PRIORITY SYMBOLS (dedupe vs insights)
         ├─ ContextIntelligence: cycle warnings khi edit file trong SCC
         ├─ hashline-dry-run-followup (priority 8, turn sau dry_run)
         └─ PluginManager.onContext: context + community pruning
```

### Kết quả đánh giá nhanh

| Nhóm | Tình trạng kích hoạt | Sử dụng đúng cách | Tiềm năng tận dụng thêm |
|------|---------------------|-------------------|-------------------------|
| Index & Cache | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Context Pipeline | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Code-Graph | ✅ Pipeline + adoption v1 | 🟢 Tốt (pulse, steer, retrieval) | 🟡 Trung bình — xem `GRAPH_ADOPTION_PLAN_VI.md` |
| Intelligence Engine | ✅ Đầy đủ | ✅ Tốt (đã tinh chỉnh) | 🟡 Trung bình |
| Retrieval Engine | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Provider Guidance | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Context Files | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Plugin System | ✅ 6 plugins (prune + steer) | ✅ Tốt | 🟡 Trung bình |
| LSP Integration | ✅ Adoption v1 (9 LSP tools) | 🟢 Tốt (steer + inject + bridge) | 🟢 Thấp — tùy chọn Phase D+ |
| Hashline Editor | ✅ Adoption v2 (Phases A–D) | 🟢 Tốt (có enforcement) | 🟡 Trung bình |
| File Detector | ✅ + compiler `file.ts(12,5)` | ✅ Tốt | 🟢 Thấp (symbol extract) |
| Query Intent | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Metrics & Tracking | ✅ Đầy đủ | ✅ Tốt (đã kích hoạt) | 🟡 Trung bình |

---

## 2. Nhóm 1: Hệ Thống Index & Cache

### 2.1 Cách hoạt động

`IndexService` điều phối 3 bước:

1. **Kiểm tra freshness** (`indexer/freshness.ts`): So sánh 3 tiêu chí — tuổi index (> 24h), git commit thay đổi, và SHA256 của 100 file mẫu.
2. **Build fresh** (`IndexEngine`): Walk toàn bộ file `.ts/.tsx/.py/.rs`, parse qua tree-sitter, trích xuất skeleton (function/class signatures, không có body), symbol exports, và import dependencies.
3. **Persist** (`index-store.ts`): Nén gzip và lưu vào `.pi/pi-scope/index.json.gz`.

```
RepoIndex = {
  skeletons: Map<absPath, skeletonText>  // AST skeleton của từng file
  deps: Map<absPath, Set<absPath>>        // file này import gì
  reverseDeps: Map<absPath, Set<absPath>> // ai import file này
  symbolIndex: Map<symbolName, absPath[]> // symbol → các file export nó
}
```

**Auto-reindex**: Khi file thay đổi (FSWatcher), sau 300ms debounce, tự động rebuild index và graph mà không cần restart session.

### 2.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Cả cache load và fresh build đều hoạt động. Auto-reindex đã được kiểm chứng qua integration test.

### 2.3 Nhận xét sử dụng

✅ **Đúng cách.** Freshness check 3-layer (age + git + checksum) rất robust. Gzip compression tiết kiệm đáng kể dung lượng (quan sát được 57–64% compression trong test logs).

### 2.4 Cơ hội cải thiện

- **Incremental indexing**: Hiện tại rebuild toàn bộ khi stale. Có thể chỉ re-parse các file thay đổi (detected qua checksum diff).
- **Language support**: Chưa có Go, Java, C++ parsers. Đây là điểm mù lớn cho polyglot projects.

---

## 3. Nhóm 2: Context Injection Pipeline

### 3.1 Cách hoạt động

`InjectionPipeline` thu thập nhiều nguồn context, sắp xếp theo priority, cắt theo token budget, và ghép thành một block duy nhất.

**Nguồn context được inject:**

| Nguồn | Priority | Khi nào | Token budget |
|-------|----------|---------|--------------|
| `repo-map` | 1 | Lần đầu (first turn) | `maxRepoMapTokens` = 4000 |
| `provider-guidance` | 2 | Lần đầu | shared budget |
| `graph-insights` | 3 | Lần đầu (`slim.graph.enabled`) | shared budget |
| `graph-pulse` | 4.5 | Mỗi turn sau insights (`compactPulseEachTurn`) | shared budget |
| `context-intelligence` | 4 | Mỗi turn | `maxInjectionTokens` = 8000 |
| `smart-dep-context` | 5 | Mỗi turn (dedupe god labels đã có trong insights) | shared budget |
| `context-files` | 6 | Lần đầu | shared budget |
| `dep-context` | 7 | Mỗi turn | shared budget |
| `hashline-dry-run-followup` | 8 | Turn sau `hashline_edit` dry_run | shared budget |

**One-shot injection flags**: Mỗi nguồn chỉ inject một lần/session (`repoMapInjected`, `graphInsightsInjected`, etc.). Khi auto-reindex, flags được reset để re-inject với dữ liệu mới.

### 3.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Tất cả nguồn trên được register; dry-run follow-up chỉ khi `hashline.injectDryRunFollowUp`.

### 3.3 Nhận xét sử dụng

✅ **Đúng cách.** Priority system rõ ràng, token budget được enforce. Tuy nhiên có **1 vấn đề tiềm ẩn**: `smart-dep-context` (priority 5) và `dep-context` (priority 7) đều inject per-turn. Trong một session dài, điều này tạo ra nội dung trùng lặp — `SmartDepContext` focus vào god nodes và community hints, còn `dep-context` inject skeleton thực tế. Cần kiểm tra xem chúng có overlap không.

### 3.4 Cơ hội cải thiện

- **Dynamic budget allocation**: Budget 4000+8000 tokens là fixed. Nên điều chỉnh theo kích thước codebase (project nhỏ cần ít hơn, project lớn cần nhiều hơn).
- ~~**Source deduplication**~~: ✅ `dedupeGodNodesAcrossSources` + `graphInsightGodLabels` session state.

---

## 4. Nhóm 3: Code-Graph Analysis

> **Kế hoạch adoption:** [`docs/GRAPH_ADOPTION_PLAN_VI.md`](GRAPH_ADOPTION_PLAN_VI.md) — **v1 hoàn tất** (Phases A–C); Phase D tùy chọn.

### 4.1 Cách hoạt động

Đây là hệ thống phân tích cấu trúc codebase tự động, không cần công cụ ngoài.

**Pipeline 5 thuật toán:**

```
RepoIndex
    │
    ├─ graph/bridge.ts → CodeGraph (file nodes + symbol nodes + import edges)
    │
    ├─ 1. Degree Centrality  → inDegree, outDegree per node
    ├─ 2. PageRank           → global importance score
    ├─ 3. Louvain Clustering → community detection (module groups)
    ├─ 4. Tarjan SCC / DFS  → circular dependency detection
    └─ 5. Surprise Detection → cross-community edges (anomalies)
    │
    └─ assembleGraphAnalysis() → GraphAnalysis {
         godNodes, communities, surprises,
         bottlenecks, anomalies, metrics
       }
```

**God Nodes**: Các symbol có inDegree + betweenness cao nhất — những điểm mà nếu thay đổi sẽ ảnh hưởng lan rộng.

**Communities**: Louvain phân cụm các module liên quan nhau thành nhóm. Mỗi community có `internalDensity` và `externalDensity` để đánh giá cohesion.

**Graph Cache**: Kết quả được lưu vào `.pi/pi-scope/graph-cache.json` với fingerprint `files:N|symbols:N|deps:N`. Khi index thay đổi, cache bị invalidate tự động.

**Status bar enhancement**: Khi có > 1 community, status bar hiển thị thêm "N comm" (ví dụ: "120 files | map ~3500t | 5 inj | **5 comm**").

### 4.2 Config `slim.graph` (adoption v1)

Schema trong `context/schema.ts` — master switch và tuning từng lớp enrichment:

| Key | Mặc định | Vai trò |
|-----|----------|---------|
| `enabled` | true | Bật pulse, insights enrichment, retrieval boost (không tắt GraphService) |
| `compactPulseEachTurn` | true | Inject block gọn mỗi turn sau insights lần đầu |
| `repeatFullInsights` | false | Cho phép lặp full god-node list mỗi turn (tốn token) |
| `dedupeGodNodesAcrossSources` | true | Smart-dep bỏ label đã có trong insights |
| `boostRetrievalWithGodNodes` | true | Boost file/symbol god node trong `RetrievalEngine` |
| `boostRetrievalWithActiveCommunity` | true | Boost file thuộc community đang active |
| `surfaceAnomaliesInInsights` | true | Subsection anomalies (cycles) trong insights |
| `surfaceSurprisesMax` | 5 | Cap notable connections trong insights |
| `warnWhenEditingCycleParticipant` | true | Intelligence + pulse cảnh báo cycle |
| `communityPruningEnabled` | true | `CommunityPruningPlugin` |
| `steerOnCriticalGodNode` | true | `GraphSteerPlugin` nhắc LSP trước edit |
| `strictGraphImpact` | false | Block edit thay vì chỉ notify trên god CRITICAL |

**Skill:** `skills/pi-scope-graph/SKILL.md` — workflow agent: god nodes, communities, LSP trước edit rủi ro cao.

### 4.3 Tình trạng kích hoạt

✅ **Pipeline + adoption v1 hoàn tất** (Phases A–C, 690 tests). Graph analysis chạy mọi session; cache disk hoạt động.

| Thành phần | File | Trạng thái |
|------------|------|------------|
| Full insights (lần đầu) | `context/graph-insights-format.ts` | ✅ God nodes, communities, bottlenecks, anomalies, surprises |
| Graph pulse (mỗi turn) | `context/graph-pulse.ts` | ✅ Active community, god nodes liên quan, cycle one-liner |
| Graph-aware retrieval | `context/retrieval.ts`, `dep-context.ts` | ✅ Signals `graph:god-node`, `graph:community` |
| Smart-dep dedupe | `smart-dep-context.ts` + `graphInsightGodLabels` | ✅ |
| Cycle warnings | `graph-cycle-warn.ts` + intelligence `extraSections` | ✅ |
| Graph steer | `plugins/graph-steer-plugin.ts` | ✅ CRITICAL god → `lsp_find_references` / `lsp_hover` |
| Tool không cần LSP | `tools/graph-impact-tool.ts` → `graph_symbol_impact` | ✅ |
| Dashboard | `/scope graph` | ✅ God nodes, communities, anomalies, active community |
| Metrics session | `graphPulseTokens`, `graphSteerCount`, `graphBoostedRetrievalCount`, `activeCommunityId` | ✅ |

### 4.4 Nhận xét sử dụng

🟢 **Adoption v1 hoàn tất** — graph là lớp ra quyết định kiến trúc mặc định, không chỉ dump một lần vào system prompt:

- Agent được **nhắc lại** god nodes quan trọng mỗi turn (pulse) thay vì chỉ đọc insights lúc start.
- Retrieval và dep-context **ưu tiên** file hub và module đang focus.
- Edit trên god node `CRITICAL` bị steer về LSP (tùy `strictGraphImpact`).
- Trùng lặp god labels giữa insights và smart-dep đã giảm nhờ dedupe.

**Giới hạn mô hình (không đổi):** graph dựa trên **import/export AST**, không phải call graph — god node = hub import. Với coupling runtime, vẫn cần `lsp_find_references` / `lsp_hover` để xác nhận.

### 4.5 Cơ hội cải thiện (Phase D — tùy chọn)

| Ưu tiên | Hạng mục | Ghi chú |
|---------|-----------|---------|
| 🟢 | Incremental graph sau auto-reindex | Patch nodes/edges thay vì full `assembleGraphAnalysis` |
| 🟢 | Community auto-label (`auth`, `metrics`, …) | Từ path prefix mode |
| 🟢 | Wikipedia inject | `analysis.wikipedia` cap 5 links cho symbol in-focus |
| 🟢 | `/scope graph --json` | Debug export, không đưa vào LLM context |
| 🟢 | Call-edge future | ADR tree-sitter call graph |

---

## 5. Nhóm 4: Intelligence Engine & Pattern Detection

### 5.1 Cách hoạt động

`ContextIntelligenceEngine` phân tích conversation history để sinh ra **actionable guidance** cho agent.

**AgentPatternDetector** nhận diện 3 loại pattern:

**A. Editing Intent** (10 keywords: "edit", "modify", "fix", "refactor"...):
- Trích xuất target symbols qua 6 regex patterns (camelCase, snakeCase, PascalCase, declaration keywords...)
- Detect hash annotations (`\b\d+[a-z]{2}\b` — e.g., "42nd")
- Cross-reference với god nodes để cảnh báo rủi ro

**B. Navigation Requests** ("where is X", "find the X", "references to X"):
- Phân loại: `definition` | `references` | `file_location`
- Đề xuất tool phù hợp: `lsp_go_to_definition` hoặc `lsp_find_references`

**C. Suboptimal Tool Usage**:
- Detect StrReplace patterns → đề xuất `hashline_edit`
- Detect manual file lookup → đề xuất LSP tools
- Detect compiler output (`error TS`, `file.ts(12,5)`) → gợi ý `lsp_hover`
- Detect god node discussion without impact analysis → cảnh báo

**D. Compiler errors** (`detectCompilerErrors`):
- Parse vị trí lỗi từ tool results (tsc, rustc, ESLint-style)
- Block **COMPILER ERRORS → LSP** trong guidance (`compiler-error-bridge.ts`)
- Khi `slim.lsp.suggestHoverOnCompilerErrors`: inject path lỗi vào dep-context cùng turn

**Guidance được inject qua pipeline (tách vai trò):**

| Nguồn | Ưu tiên | Nội dung |
|--------|---------|----------|
| `context-intelligence` | 4 | Workflow (một lần/session), risk, optimization, gợi ý theo turn mode |
| `smart-dep-context` | 5 | God nodes, architectural context, tool pattern hints |
| `dep-context` | 7 | File/skeleton injection (khi trigger) |

**Turn modes** (`classifyIntelligenceTurnMode`): `editing` \| `navigation` \| `overview` \| `idle` — điều khiển block nào được sinh (ví dụ `overview` bỏ workflow).

### 5.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Snapshot dùng `getIntelligenceSnapshot()` (cache fingerprint/turn). Config `slim.intelligence.enabled` và `repeatWorkflowGuidance` (mặc định `false`).

### 5.3 Nhận xét sử dụng

✅ **Đã cải thiện đáng kể (2026-05):**

- **Snapshot cache**: `getIntelligenceSnapshot()` — không re-analyze 2 lần trong cùng turn.
- **Community từ graph**: Khi có `graphAnalysis`, `detectMentionedGraphCommunities()` match label/id/node paths; legacy keywords chỉ fallback khi không có graph.
- **God-node matching thống nhất**: `godNodeMatchesSymbol()` từ `god-node-match.ts`.
- **BFS fan-out**: `computeDependentFanout()` từ `graph-impact.ts` cho risk warnings.
- **No-graph fallback**: Block `IMPACT UNKNOWN` + gợi ý `lsp_find_references` khi đang edit mà không có graph.
- **Dedupe injection**: Workflow một lần/session (`intelligenceWorkflowInjected`); architectural guidance chỉ ở `smart-dep-context`.
- **Cycle-aware guidance**: `formatCycleIntelligenceBlock` inject qua `IntelligenceGuidanceOptions.extraSections` khi `warnWhenEditingCycleParticipant` và file in-focus ∈ cycle.

**Còn lại (ưu tiên thấp):** feedback loop khi agent follow suggestion; unify intent với `query-intent` module.

### 5.4 Cơ hội cải thiện

- **Feedback loop**: Tăng confidence khi agent dùng tool được gợi ý.
- **Intent unification**: Một classifier cho broad query + editing + navigation.

---

## 6. Nhóm 5: Retrieval Engine

### 6.1 Cách hoạt động

`RetrievalEngine.retrieveTopK()` dùng multi-signal scoring để rank files:

```
score = 3 × symbolMatch      // file export symbol mà user nhắc đến
      + 2 × partialSymbolMatch // match một phần (lowercase substring)
      + 2 × filenameMatch      // filename chứa query token
      + 1 × depProximity       // file là dep của file đang focus
```

**Graph-aware boost** (`RetrievalEngine.applyGraphBoosts`, khi `slim.graph` bật):

- `+2` và signal `graph:god-node` — file path match god node (`godNodeMatchesFilePath`)
- `+2` và signal `graph:god-symbol` — symbol match god node label/id
- `+1` và signal `graph:community` — file thuộc `activeCommunityId` (từ `CommunityPruningPlugin`)

Boost chạy sau multi-signal scoring cơ bản; `dep-context` ghi `graphBoostedRetrievalCount` trên session stats.

**2-phase retrieval**: Phase 1 dùng symbol index (fast O(symbols)), Phase 2 scan toàn bộ files (fallback cho filename/dep matches).

### 6.2 Tình trạng kích hoạt

✅ **Đầy đủ.** RetrievalEngine được khởi tạo sau mỗi index build và được pass vào `ContextInjector`.

### 6.3 Nhận xét sử dụng

✅ **Đúng cách.** Scoring heuristic + graph boost tách module (`retrieval.ts`); path matching dùng `godNodeMatchesFilePath` / `godNodeMatchesSymbol` thống nhất với dep-context và LSP.

### 6.4 Cơ hội cải thiện

- **BM25 scoring**: Thay multi-signal heuristic bằng BM25 trên symbol names + file names + skeleton content.
- **Decay factor**: Các file được inject thường xuyên nên có higher base score (tránh fetch lại cold files liên tục).
- **Tune boost weights**: Hiện +2/+1 cố định — có thể expose qua `slim.graph` nếu cần A/B trên repo lớn.

---

## 7. Nhóm 6: Provider Guidance

### 7.1 Cách hoạt động

`loadProviderGuidance()` tìm và load file guidance theo provider:

```
Provider mapping:
  "anthropic"         → CLAUDE.md
  "openai"            → CODEX.md
  "google"            → GEMINI.md
  "google-gemini-cli" → GEMINI.md
```

Walk path: `~/.pi/agent/` (global) → ancestor dirs từ cwd lên root. Mỗi level check nếu file tồn tại và không trùng với AGENTS.md (content dedup).

Hỗ trợ **config override** qua `~/.pi/agent/agent-guidance.json`:
```json
{
  "providers": { "anthropic": ["CUSTOM-CLAUDE.md"] },
  "models": { "claude-sonnet-*": ["SONNET-SPECIFIC.md"] }
}
```
Model-specific patterns (glob) có priority cao hơn provider-level.

### 7.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Được check trong `handleBeforeAgentStart` khi `ctx.model?.provider` có giá trị.

### 7.3 Nhận xét sử dụng

✅ **Đúng cách.** Content dedup với AGENTS.md tránh inject trùng lặp. Global + local walking pattern đúng với UX expectation.

### 7.4 Cơ hội cải thiện

- **Hot reload**: Hiện tại chỉ load một lần/session. Nếu user sửa CLAUDE.md trong session, không được pick up. Thêm FSWatcher trên guidance files.
- **Multiple models**: Mapping hiện tại chỉ map 1 file/provider. Nhiều model configs có thể cần nhiều files kết hợp.

---

## 8. Nhóm 7: Context Files

### 8.1 Cách hoạt động

`loadContextFiles()` tìm các file project-local instructions:

**Default filenames**: `AGENTS.local.md`, `CLAUDE.local.md`

Walk từ cwd lên root, collect tất cả matching files ở mỗi level. Cho phép **layered configuration**: global project → submodule → feature folder.

### 8.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Được load trong `start()` và re-loaded sau auto-reindex.

### 8.3 Nhận xét sử dụng

✅ **Đúng cách.** Layered discovery là pattern tốt cho monorepos.

### 8.4 Cơ hội cải thiện

- **Custom filenames per project**: Config `contextFiles.filenames` cho phép override nhưng ít user biết tính năng này. Nên document rõ hơn.
- **Dynamic content**: Context files hiện là static. Thêm template support (`{{ godNodes | join(', ') }}`) sẽ cho phép guidance thích ứng với graph state.

---

## 9. Nhóm 8: Plugin System

### 9.1 Cách hoạt động

`PluginManager` quản lý lifecycle plugins. Mỗi plugin implement `Plugin` interface với các hooks tùy chọn:

```typescript
onSessionStart?(ctx)
onBeforeAgentStart?(event, ctx)
onContext?(messages[])    // modify in-place
onTurnEnd?(ctx)
onToolCall?(event, ctx)   // có thể block tool
onSessionShutdown?()
```

**Sáu plugins đang active:**

**A. ContextPruningPlugin**: 3 rules thi hành + 2 stub cấu hình:
- `deduplication`: Remove identical consecutive user/assistant messages (hash-based)
- `superseded-writes`: Remove cũ write results khi có write mới hơn cho cùng file
- `error-purging`: Remove tool errors khi followed by success
- ~~`recency`~~: Có trong `DEFAULT_RULE_CONFIG` (`recencyWindow: 10`) nhưng **chưa có implementation** trong `applyPruningRules` — dead config
- ~~`tool-pairing`~~: Cũng có trong `DEFAULT_RULE_CONFIG` nhưng **chưa có implementation** — dead config

**B. CommunityPruningPlugin**: 
- Detect active community từ file references trong user messages (3 gần nhất)
- Prune `developer`-role messages (context injections) không liên quan đến active community
- Luôn giữ developer message cuối cùng (fresh context)
- Tắt qua `slim.graph.communityPruningEnabled`; `activeCommunityId` feed retrieval boost + `/scope`

**C. HashlineSteerPlugin** / **HashlineValidatePlugin** (`plugins/hashline-*`):
- Steer hoặc block built-in `edit` khi file đã có hashline anchor (`strictMode`, `contextualStrictMode`)
- Nhắc `hashline_read` trước apply nếu path chưa đọc trong session

**D. LspSteerPlugin** (`plugins/lsp-steer-plugin.ts`):
- Nudge/block `grep`, `rg`, `read` line-targeted trên file đã index khi LSP phù hợp hơn
- `strictNavigation` → hard block thay vì chỉ notify

**E. GraphSteerPlugin** (`plugins/graph-steer-plugin.ts`):
- Khi edit (`hashline_edit`, `edit`, …) target symbol ∈ god node `CRITICAL` và chưa có `lsp_find_references` / `lsp_hover` / `graph_symbol_impact` gần đây
- Gợi ý hoặc block (`strictGraphImpact`) trước khi apply thay đổi blast radius cao
- `recordGraphSteer()` trên session stats

### 9.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Tất cả plugins register trong constructor `SessionManager`, trước `start()`. `onToolCall`: HashlineSteer, HashlineValidate, LspSteer, GraphSteer.

### 9.3 Nhận xét sử dụng

✅ **Phần lớn đúng cách.** Tuy nhiên:

**Vấn đề với CommunityPruningPlugin**: 
- Plugin phụ thuộc `graphService.analysis` — nhưng `graphService.analysis` chỉ có giá trị SAU khi `loadGraph()` trong `start()` hoàn thành. Plugin được register trước khi analysis có, nhưng điều này ổn vì `onContext` chỉ chạy per-turn sau khi start.
- **Community detection match quality thấp**: So sánh file mentions với node path parts (`file:relative/path/to/file.ts`) — nếu user nhắc "auth.ts" và node ID là "file:context/auth.ts", basename match sẽ work. Nhưng nếu user nhắc function name thay vì file name, không được detect.

**Vấn đề với ContextPruningPlugin**:
- Rule `superseded-writes` dùng regex `"(?:path|filePath)":\s*"([^"]+)"` để detect file paths trong tool results. Nếu format output thay đổi, rule này silent-fails.

### 9.4 Cơ hội cải thiện

- **Custom plugins từ project**: Không có mechanism load từ `.pi/scope-plugins/` — user phải fork extension để thêm plugin.
- **Plugin stats surface**: `getStats()` trên pruning plugins chưa lên status bar (chỉ telemetry nội bộ một phần).
- **Stale-anchor block**: HashlineValidate chỉ nhắc read; chưa block `hashline_edit` khi anchor chắc chắn stale.

---

## 10. Nhóm 9: LSP Integration

> **Kế hoạch triển khai đầy đủ:** `docs/LSP_ADOPTION_PLAN_VI.md` (adoption workflow, graph alignment, tools mở rộng, metrics).

### 10.1 Cách hoạt động

Tools LLM (`tools/lsp-navigation.ts`), server lazy-start per language (`lsp/service.ts`: TS, Python, Go, Rust):

| Tool | LSP method | Vai trò |
|------|------------|---------|
| `lsp_go_to_definition` | `textDocument/definition` | Tìm khai báo canonical |
| `lsp_find_references` | `textDocument/references` | Blast radius trước khi sửa |
| `lsp_hover` | `textDocument/hover` | Type/docs + graph + hashline anchor |
| `lsp_implementation` | `textDocument/implementation` | Interface → impl |
| `lsp_document_symbol` | `textDocument/documentSymbol` | Outline file |
| `lsp_workspace_symbol` | `workspace/symbol` | Tìm symbol theo tên |
| `lsp_go_to_definition_batch` | (batch) | Nhiều vị trí một lần |
| `lsp_diagnostics` | `publishDiagnostics` | Lỗi server trên file |
| `lsp_signature_help` | `textDocument/signatureHelp` | Gợi ý tham số tại call site |
| `graph_symbol_impact` | (graph only) | Impact markdown giống phần graph của hover — không cần LSP |

**`lsp_hover` enrichment** (`context/graph-lsp-hover.ts`):

- Lookup graph `file:rel/path:Symbol` (`context/graph-lsp-resolve.ts`)
- God node, community, impact BFS; reverse deps từ index
- Hashline anchor section (`hashline/lsp-hover-anchor.ts` khi `anchorOnLspHover`)

**Compiler bridge:** `shared/compiler-error-locations.ts` + `context/compiler-error-bridge.ts` — parse `file.ts(12,5)` từ bash/tsc → intelligence + inject path.

**Config `slim.lsp`** (schema `context/schema.ts`):

| Key | Mặc định | Vai trò |
|-----|----------|---------|
| `enabled` | true | Bật tools + enrichment |
| `enrichHoverWithGraph` | true | Graph section trên hover |
| `injectPathsSameTurn` | true | LSP paths vào dep-context turn hiện tại |
| `steerFromManualSearch` | true | `LspSteerPlugin` notify |
| `strictNavigation` | false | Block grep/read thay vì nudge |
| `suggestHoverOnCompilerErrors` | true | Compiler bridge + path inject |
| `probeServersOnStart` | true | Health trên `/scope` |
| `recordToolMetrics` | true | Counters LSP trên session stats |

**Skills:** `skills/pi-scope-lsp/SKILL.md` — workflow 0-based line/col, khi dùng tool nào.

### 10.2 Tình trạng kích hoạt

| Thành phần | Trạng thái |
|------------|------------|
| Navigation + extended tools (9 LSP tools) | ✅ |
| `graph_symbol_impact` (graph-only) | ✅ |
| Graph-enhanced hover + file-scoped lookup | ✅ |
| Hashline anchor on hover | ✅ |
| Same-turn dep-context từ LSP paths | ✅ (`injectPathsSameTurn`) |
| Compiler error → LSP bridge | ✅ (`suggestHoverOnCompilerErrors`) |
| `slim.lsp` config / metrics / steer | ✅ |
| Server health on `/scope` | ✅ |
| Diagnostics + signature help tools | ✅ |

### 10.3 Nhận xét sử dụng

🟢 **Adoption v1 hoàn tất** (plan Phases A–D): steer, metrics, same-turn inject, graph-aligned hover, compiler bridge.

- Vẫn cần language server trên `$PATH`; không có server → fallback read/grep.
- `lsp_diagnostics` cần mở file và chờ publish — không thay thế hoàn toàn output `tsc` trong CI.

### 10.4 Cơ hội cải thiện (tùy chọn)

| Ưu tiên | Hạng mục |
|---------|-----------|
| 🟢 | Workspace-wide diagnostic sweep (không chỉ một file) |
| 🟢 | Tự động gọi `lsp_hover` sau bash fail (hiện chỉ gợi ý trong intelligence) |
| 🟢 | `codeAction` / rename LSP tools |

---

## 11. Nhóm 10: Hashline Editor

### 11.1 Cách hoạt động

`hashline_edit` cho phép edit file bằng **line anchors** (`LINE+BIGRAM`, ví dụ `42nd` = dòng 42 + bigram hash nội dung dòng đó), thay vì khớp chuỗi mù như `edit` / `search_replace`.

**Workflow chuẩn (adoption v2)** — chi tiết: `docs/HASHLINE_ADOPTION_PLAN_VI.md`, skill `skills/pi-scope-hashline/SKILL.md`:

```
dep-context anchors / hashline_read  →  hashline_edit (dry_run: true)
       →  review diff  →  hashline_edit (dry_run: false)
```

| Bước | Cơ chế |
|------|--------|
| Đọc anchor | `hashline_read` tool, `/hashline-read`, hoặc block anchor trong dep-context (đầu file + vùng quanh `file:line` citation) |
| Validate + preview | `dry_run: true` — không ghi disk; diff compact trong tool result |
| Apply | `dry_run: false` — ghi file; `AnchorStateManager` reconcile shift qua Myers diff trên `computeLineHash` |
| Lỗi anchor cũ | `HashlineMismatchError` — không apply; gợi ý `hashline_read` kèm `start_line` / `end_line` ±3 dòng |

**Operations**: `replace_line`, `replace_range`, `append_at`, `prepend_at`, `append_file`, `prepend_file`.

**Enforcement** (tùy config):

- `HashlineSteerPlugin` — notify hoặc block `edit` / `search_replace` khi file đã có anchor (`strictMode`, `contextualStrictMode`).
- `HashlineValidatePlugin` — nhắc `hashline_read` trước apply nếu file chưa được đọc trong session.
- `preferDryRun` — telemetry khi apply mà chưa dry_run trên path đó.

**Phase D (file lớn & UX)**:

- Slice ≥ `streamAnnotateThresholdLines` (mặc định 500) → annotate theo chunk qua `hashline/streaming.ts`.
- Sau dry_run thành công → turn kế inject block preview (pipeline priority 8, `injectDryRunFollowUp`).
- `lsp_hover` kèm section Hashline anchor khi `anchorOnLspHover` bật.

### 11.2 Tình trạng kích hoạt

✅ **Adoption v2 hoàn tất** (Phases A–D):

| Phase | Thành phần | Trạng thái |
|-------|------------|------------|
| A | `hashline_read`, `/hashline-read`, anchor theo region/citation, per-turn workflow block | ✅ |
| B | `contextualStrictMode`, metrics `/scope`, `HashlineValidatePlugin`, `preferDryRun` | ✅ |
| C | `AnchorStateManager` + `computeLineHash`, LSP hover anchor, `hashlineMismatches` | ✅ |
| D | Stream read lớn, dry-run follow-up inject, mismatch recovery hints | ✅ |

**Config `hashline` gợi ý (cân bằng)**:

```jsonc
"hashline": {
  "enabled": true,
  "annotateDepContext": true,
  "annotateMaxLinesPerFile": 120,
  "annotateBySymbolRange": true,
  "annotateRangePaddingLines": 15,
  "preferDryRun": true,
  "steerFromBuiltinEdit": true,
  "contextualStrictMode": true,
  "strictMode": false,
  "recordOnRead": true,
  "anchorOnLspHover": true,
  "streamAnnotateThresholdLines": 500,
  "streamChunkLines": 200,
  "injectDryRunFollowUp": true
}
```

### 11.3 Nhận xét sử dụng

🟢 **Đúng cách khi agent tuân workflow:** có nhiều điểm chạm (inject, tool, LSP, steer) để dẫn tới `hashline_edit` + dry_run trước apply.

🟡 **Vẫn phụ thuộc agent** nếu tắt `contextualStrictMode` / `strictMode` — built-in `edit` vẫn khả dụng.

🔴 **Rủi ro còn lại:** file đổi ngoài session (user/editor khác) → mismatch; cần `hashline_read` lại. File cực lớn: stream giúp đọc nhưng dep-context vẫn bị cap token.

### 11.4 Cơ hội cải thiện (backlog)

| Ý tưởng | Ghi chú |
|---------|---------|
| `coerceDryRun: true` | Tự ép dry_run lần đầu thay vì chỉ notify |
| Incremental anchor inject | Chỉ inject vùng symbol đang focus, giảm token |
| Metrics trend | `hashlineEdits` / mismatch rate theo session trong `/scope history` |

---

## 12. Nhóm 11: File Detector

### 12.1 Cách hoạt động

`shared/file-detector.ts` trích xuất file paths từ 3 nguồn:

1. **Tool call arguments** (`detectPathsInToolCall`): `path`, `filePath`, `file`, …; `bash` scan command string.

2. **Tool output** (`detectPathsInOutput` → `detectPathsInText` + `detectCompilerErrorLocations`):
   - Citation `file.ts:42` / range `file.ts:42-50`
   - Path có extension known
   - **Compiler errors:** `file.ts(12,5): error TS…`, `file.ts:12:5 - error`, rustc ` --> file.rs:12:5` — kèm `startColumn` 0-based cho LSP

3. **Text messages** (`detectPathsInText`): user/assistant free text.

**Luồng downstream:**

- `handleContext` → `extraPaths` + `lineRefs` cho `ContextInjector`
- Compiler hints → `snapshot.insights.compilerErrors` → intelligence block + (nếu bật) `lspResolvedPathsThisTurn`
- LSP tool paths → `tools/lsp-result-paths.ts` (`collectLspPathsFromMessages`) khi `injectPathsSameTurn`

### 12.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Được gọi trong `handleContext()` cho mọi message.

### 12.3 Nhận xét sử dụng

✅ **Đúng cách.** Multi-source detection đảm bảo không bỏ sót file context.

### 12.4 Cơ hội cải thiện

- **Symbol extraction from output**: Parse tên symbol từ message TS (`Property 'X' does not exist`) → boost RetrievalEngine.
- **Auto `lsp_hover`**: Hiện chỉ gợi ý trong intelligence; chưa tự gọi tool sau bash fail.

---

## 13. Nhóm 12: Query Intent & Auto-Reindex

### 13.1 Query Intent Classification

`isBroadCodebaseQuery()` nhận diện **broad codebase overview queries** — những câu hỏi tổng quan không nhắc file/symbol cụ thể:

```
"What does this project do?" ✓
"Show me the architecture" ✓
"What are the main files?" ✓
"Edit auth.ts" ✗ (specific)
"How does AuthService work?" ✗ (specific)
```

Khi detect broad query: inject top files by reverse-dependency centrality + entry point files (`index.ts`, `manager.ts`...) thay vì empty context.

### 13.2 Auto-Reindex

**Trigger**: FSWatcher trên `projectRoot`. Sau 300ms debounce sau lần thay đổi cuối.

**Ignored paths**: `.git/`, `.pi/`, `node_modules/`, `dist/` — để tránh loop và noise.

**Lock mechanism**: `autoReindexInFlight` promise đảm bảo không có 2 reindex chạy đồng thời. `autoReindexQueued` flag cho lần kế tiếp khi đang busy.

**State reset sau reindex**: `repoMapInjected = false`, etc. — đảm bảo fresh index + graph được inject vào lần turn tiếp theo.

### 13.3 Tình trạng kích hoạt

✅ **Cả hai đầy đủ.** Auto-reindex được verified qua `manager-reindex.test.ts`.

### 13.4 Cơ hội cải thiện

- **Broad query + graph**: Khi detect broad query VÀ có graph analysis, surface community overview thay vì chỉ entry points. "Project có 4 communities: auth-layer, data-layer, api-layer, infra-layer" là context tốt hơn nhiều cho overview queries.
- **Query intent feed-forward**: Intent được classify nhưng không được pass vào downstream. `IntelligenceEngine` cũng classify intent — hai systems có thể unify.

---

## 14. Nhóm 13: Metrics & Tracking

### 14.1 Cách hoạt động

**SessionStats** (`metrics/tracker.ts`) track mọi injection per-session:

```
indexedFiles, indexSource (cache/fresh), depEdges
repoMapTokens, graphInsightsTokens, graphPulseTokens, intelligenceTokens
depContextTriggers, depContextTotalTokens
totalTokensSaved, savingsRatio
godNodesCount, communityCount, circularDependencies
graphSteerCount, graphBoostedRetrievalCount, activeCommunityId
hashlineEdits, hashlineMismatches, builtinEditSteered
lspGoToDef, lspFindRefs, lspHover, lspWorkspaceSymbol, …, lspErrors
```

Được persist thành JSONL khi `shutdown()`:
- `stats.jsonl`: append-only, 1 record/session
- `state.json`: last session summary (JSON)

**GraphMetrics** (`metrics/graph-metrics.ts`) cung cấp:
- Quality score (0–100)
- Performance: analysisMs, cacheHit, throughput
- Token savings estimate từ community filtering

### 14.2 Tình trạng kích hoạt

✅ **Đã kích hoạt đầy đủ (2026-05):**

| Kênh | Nội dung |
|------|----------|
| `/scope` | Dashboard: index, graph, injections, graph pulse/steer, hashline/LSP, active community, savings |
| `/scope graph` | Chi tiết god nodes, communities, surprises, anomalies, prune stats |
| `/scope history` | 5 session gần nhất từ `stats.jsonl` + averages |
| Status bar | `Q{score}`, `saved ~Nt` khi có dữ liệu |
| Startup notify | Graph quality warn/info (`slim.metrics`) |
| Shutdown notify | Token savings summary |
| Persist | `stats.jsonl` + `state.json` với field mở rộng (`graphQualityScore`, `totalInjectionTokens`, …) |

Config: `slim.metrics` (`enabled`, `notifyOnShutdown`, `notifyQualityOnStart`, `warnQualityBelow`, `warnCyclesAbove`, `historyLimit`).

### 14.3 Cơ hội cải thiện (backlog)

- **CSV export** hoặc HTML trend chart từ `stats.jsonl`.
- **Per-turn injection log** (`injections.jsonl`) cho debug chi tiết.
- ~~**Real-time `activeCommunityId`**~~: ✅ `setActiveCommunityId` + cập nhật `computeGraphTokenMetrics(..., 1)` khi có community active.

---

## 15. Đánh Giá Tổng Thể

### 15.1 Điểm mạnh

1. **Architecture rõ ràng**: SRP được áp dụng nhất quán. Mỗi module chỉ làm 1 việc.
2. **Zero-friction activation**: User không cần config gì — tất cả tính năng bật mặc định.
3. **Graceful degradation**: Khi graph không load, system tiếp tục hoạt động với basic context. Khi LSP không start được, tools log warning nhưng không crash.
4. **Native graph analysis**: Không phụ thuộc external tools. Hoạt động offline hoàn toàn.
5. **Test coverage solid**: 690 tests — hashline v2, LSP v1, graph adoption v1, compiler bridge.

### 15.2 Điểm yếu hệ thống (còn lại)

1. ~~**Intelligence double compute**~~: ✅ `getIntelligenceSnapshot()`.
2. ~~**LSP adoption gap**~~: ✅ Steer, same-turn inject, graph `file:path:Symbol`, compiler bridge, 9 tools.
3. ~~**God node path match**~~: ✅ `godNodeMatchesFilePath` + graph-aware `RetrievalEngine`.
4. ~~**Community keywords hardcoded**~~: ✅ Graph communities + fallback.
5. ~~**Metrics invisible**~~: ✅ `/scope`, status bar, persist JSONL.
6. **Phụ thuộc agent discipline**: Steer (LSP, hashline, graph) là nudge/block có điều kiện — agent vẫn có thể bỏ qua nếu tắt strict flags.
7. **Polyglot index**: Chỉ TS/TSX/PY/RS parse AST; Go/Java/C++ chưa có skeleton trong index.
8. ~~**Graph adoption thụ động**~~: ✅ Pulse, retrieval boost, steer, `graph_symbol_impact` (v1).

### 15.3 Tính năng "hidden gem" — trạng thái (2026-05-30)

| Tính năng | Trạng thái | Cách agent/user khám phá |
|-----------|------------|---------------------------|
| Graph impact BFS trong `lsp_hover` | ✅ | `graph-lsp-hover.ts` + `graph-lsp-resolve.ts` (file-scoped node id) |
| LSP same-turn path inject | ✅ | `collectLspPathsFromMessages` + compiler error paths |
| Compiler → LSP guidance | ✅ | `compiler-error-bridge` trong intelligence |
| `lsp_diagnostics` / `lsp_signature_help` | ✅ | Mở document + publishDiagnostics / signatureHelp |
| LspSteerPlugin | ✅ | Nudge/block grep·read khi `slim.lsp` bật |
| CommunityPruningPlugin | ✅ | Tự chạy khi ≥2 communities; telemetry prune |
| Broad query + community overview | ✅ Kích hoạt | `isBroadCodebaseQuery` + overview communities trong dep-context |
| `dry_run` + follow-up inject | ✅ Kích hoạt | dry_run trong schema; preview inject turn sau (`injectDryRunFollowUp`) |
| `hashline_read` + stream lớn | ✅ Kích hoạt | Tool + `/hashline-read`; chunk khi slice ≥ 500 dòng |
| Hashline steer / validate | ✅ Kích hoạt | `HashlineSteerPlugin`, `HashlineValidatePlugin`, metrics trên `/scope` |
| Provider guidance (`agent-guidance.json`) | ✅ Kích hoạt | Telemetry khi load file; hiện trong `/scope` dashboard |
| `dependencyDepth` (0–3) | ✅ Kích hoạt | README/skills + dòng trong tools block + `/scope` |
| Surprise connections | ✅ Kích hoạt (một phần) | Session-start graph insights + hover khi symbol khớp |
| Bottlenecks trong graph insights | ✅ Kích hoạt | `graph-insights-format.ts` + `/scope` |
| Anomalies (cycles) trong insights | ✅ Kích hoạt | `surfaceAnomaliesInInsights` |
| Graph pulse mỗi turn | ✅ Kích hoạt | `formatGraphPulse` priority 4.5 |
| GraphSteerPlugin | ✅ Kích hoạt | CRITICAL god → LSP trước edit |
| `graph_symbol_impact` tool | ✅ Kích hoạt | Không cần language server |
| `/scope graph` | ✅ Kích hoạt | Subcommand architecture detail |
| `/scope` dashboard | ✅ Kích hoạt | Lệnh `/scope` + graph/LSP/hashline counters |

---

## 16. Các Cơ Hội Cải Thiện

Xếp theo độ ưu tiên (impact × effort):

### 🔴 Ưu tiên cao — Fix bugs/mismatch

| # | Vấn đề | File | Fix |
|---|--------|------|-----|
| 1 | ~~God node boost không match đúng~~ | `context/dep-context.ts` | ✅ `godNodeMatchesFilePath` |
| 2 | ~~`lsp_hover` dùng filename thay vì symbol~~ | `context/graph-node-id.ts` | ✅ `extractSymbolFromHoverText` |
| 2b | ~~LSP adoption Phase A–D~~ | `docs/LSP_ADOPTION_PLAN_VI.md` | ✅ Hoàn tất (2026-05-30) |
| 3 | ~~Intelligence snapshot double compute~~ | `manager.ts` | ✅ `getIntelligenceSnapshot` cache theo fingerprint |
| 4 | ~~Community detection hardcoded keywords~~ | `context/intelligence-engine.ts` | ✅ `detectMentionedGraphCommunities()` |

### 🟡 Ưu tiên trung bình — Nâng cao tính năng có sẵn

| # | Cải thiện | Effort |
|---|-----------|--------|
| 5 | ~~Surface bottlenecks trong graph insights~~ | ✅ Done |
| 6 | ~~Log graph quality score khi startup~~ | ✅ Done (`onGraphQuality`) |
| 7 | ~~Token savings notification khi shutdown~~ | ✅ Done (`onSessionShutdown`) |
| 8 | Broad query → community overview thay vì entry points | Trung bình |
| 9 | ~~Auto-inject line anchors~~ | ✅ Hashline adoption A–D |
| 10 | ~~`/scope` dashboard~~ | ✅ |
| 11 | ~~LSP extended tools + compiler bridge~~ | ✅ LSP adoption v1 |
| 12 | ~~Code-Graph adoption v1~~ | ✅ `GRAPH_ADOPTION_PLAN_VI.md` Phases A–C |
| 12b | Code-Graph Phase D (incremental, wikipedia, …) | 📋 Tùy chọn |

### 🟢 Ưu tiên dài hạn — New capabilities

| # | Tính năng mới | Effort |
|---|---------------|--------|
| 12 | Incremental indexing (chỉ re-parse files thay đổi) | Cao |
| 13 | Go/Java/C++ language parsers | Cao |
| 14 | Custom plugin loading từ `.pi/scope-plugins/` | Cao |
| 15 | Session stats dashboard (HTML hoặc TUI) | Trung bình |
| 16 | Provider guidance hot-reload | Thấp |
| 17 | Dynamic community naming từ file patterns | Trung bình |
| 18 | LSP workspace diagnostic sweep; auto-hover sau bash | Trung bình |

---

## Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| `docs/HASHLINE_ADOPTION_PLAN_VI.md` | Hashline Phases A–D (hoàn tất) |
| `docs/LSP_ADOPTION_PLAN_VI.md` | LSP Phases A–D (hoàn tất) |
| `docs/GRAPH_ADOPTION_PLAN_VI.md` | Code-Graph adoption Phases A–C (hoàn tất), D (tùy chọn) |
| `skills/pi-scope-hashline/SKILL.md` | Workflow hashline cho agent |
| `skills/pi-scope-lsp/SKILL.md` | Workflow LSP cho agent |
| `skills/pi-scope-graph/SKILL.md` | Workflow graph / god nodes / communities cho agent |
| `ARCHITECTURE.md` | Kiến trúc kỹ thuật (EN) |

---

*Báo cáo pi-scope v0.7.0 · Cập nhật 2026-05-30: hashline v2 + LSP v1 + graph adoption v1 · **690 tests pass**.*
