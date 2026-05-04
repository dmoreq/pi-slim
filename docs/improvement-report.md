# Extension Improvement Analysis — pi-slim v0.6.0

## Executive Summary

The codebase has 6 feature areas (AST indexing, context injection, pruning, hashline editing, LSP navigation, read-awareness) operating in **isolation** — each works independently but none collaborate. Token savings can increase by ~30% with 5 targeted improvements that wire these features together into a coordinated pipeline.

---

## Current Architecture: The Cost of Isolation

```
                    ┌──────────────────────────────────────┐
                    │         SessionManager                 │
                    └──────┬──────┬──────┬──────┬──────────┘
                           │      │      │      │
                    ┌──────▼┐ ┌──▼──┐ ┌▼─────┐▼─────┐
                    │AST    │ │Prune│ │Hash- ││LSP   │
                    │Index  │ │     │ │line  ││Nav   │
                    │Engine │ │Plugin│ │Tool  ││Tools │
                    └──────┘ └─────┘ └──────┘└──────┘
                    ALL OPERATE INDEPENDENTLY
                    No shared data, no coordination
```

## Problems Found

### Problem 1: LSP Navigation Results Are Siloed

**What happens now:** `lsp_go_to_definition` returns a result like `file:///src/auth.ts:10:5` as plain text. The agent sees it but pi-slim does nothing with it.

**Missed opportunity:** When LSP resolves a definition, pi-slim could automatically:
- Inject the target file's skeleton into the next context (via dep-context)
- Track the LSP call in SessionStats (currently unmeasured)
- Add the resolved file to the file-detection paths list

**Token savings missed:** Every LSP result requires the agent to manually read the resolved file — wasting ~200 tokens per lookup. Auto-injection saves 100% of those reads.

**Implementation:**
```typescript
// In handleContext(), detect lsp_* tool calls in recent messages
// Extract resolved file paths from lsp results
// Add them to extraPaths so ContextInjector auto-includes them
```

**Files changed:** `manager.ts` (~15 lines)

---

### Problem 2: Hashline and AST Skeletons Don't Share Hash Context

**What happens now:** `hashline_edit` uses xxHash32 bigrams. `formatHashLines` is available via `/hashline-read` but NEVER called automatically. The dep-context injection shows raw function signatures without hash anchors.

**Missed opportunity:** When pi-slim injects a skeleton in `<dep-context>`, it could append hashline anchors to each line:
```
### src/auth.ts
1tz|export function authenticate(token: string): User { ... }  
2mr|export function authorize(role: Role): boolean { ... }
```

The LLM immediately has hash anchors for editing — no need to call `/hashline-read` or `read` tool separately.

**Token savings missed:** Every hashline edit currently requires a `read` tool call (200t) to see anchors. Auto-annotation in skeletons eliminates this entirely.

**Implementation:**
```typescript
// In ContextInjector.buildInjection(), pass skeleton through formatHashLines()
// before embedding in <dep-context>
// Requires: initHash() called at session start (already done for hashline_edit)
```

**Files changed:** `context/dep-context.ts` (~5 lines), `manager.ts` (initHash call)

---

### Problem 3: Pruning Is Invisible to Users and Undermeasured

**What happens now:** `ContextPruningPlugin` logs pruning stats to `console.error` — invisible to users. No telemetry notification, not included in `/slim` stats, not in session summary.

**Missed opportunity:** Pruning should:
- Show telemetry notification when it removes messages: `✂️ Pruned 5/30 messages (17%)`
- Include pruning stats in `/slim` output
- Include pruning stats in the session shutdown summary

**Visibility impact:** Users have no idea pruning is working or how effective it is.

**Implementation:**
```typescript
// In ContextPruningPlugin.onContext(), fire telemetry notification
// In session shutdown summary, include pruning stats
```

**Files changed:** `plugins/context-pruning.ts` (~5 lines), `manager.ts` (shutdown summary)

---

### Problem 4: Read-Awareness Doesn't Inform Context Injection

**What happens now:** `ReadAwarenessPlugin` blocks unread file edits but never shares its tracked file list with the context injection system.

**Missed opportunity:** When the agent reads a file, pi-slim should flag it for auto-injection:
```typescript
// On read tool call:
// 1. Track in readFiles (already done)
// 2. Add to priority injection queue for next context build
// 3. Include its 1st-degree deps in dep-context
```

**Token savings missed:** The agent manually asks for file context after reading, wasting a turn. Pre-emptive injection makes the first mention zero-cost.

**Implementation:**
```typescript
// ReadAwarenessPlugin exposes lastReadFiles as a public interface
// SessionManager queries it before building dep-context
```

**Files changed:** `plugins/read-awareness.ts` (~3 lines), `manager.ts` (~10 lines)

---

### Problem 5: No Transitive Dependency Resolution

**What happens now:** `<dep-context>` resolves only 1st-degree imports. If `auth.ts` imports `models.ts` which imports `database.ts`, the LLM sees models.ts but not database.ts — even though these are tightly coupled.

**Missed opportunity:** A configurable depth parameter (default: 1 for cost, user can set 2 or 3 for deeper projects) would propagate the dep graph:
```
auth.ts → models.ts → database.ts → connection.ts
```

**Token cost:** Controlled by config `maxInjectionTokens` — budget naturally limits depth.

**Implementation:**
```typescript
// In ContextInjector.buildInjection(), add a second pass:
// For each dep in depPaths, resolve its deps, merge into depPaths
// Controlled by config.context.dependencyDepth (default: 1)
```

**Files changed:** `context/dep-context.ts` (~10 lines), `context/schema.ts` (~3 lines)

---

### Problem 6: Repo Map Not Human-Readable

**What happens now:** `<repo-map>` shows a flat tree with exported names. For 1,000+ file projects, this is a wall of text.

**Improvement:** Sort entries by relevance (files modified most recently appear first, or files matching the current conversation topic) and cap the total entries. Currently it just grows unbounded until it hits `maxRepoMapTokens`.

**Token savings:** Eliminates irrelevant noise — the LLM doesn't need to know about migration scripts when working on auth.

**Implementation:**
```typescript
// In RepoMapGenerator.generate(), sort files by git-modification recency
// Limit to maxEntries config parameter
```

**Files changed:** `context/repo-map.ts` (~10 lines), `context/schema.ts` (~1 line)

---

### Problem 7: Hashline Guidance Is Strip-Only Static Text

**What happens now:** The hashline usage guidance in `before_agent_start` is a static string block. It doesn't mention the LSP tools, doesn't tell the LLM about the cost savings available, doesn't reference `/hashline-read`.

**Improvement:** The guidance should be a compact, actionable prompt that links all features:
```
## Pi-slim Editing Tools
- `hashline_edit`: Edit without re-reading. Anchors shown in skeleton output.
- `lsp_go_to_definition`: Jump to definitions in 1 token.
- `lsp_find_references`: Find all usages.
- `/hashline-read src/foo.ts`: Read with hash anchors.
```

**Files changed:** `manager.ts` (~10 lines)

---

## Prioritized Action Plan

| # | Improvement | Token Savings | Effort | Files |
|---|------------|--------------|--------|-------|
| 1 | **LSP → Context Auto-Injection** | ~200t per lookup (eliminates manual reads) | 15 min | `manager.ts` (+15 lines) |
| 2 | **Hash Anchors in Skeletons** | ~200t per edit (eliminates read-before-edit) | 10 min | `context/dep-context.ts` (+5 lines) |
| 3 | **Pruning Telemetry** | 0t (user visibility only) | 10 min | `plugins/context-pruning.ts`, `manager.ts` |
| 4 | **Read → Context Pre-Injection** | ~200t per first-context mention | 10 min | `plugins/read-awareness.ts`, `manager.ts` |
| 5 | **Transitive Dep Resolution** | Variable (controlled by budget) | 15 min | `context/dep-context.ts`, `context/schema.ts` |
| 6 | **Compact Unified Guidance** | 50-100t per session (shorter system prompt) | 5 min | `manager.ts` |
| 7 | **Repo Map Sorting/Relevance** | ~200t per large project (trims irrelevant entries) | 15 min | `context/repo-map.ts`, `context/schema.ts` |

**Total token savings: ~1,000t per session minimum, plus compound benefits**
**Total effort: ~1.5 hours**

## Coordinated Feature Integration (The Big Picture)

After these improvements, the agent operates as a single brain:

```
Agent mentions "auth.ts"
    │
    ▼
ReadAwarenessPlugin tracks the read ────────┐
    │                                         │
    ▼                                         ▼
ContextInjector auto-builds dep-context  ←── includes transitively resolved deps
    │
    ├── Hash anchors on every skeleton line
    │   └── LLM can immediately hash_edit any line
    │
    ├── LSP results from prior calls auto-injected
    │   └── No manual reads of resolved files
    │
    ├── Pruning telemetry shows savings
    │   └── `/slim` shows full pipeline stats
    │
    └── Compact unified guidance in system prompt
        └── LLM knows all tools in one 5-line block
```

## Implementation

All changes are in pi-slim's own codebase. No external dependencies needed. Each improvement is 5-15 minutes with clear file-level targets.
