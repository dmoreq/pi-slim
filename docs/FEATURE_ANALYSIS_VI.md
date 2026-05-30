# Báo Cáo Phân Tích Tính Năng Pi-Scope Extension

> Tác giả: Claude Code  
> Ngày: 2025-05-30  
> Phiên bản: pi-scope v0.7.0  
> Số tests: 617/617 pass  

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
    └─ PluginManager: register ContextPruning + CommunityPruning

Mỗi lượt LLM call
    │
    ├─ handleBeforeAgentStart (lần đầu)
    │    ├─ RepoMap (graph-prioritized)
    │    ├─ GraphInsights (god nodes, communities)
    │    ├─ ContextIntelligence (workflow guidance)
    │    ├─ ProviderGuidance (CLAUDE.md, CODEX.md...)
    │    └─ ContextFiles (AGENTS.local.md...)
    │
    └─ handleContext (mỗi turn)
         ├─ FileDetector: quét tool calls & output
         ├─ RetrievalEngine: score + rank files
         ├─ ContextInjector: build dep-context
         ├─ SmartDepContext: community-aware hints
         └─ PluginManager.onContext: pruning
```

### Kết quả đánh giá nhanh

| Nhóm | Tình trạng kích hoạt | Sử dụng đúng cách | Tiềm năng tận dụng thêm |
|------|---------------------|-------------------|-------------------------|
| Index & Cache | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Context Pipeline | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Code-Graph | ✅ Đầy đủ | ✅ Tốt | 🔴 Cao |
| Intelligence Engine | ✅ Đầy đủ | 🟡 Một phần | 🔴 Cao |
| Retrieval Engine | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Provider Guidance | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Context Files | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Plugin System | ✅ Đầy đủ | ✅ Tốt | 🔴 Cao |
| LSP Integration | ✅ Đầy đủ | 🟡 Một phần | 🔴 Cao |
| Hashline Editor | ✅ Đầy đủ | 🟡 Một phần | 🔴 Cao |
| File Detector | ✅ Đầy đủ | ✅ Tốt | 🟢 Thấp |
| Query Intent | ✅ Đầy đủ | ✅ Tốt | 🟡 Trung bình |
| Metrics & Tracking | ⚠️ Thiếu exposure | 🟡 Một phần | 🔴 Cao |

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

**6 nguồn context được inject:**

| Nguồn | Priority | Khi nào | Token budget |
|-------|----------|---------|--------------|
| `repo-map` | 1 | Lần đầu (first turn) | `maxRepoMapTokens` = 4000 |
| `provider-guidance` | 2 | Lần đầu | shared budget |
| `graph-insights` | 3 | Lần đầu | shared budget |
| `context-intelligence` | 4 | Mỗi turn | `maxInjectionTokens` = 8000 |
| `smart-dep-context` | 5 | Mỗi turn | shared budget |
| `dep-context` | 7 | Mỗi turn | shared budget |
| `context-files` | 6 | Lần đầu | shared budget |

**One-shot injection flags**: Mỗi nguồn chỉ inject một lần/session (`repoMapInjected`, `graphInsightsInjected`, etc.). Khi auto-reindex, flags được reset để re-inject với dữ liệu mới.

### 3.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Tất cả 6 nguồn đều được register và build đúng cách.

### 3.3 Nhận xét sử dụng

✅ **Đúng cách.** Priority system rõ ràng, token budget được enforce. Tuy nhiên có **1 vấn đề tiềm ẩn**: `smart-dep-context` (priority 5) và `dep-context` (priority 7) đều inject per-turn. Trong một session dài, điều này tạo ra nội dung trùng lặp — `SmartDepContext` focus vào god nodes và community hints, còn `dep-context` inject skeleton thực tế. Cần kiểm tra xem chúng có overlap không.

### 3.4 Cơ hội cải thiện

- **Dynamic budget allocation**: Budget 4000+8000 tokens là fixed. Nên điều chỉnh theo kích thước codebase (project nhỏ cần ít hơn, project lớn cần nhiều hơn).
- **Source deduplication**: `smart-dep-context` nên check xem god nodes đã được inject bởi `graph-insights` chưa để tránh lặp.

---

## 4. Nhóm 3: Code-Graph Analysis

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

### 4.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Graph analysis chạy trong mọi session. Cache được sử dụng đúng cách — test cho thấy second start load từ cache với metrics giống hệt first start.

### 4.3 Nhận xét sử dụng

✅ **Phần lớn đúng cách**, nhưng có **3 điểm chưa tận dụng tối đa**:

1. **`graphSummary` bị bỏ qua**: `buildGraphMetricsSummary()` được gọi trong `loadGraph()` nhưng kết quả chỉ dùng để check cycles — không được log ra hay surface lên user. Quality score (0–100) là thông tin có giá trị.

2. **`cacheHit` không được thông báo**: Mỗi lần load từ cache vs fresh build, user chỉ thấy "Graph: N nodes, N edges" — không biết là từ cache hay tính toán mới. Thêm "(cached)" vs "(fresh, Xms)" vào notification sẽ hữu ích.

3. **Bottlenecks chưa được surface**: `GraphAnalysis.bottlenecks` được tính toán nhưng **không xuất hiện** trong `formatGraphInsightsSection()`. Bottlenecks (high betweenness nodes) quan trọng không kém god nodes.

### 4.4 Cơ hội cải thiện

- **Surface bottlenecks** trong graph insights section giống như god nodes.
- **Log quality score** khi khởi động: "Graph quality: 78/100 (3 cycles detected)".
- **Incremental graph update**: Khi auto-reindex chỉ có vài file thay đổi, không cần tái tính toàn bộ graph — chỉ cập nhật nodes/edges liên quan.
- **Community naming**: Louvain tạo ID như "comm-0", "comm-1". Có thể dùng file names phổ biến nhất trong cluster để đặt tên có ý nghĩa hơn.

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
- Detect god node discussion without impact analysis → cảnh báo

**Guidance được inject vào 2 nơi:**
- `handleBeforeAgentStart`: Block "🎯 WORKFLOW OPTIMIZATION" + risk warnings
- `handleContext` per-turn: `SmartDepContext` với high-priority symbols + architectural hints

### 5.2 Tình trạng kích hoạt

✅ **Hoàn toàn kích hoạt.** Intelligence engine chạy mỗi turn qua `buildIntelligenceSnapshot()`.

### 5.3 Nhận xét sử dụng

🟡 **Một phần tốt, nhưng có vấn đề quan trọng:**

**Vấn đề 1 — Double computation**: `buildIntelligenceSnapshot()` được gọi cả trong `handleBeforeAgentStart()` và `handleContext()`. Mỗi call này re-analyze toàn bộ conversation buffer. Không có caching giữa hai calls trong cùng một turn.

**Vấn đề 2 — Community detection bằng keyword hardcode**: `analyzeConversationMeta()` dùng list cứng:
```typescript
['auth', 'authentication', 'security', 'transport', 'client', 'api',
 'database', 'storage', 'ui', 'frontend', 'backend', 'service']
```
Đây là hardcoded domain keywords, không liên quan đến community names thực tế trong graph. Nếu project có community "payment-processing" hay "notification", sẽ không được detect.

**Vấn đề 3 — Risk warning chỉ show khi có graph**: Khi graph không load được (index rỗng), chỉ có `generateBasicGuidance()` — mất toàn bộ risk awareness. Cần fallback graceful hơn.

**Điểm tốt**: `computeDependencyFanout()` dùng BFS thực sự trên graph edges để tính affected communities — không chỉ ước lượng heuristic. Đây là implementation chính xác.

### 5.4 Cơ hội cải thiện

- **Cache intelligence snapshot** trong cùng một turn (pass snapshot từ `handleBeforeAgentStart` sang `handleContext`).
- **Thay hardcoded keywords** bằng dynamic community labels từ `graphAnalysis.communities[*].label`.
- **Feedback loop**: Khi agent thực sự dùng `hashline_edit` sau khi được suggest, tăng confidence score cho các lần suggest tiếp theo.

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

**God Node Boost**: Nếu graph analysis available, các file mà tên (stem) match với god node ID được boost `score × 2` — đảm bảo các file quan trọng nhất luôn xuất hiện trong context.

**2-phase retrieval**: Phase 1 dùng symbol index (fast O(symbols)), Phase 2 scan toàn bộ files (fallback cho filename/dep matches).

### 6.2 Tình trạng kích hoạt

✅ **Đầy đủ.** RetrievalEngine được khởi tạo sau mỗi index build và được pass vào `ContextInjector`.

### 6.3 Nhận xét sử dụng

✅ **Đúng cách.** Scoring formula đơn giản nhưng hiệu quả. God node boost đảm bảo high-centrality files được ưu tiên.

**Điểm yếu tiềm ẩn**: God node boost dùng `f.file.split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase()` để lấy stem, rồi so sánh với `godNode.nodeId.toLowerCase()`. Nhưng nodeId có format `file:relative/path/to/file.ts` — sẽ không match với stem. Match này có thể đang bị miss.

### 6.4 Cơ hội cải thiện

- **Fix god node boost matching**: Trích xuất path segment từ nodeId (`file:auth.ts` → `auth`) thay vì dùng toàn bộ nodeId.
- **BM25 scoring**: Thay multi-signal heuristic bằng BM25 trên symbol names + file names + skeleton content để retrieval chính xác hơn.
- **Decay factor**: Các file được inject thường xuyên nên có higher base score (tránh fetch lại cold files liên tục).

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

**Hai plugins đang active:**

**A. ContextPruningPlugin**: 4 rules:
- `deduplication`: Remove identical consecutive user/assistant messages (hash-based)
- `superseded-writes`: Remove cũ write results khi có write mới hơn cho cùng file
- `error-purging`: Remove tool errors khi followed by success
- `recency`: Protect last 10 messages from pruning

**B. CommunityPruningPlugin**: 
- Detect active community từ file references trong user messages (3 gần nhất)
- Prune `developer`-role messages (context injections) không liên quan đến active community
- Luôn giữ developer message cuối cùng (fresh context)

### 9.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Cả hai plugins được register trong constructor của `SessionManager`, trước khi `start()` được gọi.

### 9.3 Nhận xét sử dụng

✅ **Phần lớn đúng cách.** Tuy nhiên:

**Vấn đề với CommunityPruningPlugin**: 
- Plugin phụ thuộc `graphService.analysis` — nhưng `graphService.analysis` chỉ có giá trị SAU khi `loadGraph()` trong `start()` hoàn thành. Plugin được register trước khi analysis có, nhưng điều này ổn vì `onContext` chỉ chạy per-turn sau khi start.
- **Community detection match quality thấp**: So sánh file mentions với node path parts (`file:relative/path/to/file.ts`) — nếu user nhắc "auth.ts" và node ID là "file:context/auth.ts", basename match sẽ work. Nhưng nếu user nhắc function name thay vì file name, không được detect.

**Vấn đề với ContextPruningPlugin**:
- Rule `superseded-writes` dùng regex `"(?:path|filePath)":\s*"([^"]+)"` để detect file paths trong tool results. Nếu format output thay đổi, rule này silent-fails.

### 9.4 Cơ hội cải thiện

- **`onToolCall` hook chưa được dùng**: Hook này có thể block/allow tool calls. Chưa có plugin nào sử dụng. Cơ hội: plugin block `hashline_edit` khi anchor bị stale, tránh edit sai vị trí.
- **Custom plugins từ project**: Không có mechanism để load plugins từ `.pi/scope-plugins/` hay tương tự. User không thể extend behavior mà không modify source.
- **Plugin stats surface**: `ContextPruningPlugin.getStats()` và `CommunityPruningPlugin.getStats()` trả về data hữu ích nhưng không được expose ra status bar hay telemetry.

---

## 10. Nhóm 9: LSP Integration

### 10.1 Cách hoạt động

Ba tools được đăng ký với Pi agent:

**`lsp_go_to_definition`**: Tìm canonical declaration của symbol tại vị trí cursor. Sử dụng LSP `textDocument/definition`. Returns file path + line number.

**`lsp_find_references`**: Liệt kê tất cả call sites và usages. Sử dụng LSP `textDocument/references`. Hữu ích để assess "blast radius" trước khi sửa symbol.

**`lsp_hover` (graph-enhanced)**: 
- Gọi LSP `textDocument/hover` lấy type info + docs
- Nếu `currentAnalysis` available, pass qua `enhanceHoverWithGraphMetrics()`:
  - God node info + criticality level
  - Community membership
  - Impact analysis (BFS computed affected count)
  - Surprising connections info
  - Format thành Markdown với icons (🔥⚠️🔍)

`LspNavigationService` lazy-init — server chỉ được start khi tool lần đầu được gọi.

### 10.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Tất cả 3 tools được register qua `registerLspTools(pi)`.

**Graph enrichment của `lsp_hover`** đặc biệt quan trọng — đây là nơi graph analysis được surface trực tiếp đến agent.

### 10.3 Nhận xét sử dụng

🟡 **Phần lớn đúng cách, nhưng có điểm yếu:**

**Symbol extraction trong hover**: `symbolFromPosition()` hiện tại chỉ lấy **filename stem** làm symbol name:
```typescript
function symbolFromPosition(fp: string, _line: number, _column: number): string {
  return fp.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
}
```
→ `lsp_hover` trên `auth.ts` line 42 sẽ match graph với symbol "auth" (filename), không phải symbol thực tế ở dòng 42. Graph enrichment sẽ hiển thị thông tin của file-level node, không phải function-level node.

**Hậu quả**: Nếu hover trên function `authenticate` trong `auth.ts`, enrichment sẽ show info của "auth.ts" god node, không phải "authenticate" function. Đây là **mismatch về granularity**.

### 10.4 Cơ hội cải thiện

- **Fix symbolFromPosition**: LSP hover response thường chứa symbol name trong format `(method) authenticate(token: string): boolean`. Parse response text để extract actual symbol name trước khi graph lookup.
- **`lsp_hover` → dependency chain**: Khi hover một symbol, hiển thị thêm "Imported by N files" với top 3 importers.
- **Goto-definition batch**: Khi có nhiều symbols trong một query, có thể resolve tất cả song song thay vì sequential.

---

## 11. Nhóm 10: Hashline Editor

### 11.1 Cách hoạt động

`hashline_edit` tool cho phép edit file bằng **line anchors** thay vì content matching.

**Anchor format**: `LINE+BIGRAM` — ví dụ `"42nd"` = dòng 42, bigram hash của content ở dòng đó là "nd".

**Flow**:
1. Agent đọc file qua `/hashline-read <file>` → nhận skeleton với anchors annotated
2. Agent gọi `hashline_edit` với các `{loc, content}` operations
3. Tool validate hash tại vị trí → apply edits → write atomically

**Operations**: `replace_line`, `replace_range`, `append_at`, `prepend_at`, `append_file`, `prepend_file`

**Rebase**: Hash chịu được shift ±5 dòng — nếu code đã thêm/bớt vài dòng trước edit, anchor vẫn valid trong range cho phép.

**Dry-run mode**: `dry_run: true` validate mà không write — phù hợp để kiểm tra trước khi commit changes.

### 11.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Tool được register và guidance được inject vào system prompt.

### 11.3 Nhận xét sử dụng

🟡 **Tiềm năng chưa được tận dụng đúng mức:**

**Vấn đề 1 — Guidance position**: "Use `hashline_edit`" guidance được đặt trong `toolsBlock` **sau tất cả content khác** trong system prompt. LLMs tend to weight earlier context more — guidance này có thể bị ignore.

**Vấn đề 2 — Intelligence Engine gợi ý nhưng không enforce**: `PatternDetector` detect StrReplace patterns và suggest hashline_edit. Nhưng không có mechanism nào **block** built-in edit tool hay **redirect** sang hashline. Suggestion là passive.

**Vấn đề 3 — `/hashline-read` là separate command**: Để dùng hashline_edit hiệu quả, agent cần dùng `/hashline-read` trước để có anchors. Nhưng built-in `read` tool không có anchors. Agent có thể dùng built-in read → không có anchors → không thể dùng hashline_edit đúng cách.

### 11.4 Cơ hội cải thiện

- **Auto-inject anchors**: Khi `dep-context` inject skeleton của file, thêm line anchors vào skeleton. Agent sẽ luôn có anchors mà không cần gọi riêng `/hashline-read`.
- **Intelligence-guided routing**: Khi `onToolCall` hook fires cho `edit` tool, check nếu file đã có skeleton với anchors → suggest/redirect sang `hashline_edit`.
- **Diff preview trong system prompt**: Khi `dry_run: true`, show diff trong một compact format để agent review trước khi confirm.

---

## 12. Nhóm 11: File Detector

### 12.1 Cách hoạt động

`FileDetector` trích xuất file paths từ 3 nguồn:

1. **Tool call arguments** (`detectPathsInToolCall`): Scan `path`, `filePath`, `file`, `target`, `destination`, `source` keys. Đặc biệt handle `bash` tool bằng cách scan command string.

2. **Tool output content** (`detectPathsInOutput`): Scan text output của tool results (compiler errors, grep results, git status...) cho file paths có extension known.

3. **Text messages** (`detectPathsInText`): Scan user/assistant messages. Dùng 2 regexes: citation format (`file.ts:42`) và path format.

Kết quả được pass vào `ContextInjector` như `extraPaths` — đảm bảo files mentioned trong tool calls được inject vào dep-context ngay lập tức.

### 12.2 Tình trạng kích hoạt

✅ **Đầy đủ.** Được gọi trong `handleContext()` cho mọi message.

### 12.3 Nhận xét sử dụng

✅ **Đúng cách.** Multi-source detection đảm bảo không bỏ sót file context.

### 12.4 Cơ hội cải thiện

- **Symbol extraction from output**: Ngoài file paths, compiler errors cũng chứa symbol names. Extract symbols từ TypeScript errors (`Property 'X' does not exist`) → feed vào RetrievalEngine.
- **LSP diagnostic integration**: Khi bash output chứa TypeScript compiler errors, auto-trigger `lsp_hover` trên affected symbols.

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
repoMapTokens, graphInsightsTokens, intelligenceTokens
depContextTriggers, depContextTotalTokens
totalTokensSaved, savingsRatio
godNodesCount, communityCount, circularDependencies
```

Được persist thành JSONL khi `shutdown()`:
- `stats.jsonl`: append-only, 1 record/session
- `state.json`: last session summary (JSON)

**GraphMetrics** (`metrics/graph-metrics.ts`) cung cấp:
- Quality score (0–100)
- Performance: analysisMs, cacheHit, throughput
- Token savings estimate từ community filtering

### 14.2 Tình trạng kích hoạt

⚠️ **Kích hoạt nhưng thiếu exposure:**

`SessionStats` được populate đầy đủ, nhưng:
- Chỉ persist khi session shutdown
- Không có command nào để user xem stats trong session
- `GraphMetrics` được tính toán nhưng không được log hay display
- `stats.jsonl` tích lũy data nhưng không có tool để read/visualize

### 14.3 Cơ hội cải thiện

- **`/scope stats` command**: Hiển thị current session stats trong-session.
- **Graph quality warning**: Nếu `quality.cycleCount > 5` hoặc `quality.score < 60`, notify user ngay khi start.
- **Token savings report**: Ở cuối session, notify "Tiết kiệm ~X tokens (~Y%) so với full file reads". User feedback loop quan trọng.
- **Dashboard visualization**: `stats.jsonl` có đủ data để build trendline về: session length, injection effectiveness, most-mentioned files.

---

## 15. Đánh Giá Tổng Thể

### 15.1 Điểm mạnh

1. **Architecture rõ ràng**: SRP được áp dụng nhất quán. Mỗi module chỉ làm 1 việc.
2. **Zero-friction activation**: User không cần config gì — tất cả tính năng bật mặc định.
3. **Graceful degradation**: Khi graph không load, system tiếp tục hoạt động với basic context. Khi LSP không start được, tools log warning nhưng không crash.
4. **Native graph analysis**: Không phụ thuộc external tools. Hoạt động offline hoàn toàn.
5. **Test coverage solid**: 607 tests, integration tests cover full flow.

### 15.2 Điểm yếu hệ thống

1. **Intelligence Engine chạy double per turn**: `buildIntelligenceSnapshot()` gọi 2 lần/turn không có cache.
2. **Symbol granularity mismatch**: LSP hover dùng filename stem thay vì actual symbol — làm giảm accuracy của graph enrichment.
3. **God node boost có bug**: `retrieveTopK()` match god node với filename stem, nhưng nodeId format là `file:relative/path/to/file.ts` → match không xảy ra.
4. **Community keywords hardcoded**: 12 keywords domain-specific cho "auth/api/database" không scale với arbitrary projects.
5. **Metrics không visible**: Data được collect nhưng không được expose trong session.

### 15.3 Tính năng "hidden gem" — trạng thái sau kích hoạt (2025-05-30)

| Tính năng | Trạng thái | Cách agent/user khám phá |
|-----------|------------|---------------------------|
| Graph impact BFS trong `lsp_hover` | ✅ Kích hoạt | Parse symbol từ LSP hover + BFS dependents (`graph-impact.ts`); prompt nhắc `lsp_hover` |
| CommunityPruningPlugin | ✅ Kích hoạt | Tự chạy khi ≥2 communities; telemetry `comm prune` mỗi lượt prune |
| Broad query + community overview | ✅ Kích hoạt | `isBroadCodebaseQuery` + overview communities trong dep-context |
| `dry_run` trên `hashline_edit` | ✅ Kích hoạt | Khai báo trong tool schema + mô tả tool + prompt |
| Provider guidance (`agent-guidance.json`) | ✅ Kích hoạt | Telemetry khi load file; hiện trong `/scope` dashboard |
| `dependencyDepth` (0–3) | ✅ Kích hoạt | README/skills + dòng trong tools block + `/scope` |
| Surprise connections | ✅ Kích hoạt (một phần) | Session-start graph insights + hover khi symbol khớp |
| Bottlenecks trong graph insights | ✅ Kích hoạt (mới) | `formatGraphInsightsSection` + `/scope` |
| `/scope` dashboard | ✅ Kích hoạt (mới) | Lệnh `/scope` — trước đây chỉ có trong README |

---

## 16. Các Cơ Hội Cải Thiện

Xếp theo độ ưu tiên (impact × effort):

### 🔴 Ưu tiên cao — Fix bugs/mismatch

| # | Vấn đề | File | Fix |
|---|--------|------|-----|
| 1 | ~~God node boost không match đúng~~ | `context/dep-context.ts` | ✅ `godNodeMatchesFilePath` |
| 2 | ~~`lsp_hover` dùng filename thay vì symbol~~ | `tools/lsp-navigation.ts` | ✅ `extractSymbolFromHoverText` |
| 3 | ~~Intelligence snapshot double compute~~ | `manager.ts` | ✅ `getIntelligenceSnapshot` cache theo fingerprint |
| 4 | Community detection hardcoded keywords | `context/intelligence-engine.ts:337` | Dùng `graphAnalysis.communities[*].label` |

### 🟡 Ưu tiên trung bình — Nâng cao tính năng có sẵn

| # | Cải thiện | Effort |
|---|-----------|--------|
| 5 | ~~Surface bottlenecks trong graph insights~~ | ✅ Done |
| 6 | Log graph quality score khi startup | Thấp |
| 7 | Token savings notification khi shutdown | Thấp |
| 8 | Broad query → community overview thay vì entry points | Trung bình |
| 9 | Auto-inject line anchors vào dep-context skeletons | Trung bình |
| 10 | ~~`/scope` dashboard trong-session~~ | ✅ Done (`/scope`) |

### 🟢 Ưu tiên dài hạn — New capabilities

| # | Tính năng mới | Effort |
|---|---------------|--------|
| 11 | Incremental indexing (chỉ re-parse files thay đổi) | Cao |
| 12 | Go/Java/C++ language parsers | Cao |
| 13 | Custom plugin loading từ `.pi/plugins/` | Cao |
| 14 | Session stats dashboard (HTML hoặc TUI) | Trung bình |
| 15 | Provider guidance hot-reload | Thấp |
| 16 | Dynamic community naming từ file patterns | Trung bình |

---

*Báo cáo gốc dựa trên phân tích pi-scope v0.7.0. Phần hidden-gem activation đã được triển khai trong session 2025-05-30 (617 tests pass).*
