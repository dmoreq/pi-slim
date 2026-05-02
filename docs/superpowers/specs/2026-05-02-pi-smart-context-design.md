# Design: pi-smart-context Extension

**Date:** 2026-05-02
**Author:** Albert Doan
**Status:** Approved
**Reference:** `pi-context-optimization-proposal.md`

---

## Problem

`pi-coding-agent` has no awareness of project structure. When the LLM edits a file, it has no knowledge of what that file imports, what calls it, or how it fits into the broader codebase. This causes context hallucination — the LLM uses wrong internal APIs, misses dependencies, and produces code that doesn't integrate correctly.

Note: two of the proposal's three problems are already solved by pi-coding-agent:
- **Output inefficiency** → `edit.ts` already uses `{oldText, newText}` search/replace
- **Token waste from full reads** → `read.ts` already truncates with offset/limit paging

The genuine gap is **dependency-aware context injection**.

---

## Solution

A pi extension (`packages/smart-context`) that builds an AST-based index of the project at startup, maintains a dependency graph, and automatically injects relevant file skeletons into the system prompt before each LLM turn.

---

## Architecture

```
packages/smart-context/
├── src/
│   ├── index.ts                  # pi extension entry point
│   ├── index-engine.ts           # orchestrates parsing + graph building
│   ├── disk-cache.ts             # SHA-256 hash-based persistent cache
│   ├── context-injector.ts       # beforeTurn hook, builds injection payload
│   ├── parsers/
│   │   ├── language-parser.ts    # interface definition
│   │   ├── typescript-parser.ts
│   │   ├── python-parser.ts
│   │   └── rust-parser.ts
│   └── types.ts
├── package.json
└── tsconfig.json
```

### Data Flow

**Startup:**
```
Project dir → IndexEngine → LanguageParser(s) → FileIndex[]
                                                      ↓
                                             DiskCache (read/write)
                                                      ↓
                                             In-memory RepoIndex
```

**Per agent turn:**
```
pi pre-turn hook → ContextInjector
                           ↓
              Scan last N messages for file paths
              + tool call history (read/edit/write)
                           ↓
              Lookup 1st-degree deps in DependencyGraph
                           ↓
              Pull skeletons from SkeletonMap
                           ↓
              Append <repo-context> block to system prompt
```

---

## Components

### 1. LanguageParser Interface

```typescript
interface LanguageParser {
  readonly extensions: string[]
  parseFile(path: string, content: string): FileIndex
}

interface FileIndex {
  path: string
  skeleton: string       // signature-only representation
  imports: string[]      // raw unresolved import strings
  contentHash: string    // SHA-256 of file content
}
```

Each parser uses `tree-sitter` (npm) with the appropriate grammar to walk the AST and extract structural nodes only — no bodies, no comments.

**Skeleton format per language:**

TypeScript — function/class/interface/type signatures, exported constants:
```
// src/core/agent-session.ts
export class AgentSession { ... }
export function createSession(config: SessionConfig): AgentSession
export type SessionState = 'idle' | 'running' | 'done'
```

Python — `def` and `class` signatures, module-level assignments:
```
# src/main.py
class Agent:
    def run(self, config: Config) -> None: ...
    def stop(self) -> None: ...
def create_agent(config: Config) -> Agent: ...
```

Rust — `fn`, `struct`, `enum`, `trait`, `impl` signatures:
```
// src/lib.rs
pub struct Parser { ... }
pub fn parse(input: &str) -> Result<Ast, Error>
pub trait Visitor { fn visit(&self, node: &Node); }
```

The `...` in skeleton bodies is intentional — it signals to the LLM that an implementation exists but is omitted.

**Adding a new language:** implement `LanguageParser`, register in `IndexEngine`'s parser map keyed by file extension. No other changes required.

---

### 2. IndexEngine

Orchestrates the full startup sequence and owns the in-memory `RepoIndex`.

**Startup sequence:**
1. Load DiskCache → `Map<path, FileIndex>`
2. Walk project directory, respecting `.gitignore` (via `ignore` npm package)
3. For each source file:
   - Compute SHA-256 of content
   - If hash matches cache → use cached `FileIndex` (skip parsing)
   - If changed/new → parse with matching `LanguageParser` → update cache
4. Build `DependencyGraph` from all `FileIndex.imports`
5. Write updated entries to disk cache

**Import resolution per language:**

| Language | Import style | Resolution |
|---|---|---|
| TypeScript | `from './foo'`, `from '../bar'` | Relative to file; try `.ts`, `.tsx`, `/index.ts` |
| Python | `from .utils import foo` | Relative sibling file; stdlib/3rd-party discarded |
| Rust | `mod utils;`, `use crate::parser` | `mod` → sibling `.rs`; `use crate::` → from crate root |

External/stdlib imports are discarded — only intra-project edges are tracked.

**In-memory RepoIndex:**
```typescript
interface RepoIndex {
  skeletons: Map<string, string>          // absPath → skeleton
  deps: Map<string, Set<string>>          // absPath → direct imports (absPath)
  reverseDeps: Map<string, Set<string>>   // absPath → files that import this
}
```

`reverseDeps` is built in one pass over `deps` and enables future impact analysis ("what breaks if I change this?").

---

### 3. DiskCache

Stored at `<project-root>/.pi-cache/smart-context.json`.

```typescript
interface CacheFile {
  version: number                     // bump to force full rebuild on schema change
  entries: Record<string, FileIndex>  // absPath → FileIndex
}
```

- **Read:** Load on startup, verify version. Version mismatch → discard and rebuild.
- **Write:** After indexing, write changed entries atomically (write to `.tmp` → rename).
- **No mid-session file watching** — the cache is a startup artifact only. The LLM sees live file content via pi's `read` tool during the session; the cache catches up on next startup. This avoids `fs.watch` race conditions.
- `.pi-cache/` is added to `.gitignore` automatically on first run.

---

### 4. ContextInjector

Hooks into pi's extension lifecycle (exact hook name to confirm against pi's extension API — likely a pre-turn or system-prompt-generation event) and builds the injection payload.

**In-focus file detection:**
- Regex scan of the last N messages (default: 10) for file path patterns
- Tool call history scan — any file touched by `read`/`edit`/`write` is in focus

**Injection payload:**
```
<repo-context>
## Active files
[skeleton of each in-focus file]

## Their direct dependencies
[skeleton of each 1st-degree dep not already shown above]
</repo-context>
```

**Token budget guard:**
- Estimate token count as `chars ÷ 4`
- Configurable threshold (default: 8,000 tokens)
- If exceeded: truncate dependency skeletons first, then active file skeletons, preserving the most recently mentioned files

**Injection target:** Appended to the system prompt (not conversation history). This means each turn gets a freshly computed injection — stale context doesn't accumulate as files change.

---

## Configuration

Exposed via the pi extension config:

```typescript
interface SmartContextConfig {
  enabled: boolean           // default: true
  maxInjectionTokens: number // default: 8000
  scanLastNMessages: number  // default: 10
  exclude: string[]          // glob patterns to skip (e.g. ['**/*.test.ts'])
}
```

---

## Language Support

| Language | Extensions | Status |
|---|---|---|
| TypeScript | `.ts`, `.tsx` | Phase 1 |
| Python | `.py` | Phase 1 |
| Rust | `.rs` | Phase 1 |
| Go | `.go` | Future |
| Java | `.java` | Future |

---

## Performance Notes

- **Parsing:** `tree-sitter` Node.js bindings are fast enough for incremental parsing at startup. Full project parse of 1,000 files typically completes in under 2 seconds.
- **Future Rust upgrade:** If startup time becomes a bottleneck on very large repos (10,000+ files), the `IndexEngine` core can be rewritten in Rust using `napi-rs` without changing the `LanguageParser` interface or any other component. The interface boundary makes this migration surgical.

---

## What This Does NOT Include

- Full-text semantic search / RAG (proposed Phase 3 in the original proposal) — out of scope for this design; would be a separate extension
- Mid-session cache invalidation / file watching — explicitly out of scope; kept simple by design
- Support for monorepos with multiple `tsconfig.json` roots — future work

---

## Expected Impact

- **Context hallucination:** Reduced — LLM has structural awareness of the files it's editing and their dependencies
- **Token efficiency:** Improved — skeletons are typically 5-15% the size of full file content
- **API cost:** No change from output side (edit tool already uses search/replace); input cost increases slightly from skeleton injection but is offset by fewer re-reads and correction loops
