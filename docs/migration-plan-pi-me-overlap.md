# Migration Plan: Move Overlap from pi-me → pi-slim

**Date:** 2026-05-03
**Goal:** Smaller pi-me, smarter pi-slim
**Strategy:** Move context-injection infrastructure from pi-me into pi-slim, then enrich pi-slim with unified injection orchestration

---

## Overlap Analysis Summary

After deep-diving both codebases, I identified **7 areas of genuine overlap** plus **4 areas that look like overlap but aren't**:

### Genuine Overlap (migration candidates)

| # | Feature | pi-me file | pi-slim analog | Migration direction |
|---|---------|-----------|------------------------|-------------------|
| 1 | System prompt augmentation | `foundation/extra-context-files.ts` | `index.ts` → `before_agent_start` handler | **Merge into pi-slim** |
| 2 | Provider-specific guidance injection | `session-lifecycle/agent-guidance/` | `index.ts` → `before_agent_start` handler | **Merge into pi-slim** |
| 3 | Config loading (typed) | `shared/pi-config.ts` | Inline `DEFAULT_CONFIG` in `types.ts` | **Adopt pattern in pi-slim** |
| 4 | State file persistence | `shared/ext-state.ts` | `store.ts` + `stats.ts` (stats.jsonl) | **Unify under pi-slim** |
| 5 | File path detection from tool output | `core-tools/file-collector/` | `context-injector.ts` (message-only regex) | **Adopt pattern in pi-slim** |
| 6 | Background notification | `shared/notify-utils.ts` | `stats.ts` UI notifications | **Adopt pattern in pi-slim** |
| 7 | Event-based context hooks | `context-pruning/events/context.ts` | `index.ts` → `context` handler | **Unify injection pipeline** |

### False Overlap (keep separate)

| Feature | Why it stays in pi-me |
|---------|----------------------|
| `context-pruning/rules/` (dedup, error-purging, recency) | Operates on *message history*, not code structure — different abstraction level |
| `core-tools/memory/` | Behavioral facts/lessons from conversation — orthogonal to code context |
| `session-recap/` | Activity summary generation — consumption, not injection |
| `auto-compact/` | Context window management — triggers compact API, no content injection |

---

## Migration Phases

### Phase 0: Inventory & Dependency Mapping (1-2 sessions)

**What:** Before touching any code, map all extension-to-extension dependencies within pi-me.

**Why:** Several pi-me extensions depend on each other (e.g., context-pruning has rule dependencies). Moving one breaks others.

**Actions:**
- [ ] Audit pi-me's `package.json` `pi.extensions` array for load-order dependencies
- [ ] Identify which pi-me extensions reference `before_agent_start` / `context` event handlers
- [ ] Determine if any pi-me extension consumes data produced by the migration target
- [ ] Create a dependency graph of all context-modifying extensions

---

### Phase 1: Absorb System Prompt Augmentation (pi-slim v0.2)

**What:** Move `extra-context-files.ts` + `agent-guidance/agent-guidance.ts` logic into pi-slim.

**Why:** Both systems already inject into `before_agent_start`. pi-slim currently only injects `<repo-map>`. Adding file-based and provider-based augmentation creates a unified injection pipeline.

#### 1A: Multi-source Context File Injection

**Source:** `pi-me/foundation/extra-context-files.ts`
**Target:** `pi-slim/src/context-files.ts`

**Key logic to port:**

```typescript
// From extra-context-files.ts
// 1. Walk ancestor directories (cwd → /) to find files
// 2. Load AGENTS.local.md, CLAUDE.local.md from each level
// 3. Deduplicate against what pi core already loaded
// 4. Format as "# Extra Context Files" section
// 5. Append to systemPrompt in before_agent_start
```

**Integration into pi-slim:**

```typescript
// src/index.ts — unified before_agent_start pipeline
before_agent_start → {
  1. <repo-map> injection        (existing)
  2. <context-files> injection   (new — from extra-context-files.ts)
  3. <agent-guidance> injection  (new — from agent-guidance.ts)
  4. <dep-context> injection     (existing, different event)
}
```

**New files:**
- `src/context-files.ts` — Extracted from extra-context-files.ts
- `src/config.ts` — Typed config loading from shared/pi-config.ts

**Files to remove from pi-me:**
- `foundation/extra-context-files.ts`

**Dependency:**
- pi-me must remove the extension path from `package.json` `pi.extensions`
- pi-slim becomes a required dependency for users who relied on AGENTS.local.md injection

#### 1B: Provider-Specific Guidance Injection

**Source:** `pi-me/session-lifecycle/agent-guidance/agent-guidance.ts`
**Target:** `pi-slim/src/provider-guidance.ts`

**Key logic to port:**

```typescript
// From agent-guidance.ts
// 1. Map provider → filename(s) (anthropic→CLAUDE.md, openai→CODEX.md, google→GEMINI.md)
// 2. Walk up ancestor directories
// 3. Load matching files, deduplicate against AGENTS.md
// 4. Format as "# Provider-Specific Context" section
// 5. Append to systemPrompt in before_agent_start
```

**New files:**
- `src/provider-guidance.ts`

**Files to remove from pi-me:**
- `session-lifecycle/agent-guidance/agent-guidance.ts`

**Config to port:**
- `agent-guidance.json` loading → move to pi-slim config schema

---

### Phase 2: Typed Config + State Tools (pi-slim v0.3)

**What:** Adopt pi-me's proven utility patterns.

#### 2A: Typed Configuration (pi-config pattern)

**Source:** `pi-me/shared/pi-config.ts`
**Target:** `pi-slim/src/config.ts`

**Current state in pi-slim:**
```typescript
// types.ts — inline constants, no validation
export const DEFAULT_CONFIG = { ... }
```

**Target state:**
```typescript
// config.ts — zod-schema, JSONC config files, ancestor-dir search
import { z } from 'zod'

export const SmartContextConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRepoMapTokens: z.number().default(4000),
  maxInjectionTokens: z.number().default(8000),
  scanLastNMessages: z.number().default(10),
  exclude: z.array(z.string()).default([...]),
  contextFiles: z.object({
    filenames: z.array(z.string()).default(["AGENTS.local.md", "CLAUDE.local.md"]),
    sectionTitle: z.string().default("Extra Context Files"),
  }),
  providerGuidance: z.enum(["auto", "manual", "disabled"]).default("auto"),
}).default({})

export function loadConfig(projectRoot?: string): SmartContextConfig
```

**New files:**
- `src/config.ts` — Extracted from shared/pi-config.ts pattern + enhanced

**Add dependency:**
- `zod` to pi-slim `package.json`

#### 2B: Event Auditing (ext-state pattern)

**Source:** `pi-me/shared/ext-state.ts`
**Target:** `pi-slim/src/state.ts`

**Current state in pi-slim:**
```typescript
// stats.ts — appends to stats.jsonl with fire-and-forget
stats.persist(projectRoot)  // custom path logic
```

**Enhanced state:**
```typescript
// state.ts — standard read/write/remove pattern
readExtState("slim")   // returns any
writeExtState("slim", data)
```

Keep the stats pipeline but standardize the persistence layer:
- `stats.ts` → uses `state.ts` internally
- `.pi/slim/stats.jsonl` → stays as-is (append-only log)
- `.pi/slim/index.json` → stays (already versioned)
- New: `.pi/slim/state.json` → runtime state (last session stats, etc.)

**New files:**
- `src/state.ts` — Wraps ext-state.ts pattern for pi-slim

---

### Phase 3: Unify Context Injection Pipeline (pi-slim v0.4)

**What:** pi-slim becomes the single orchestrator for all context injections before LLM calls.

#### Current state (fragmented across 2 codebases):

```
pi extension lifecycle (per-LLM-call):

  context event triggered
    ├── pi-slim: injects <dep-context> (code skeletons of mentioned files)
    ├── context-pruning: deduplicates/supersedes/error-purges messages
    ├── memory: injects <memory> block (facts/lessons)
    └── (no coordination between them)

  before_agent_start event triggered
    ├── pi-slim: injects <repo-map>
    ├── extra-context-files: injects AGENTS.local.md
    ├── agent-guidance: injects CLAUDE.md/CODEX.md/GEMINI.md
    ├── memory: injects memory block
    └── (multiple append operations, no ordering)
```

#### Target state (pi-slim as orchestrator):

```
before_agent_start:
  └── pi-slim orchestrator:
      1. Build token budget remaining (configurable)
      2. Collect all injection sources:
         a. <repo-map>              — file skeleton map
         b. <context-files>         — project-local markdown files
         c. <agent-guidance>        — provider model guidance
         d. <dep-context>           — code skeletons of in-focus files + deps
      3. Compute total estimated tokens
      4. Trim by priority (a > c > d > b by default)
      5. Append combined block to systemPrompt
      6. Return { systemPrompt }

context event:
  └── pi-slim delegates:
      1. Run dep-context detection (file mentions → <dep-context>)
      2. Call registered external hooks (context-pruning, memory injector)
      3. Compose final message array
      4. Return { messages }
```

**Key architectural change:**
- pi-slim exports an `InjectionPipeline` interface that other extensions can register hooks on
- pi-me's remaining context-injecting extensions (memory, context-pruning) become optional hooks
- pi-slim manages the merge/priority/trim logic centrally

**New files:**
- `src/pipeline.ts` — Injection orchestration
- `src/hooks.ts` — Hook registration interfaces

---

### Phase 4: Smarter File Detection (pi-slim v0.5)

**What:** Enhance pi-slim's file path detection to cover more sources.

#### 4A: Tool Output Scanning (file-collector pattern)

**Source:** `pi-me/core-tools/file-collector/extension.ts`
**Target:** `pi-slim/src/file-detector.ts`

**Current pi-slim detection:**
```typescript
// context-injector.ts — regex on user messages only
const FILE_PATH_RE = /(?:^|[\s'"`(])([./\w-]+\/[\w./-]+\.(?:tsx|ts|py|rs))/g
```

**Enhanced detection:**
```typescript
// file-detector.ts — multi-source file detection
// 1. User messages (existing regex)
// 2. Tool call arguments (read, edit, write, bash file references)
// 3. Tool output content (error messages with file paths)
// 4. Assistant messages (file mentions in LLM responses)
// 5. Configurable regex patterns (from file-collector's assistantCitationPatterns)
```

**New files:**
- `src/file-detector.ts`

#### 4B: Bash File Reference Parsing

**Source:** `pi-me/core-tools/file-collector/extension.ts` (bashShimCommands)
**Target:** `pi-slim/src/file-detector.ts`

Parse `read`, `write`, `edit`, `bash` tool invocations for file path arguments:
- `read("src/foo.ts")` → detect `src/foo.ts`
- `write("src/bar.ts")` → detect `src/bar.ts`
- `bash("cd src && ls")` → detect `src/` directory
- `edit({ path: "src/baz.ts" })` → detect `src/baz.ts`

---

### Phase 5: Notifications & Diagnostics (pi-slim v0.6)

**What:** Cherry-pick pi-me's notification patterns.

#### 5A: Background Notify

**Source:** `pi-me/shared/notify-utils.ts`
**Target:** `pi-slim/src/notify.ts`

Port the notification capability (beep, OS focus, say) as optional diagnostics for:
- Index build completion
- Context injection warnings (token budget exceeded)
- Session stats summary

#### 5B: Status Bar Integration

Add a TUI status bar entry (like context-pruning's `cp-stats`) showing:
```
SmartCtx: 142/198 files | 3.2K/4K map | 2 injections
```

---

### Phase 6: Clean Up pi-me

After each phase, remove the migrated extension from pi-me:

| Phase | Files to remove from pi-me | Lines removed |
|-------|---------------------------|--------------|
| 1A | `foundation/extra-context-files.ts` | ~120 lines |
| 1B | `session-lifecycle/agent-guidance/agent-guidance.ts`, `session-lifecycle/agent-guidance/templates/` | ~130 lines |
| 2A | `shared/pi-config.ts` (if fully ported) | ~120 lines |
| 2B | `shared/ext-state.ts` (if fully ported) | ~140 lines |
| 3 | `context-pruning/` event hooks (simplified to hook-only) | TBD |
| 4A | `core-tools/file-collector/` (if replaced by pi-slim) | ~200 lines |

**Total estimated pi-me reduction: ~700+ lines of extension code + package.json entries**

---

## File Map: Target pi-slim Structure

```
pi-slim/
├── src/
│   ├── index.ts                  # Extension entry → unified pipeline orchestrator
│   ├── config.ts                 # Typed config loading (zod schema + JSONC)
│   ├── state.ts                  # Standardized state persistence (ext-state pattern)
│   ├── notify.ts                 # Notification utilities (notify-utils pattern)
│   ├── pipeline.ts               # Injection orchestration + priority/trim logic
│   ├── hooks.ts                  # Hook registration for external context injectors
│   │
│   ├── repo-map-generator.ts     # Existing — directory tree with exported names
│   ├── context-injector.ts       # Existing — per-turn dep-context building
│   ├── context-files.ts          # NEW — project-local context files (from extra-context-files.ts)
│   ├── provider-guidance.ts      # NEW — provider-specific files (from agent-guidance.ts)
│   ├── file-detector.ts          # NEW — multi-source file path detection (from file-collector pattern)
│   │
│   ├── index-engine.ts           # Existing — orchestration + graph building
│   ├── disk-cache.ts             # Existing — hash-based cache
│   ├── store.ts                  # Existing — persist/load RepoIndex + repo map
│   ├── stats.ts                  # Existing — session usage statistics
│   ├── types.ts                  # Existing — shared interfaces + enums
│   │
│   └── parsers/
│       ├── language-parser.ts    # Existing — interface
│       ├── typescript-parser.ts  # Existing
│       ├── python-parser.ts      # Existing
│       └── rust-parser.ts        # Existing
│
├── tests/                        # Existing + new
├── docs/
│   ├── slim-skill.md    # Update skill description
│   └── migration-plan-pi-me-overlap.md  # This document
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Dependency Changes

### pi-slim additions

| Package | Used by | Phase |
|---------|---------|-------|
| `zod` | `config.ts` — schema validation | 2A |
| `jsonc-parser` | `config.ts` — JSONC config parsing | 2A |

### pi-me removals

| Package still needed? | After migration |
|----------------------|----------------|
| `zod` — YES, used by `pi-config.ts` everywhere | Keep (many extensions still use it) |
| `jsonc-parser` — YES, used by `pi-config.ts` everywhere | Keep |

---

## Rollout Strategy

### Per-Phase Delivery

Each phase produces a working, testable increment:

| Phase | pi-slim version | pi-me version | Verification |
|-------|-------------------------|---------------|-------------|
| 0 | v0.1 (current) | v0.2 (current) | Both pass existing tests |
| 1A | v0.2-alpha | v0.2-slim | AGENTS.local.md injected by slim instead of pi-me |
| 1B | v0.2-beta | v0.2-slim | CLAUDE.md/CODEX.md/GEMINI.md injected by slim |
| 2A | v0.3 | v0.2-slim | JSONC .pi/slim.json config works |
| 2B | v0.3 | v0.2-slim | ext-state path works; old stats.jsonl still works |
| 3 | v0.4 | v0.2-slim | All context injection flows through pipeline |
| 4 | v0.5 | v0.2-slim | File detection from tool output works |
| 5 | v0.6 | v0.2-final | Status bar + notifications |
| 6 | v0.6 | v0.2-final | Old pi-me files removed |

### Migration of Existing Users

For each phase, users see:
1. **Before:** pi-me injects AGENTS.local.md (for example)
2. **Migration window:** Both pi-me and pi-slim have the feature (dual injection)
3. **After upgrade:** User runs `pi update pi-me` to get v0.2-slim (feature removed from pi-me)
4. **Cleanup:** pi-slim handles it alone

**Dual-injection guard:** pi-slim checks if pi-me is installed and skips features that pi-me still handles during the migration window.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dual injection (both extensions add same content) | High | Context bloat | Version negotiation or env-var guard during migration |
| pi-me users who don't install pi-slim lose features | Medium | Missing context files | Announcement + migration guide; extend pi-me deprecation window |
| import resolution in shared config migrates poorly | Low | Config breakage | Full test suite for config parser |
| Tree-sitter version conflict with other pi packages | Low | Build failure | Pin tree-sitter version; use bundled grammars |
| Pipeline orchestration introduces latency | Medium | Slower agent start | Keep pipeline sync; benchmark trim step |

---

## Success Criteria

pi-slim v0.6 is complete when:

1. **All context injections** (repo-map, dep-context, context-files, provider-guidance) flow through a single pi-slim pipeline
2. **pi-me is smaller** — at least 4 extension files removed, ~700 fewer lines
3. **Existing test suites pass** for both packages
4. **No duplicate context injection** — the same file/clause never appears twice
5. **Config is typed** — invalid JSONC configs produce clear error messages
6. **File detection is broader** — covers tool output, not just user messages
7. **Token budget is respected** — pipeline never exceeds limits, even with 4+ injection sources

---

## Immediate Next Step

**Phase 0, Step 1:** Map all pi-me extensions that hook `before_agent_start` and `context` events to understand the current injection topology before moving anything.

```
Extensions hooking before_agent_start in pi-me:
  - foundation/extra-context-files.ts
  - session-lifecycle/agent-guidance/agent-guidance.ts
  - core-tools/memory/index.ts
  - (slim hooks this externally)

Extensions hooking context event in pi-me:
  - session-lifecycle/context-pruning/index.ts
  - core-tools/memory/index.ts
  - (slim hooks this externally)

Total: 2 (soon 4) extensions sharing the same 2 lifecycle events
```
