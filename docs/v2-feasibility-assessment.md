# pi-slim V2 Ideas — Feasibility Assessment

Evaluated against the current codebase (v0.6.0), architecture patterns, available data,
and token budget realities.

---

## Phase 1 Ideas (Worth Doing, 1-2 weeks)

### ✅ 1.1 Inverted Index (Symbol → Files)
**Description:** Build a `symbol → files[]` index so when the agent mentions `authenticate`,
pi-slim can find all files exporting an `authenticate` function.

**Current state:** Individual parsers (TypeScriptParser, PythonParser, RustParser) already
extract symbol names from skeletons. The skeleton format is:
```
export function authenticate(token: string): User
class AuthService
interface User
```

The data is already parsed — it's just stored raw in `RepoIndex.skeletons: Map<string, string>`.
No symbol-level index exists.

**Feasibility:** HIGH (★★★). Symbol names are already extracted by the parsers.
We just need to store a `Map<string, Set<string>>` (symbol → filePaths) alongside the
existing `RepoIndex`.

**Effort:** 30 min
- Modify `FileIndex` to include `exportedSymbols: string[]`
- Each parser already produces skeletons with names — extract them during `parseFile()`
- Add `symbolIndex: Map<string, string[]>` to `RepoIndex`
- Add a `retrieveBySymbol(name: string): string[]` method

**Token savings:** Massive. When agent says "modify the authenticate function", pi-slim
finds `auth.ts` without the agent needing to know the file name.

**Risk:** Low — additive change, backward compatible.

### ✅ 1.2 BM25 Keyword Search (Text Index)
**Description:** Full-text keyword search over filenames, symbol names, and content
to find relevant files when the agent doesn't mention specific file paths.

**Current state:** No text search at all. The only file detection is regex-based
file path matching in `shared/file-detector.ts` and `context/dep-context.ts`.

**Feasibility:** MEDIUM (★★☆). Requires an external BM25 library or porting
a BM25 implementation. The data to index already exists (filenames, skeleton content,
file paths).

**Effort:** 1-2 hours
- Build a text corpus from filenames + symbols + optional content
- Integrate with the retrieval layer
- Key decision: BM25 in JS vs use existing `search` tool from pi-sherlock

**Token savings:** Significant. When agent asks "git checkout logic", BM25 finds
`git-checkpoint.ts` even though the term "checkout" doesn't appear in the filename.

**Risk:** Medium. BM25 adds dependency weight. A simpler TF-IDF might suffice.

### ✅ 1.3 Basic Scoring + Top-K Retrieval
**Description:** Replace the current "detect file paths via regex" approach with
a proper scoring function that ranks files by relevance.

**Current state:** `ContextInjector.detectInFocusFiles()` uses regex on message content
+ file path matching. No scoring, no ranking, no relevance.

**Feasibility:** HIGH (★★★). All data exists. Just need to build the scoring pipeline.

**Effort:** 1 hour
- Build candidate files from: file path mentions + symbol matches + BM25 results
- Score each candidate
- Sort and pick top-K within token budget

**Risk:** Low — pure addition, no breaking changes.

### ✅ 1.4 Budget-Aware Traversal
**Description:** When building `<dep-context>`, inject files in score order and stop
when the token budget is exhausted — instead of the current "collect all, then trim"
approach.

**Current state:** `ContextInjector.buildInjection()` processes all detected files
and their deps, trims only when budget exceeded. No ordering within the budget.

**Feasibility:** HIGH (★★★). Already have token estimation. Just need to sort.

**Effort:** 30 min
- In `ContextInjector.buildInjection()`, sort inFocus files by score before injecting
- Track remaining budget per file
- Stop when budget exhausted

**Risk:** None. The pipeline already supports budget trimming.

### ✅ 1.5 Select Dedup for Hashes
**Description:** Store exported symbol names alongside the skeleton in `FileIndex`.
This is a prerequisite for inverted index and symbol matching.

**Current state:** Skeletons store raw text. Symbols are extracted at render time
in `RepoMapGenerator.extractNames()` but not persistently.

**Feasibility:** HIGH (★★★). Extract once, store permanently.

**Effort:** 15 min
- Add `exports: string[]` to `FileIndex` in `shared/types.ts`
- Extract in each parser's `parseFile()` method
- Store in cache

---

## Phase 2 Ideas (Worth Doing, 2-3 weeks)

### ⚠️ 2.1 Reverse Dependency Index
**Description:** Build a `file → (files that import it)` reverse index so pi-slim
can answer "what depends on auth.ts?" without grep.

**Current state:** `RepoIndex.deps` is a `Map<string, Set<string>>` — forward only
(file X → what X imports). No reverse index exists.

**Feasibility:** HIGH (★★★). Trivial to compute from existing data.

**Effort:** 15 min
- Add `reverseDeps: Map<string, Set<string>>` to `RepoIndex`
- Compute in `IndexEngine.buildGraph()` — just reverse the existing edges

**Value:** High. Impact analysis ("if I change auth.ts, what breaks?"),
better retrieval ranking, reduced LSP reliance.

### ⚠️ 2.2 Hashline Confidence Model
**Description:** Return confidence scores in hashline edit results
(how certain the anchor matched, whether it rebased, shift distance).

**Current state:** Hashline returns success/failure + warnings. No confidence model.

**Feasibility:** MEDIUM (★★☆). Data exists (auto-rebase distance, hash match status)
but not currently returned to the LLM.

**Effort:** 30 min
- Add confidence field to hashline result
- Surface rebase info: `{ rebased: true, shift: +2, confidence: 0.9 }`

**Value:** Medium. Makes the LLM aware of risk — it can re-verify if confidence is low.

### ⚠️ 2.3 Hashline Dry-Run Mode
**Description:** Add a `dry_run: true` parameter to hashline_edit that validates
anchors and shows the diff preview without writing the file.

**Current state:** No dry-run support. Edits always write to disk.

**Feasibility:** HIGH (★★★). Just skip the `writeFile()` call.

**Effort:** 10 min
- Add `dry_run` to tool schema
- Skip writeFile in the execute function
- Return the diff preview + potential errors

**Value:** High. Safe planning — the agent can check if hashes are valid before committing.

### ⚠️ 2.4 `/slim explain` Command
**Description:** Show WHY specific files were included in dep-context
(which signal triggered it, what score it had).

**Current state:** `/slim` shows aggregate stats. No explanation of per-file decisions.

**Feasibility:** HIGH (★★★). Scoring pipeline records per-file metadata.

**Effort:** 20 min
- Track per-file scoring metadata during context construction
- Expose via `/slim explain` command

**Value:** Medium. Developer UX. Helps users understand biases and tune scoring.

### ⚠️ 2.5 Multi-Tier Context Structure
**Description:** Split `<dep-context>` into `<primary>` (full skeletons for matched
files), `<secondary>` (partial skeletons), and `<tertiary>` (filenames only).

**Current state:** All injected files get their full skeleton. No distinction.

**Feasibility:** MEDIUM (★★☆). Requires a partial skeleton extractor that preserves
only matched symbols, not the entire file. The parsers currently generate complete
skeletons.

**Effort:** 1-2 hours
- Add selective symbol extraction in parsers or a post-processing step
- Modify ContextInjector to support tiered output

**Value:** High for large projects. Keeps primary context focused on what matters.

---

## Phase 3 Ideas (Needs More Thought)

### ❌ 3.1 Feedback Loop / Adaptive Learning
**Description:** Track which retrieved files were actually used by the agent, and
boost their scores in future retrievals.

**Feasibility:** LOW (★☆☆). pi-slim has no way to know which files the agent "used".
The agent doesn't report back which injected files it read or acted on. Would require
heuristics (e.g., "did the agent's response mention this file?") — fragile.

**Recommendation:** Defer. The idea is sound but the implementation requires
either LLM feedback or much more sophisticated heuristics.

### ❌ 3.2 Incremental Indexing with File Watcher
**Description:** Use `fs.watch()` to detect file changes and re-index only
affected files instead of the full project on each new session.

**Current state:** SHA-256 content hashing in `DiskCache` already avoids re-parsing
unchanged files. Each session walk discovers new/deleted files efficiently.

**Feasibility:** MEDIUM (★★☆). `fs.watch()` is unreliable on macOS and many CI
environments (recursive watching is not supported on all platforms).

**Value vs current:** DiskCache already handles this well. The cost of a full walk
is negligible (1-2s). Watcher adds complexity for marginal gain.

**Recommendation:** Keep current DiskCache approach. It's already incremental
at the file level.

### ❌ 3.3 Session Memory / Working Set Tracking
**Description:** Track which files are frequently used across sessions and bias
retrieval toward them.

**Feasibility:** MEDIUM (★★☆). Stats are already persisted (`.pi/slim/stats.jsonl`
tracks top files per session). But "working set" requires cross-session aggregation.

**Value:** Medium. Would require a new data store (SQLite or JSON) for session
aggregation.

**Recommendation:** Defer. Stats.jsonl is good enough. Aggregation can be a CLI tool.

---

## Phase 4 Ideas (Experimental — Not Recommended Now)

### ❌ 4.1 Embeddings
Using vector embeddings for semantic search over code.

**Problems:**
- Requires embedding model (external dependency)
- Embedding cost in tokens/time
- No clear benefit over BM25 for code search (symbol names and filenames
  are already precise — embeddings help with natural language, not code)
- Massive complexity increase

**Recommendation:** Skip. BM25 + symbol matching already covers 90% of code search.

### ❌ 4.2 Task-Aware Retrieval / Intent Detection
Detect the agent's task (debugging, refactoring, adding features) and adjust
retrieval strategy.

**Problems:**
- Intent detection from user messages is unreliable
- The current approach (let the agent ask for what it needs) works well
- Over-optimization for speculative tasks adds complexity

**Recommendation:** Defer until feedback loop data is mature.

### ❌ 4.3 Flow Extraction / Call Chain Visualization
Extract call chains and data flow graphs from the AST.

**Problems:**
- Tree-sitter parsers extract signatures, not call graphs
- Call graph analysis requires full function body parsing (heavy)
- Would require LSP or static analysis tools like `tsc`/`mypy`

**Recommendation:** Use existing LSP call hierarchy or grep instead.

---

## Summary: What to Implement Now

| # | Idea | Effort | Value | Verdict |
|---|------|--------|-------|---------|
| 1 | Symbol export extraction in parsers | 15 min | Prerequisite for everything | ✅ DO NOW |
| 2 | Inverted symbol index | 30 min | Massive token savings | ✅ DO NOW |
| 3 | Basic scoring + Top-K retrieval | 1 hour | Foundation for intelligent context | ✅ DO NOW |
| 4 | Budget-aware traversal ordering | 30 min | Better budget utilization | ✅ DO NOW |
| 5 | Reverse dependency index | 15 min | Impact analysis, retrieval ranking | ✅ DO NOW |
| 6 | Hashline dry-run mode | 10 min | Safe planning without writes | ✅ DO NOW |
| 7 | Hashline confidence model | 30 min | LLM awareness of edit risk | ✅ WORTH DOING |
| 8 | `/slim explain` | 20 min | Developer transparency | ✅ WORTH DOING |
| 9 | Multi-tier context | 1-2 hours | Focused context for large projects | ⚠️ DEFER |
| 10 | BM25 text index | 1-2 hours | Keyword search over code | ⚠️ DEFER |
| 11 | Feedback loop | Unknown | Adaptive learning | ❌ SKIP |
| 12 | Incremental indexing | 2-3 hours | Already handled by DiskCache | ❌ SKIP |
| 13 | Embeddings | Significant | Overkill for code search | ❌ SKIP |
| 14 | Task-aware retrieval | Significant | Unreliable intent detection | ❌ SKIP |

## Recommended Immediate Actions (1.5 hours)

These 6 changes form the **retrieval layer** — the biggest missing piece in pi-slim:

1. **Symbol export extraction** (15 min) — Add `exports: string[]` to `FileIndex`
2. **Inverted symbol index** (30 min) — Build `symbolIndex` in `RepoIndex`
3. **Scoring function** (30 min) — Filename match + symbol match + recency
4. **Top-K retrieval** (15 min) — Replace regex detection with scored retrieval
5. **Reverse dep index** (15 min) — Compute reverse edges during graph build
6. **Hashline dry-run** (10 min) — Add `dry_run` parameter to hashline_edit

**Expected token savings:** 30-50% reduction in unnecessary context injection,
plus elimination of most "read before edit" cycles via smarter file discovery.
