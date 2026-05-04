# Hashline Integration: Smarter Agent, Cheaper Tokens

## Big Picture: The Self-Optimizing Code Agent

The agent's three fundamental costs are: **finding the right file**, **understanding its structure**, and **editing it precisely**. Each is currently done naively (read full file → waste tokens). pi-slim already solves file understanding (AST skeletons, 85-92% cheaper). Hashline solves precision editing by eliminating file re-reads.

```
┌──────────────────────────────────────────────────────────────────┐
│                    pi-slim Agent (v0.3.0)                         │
│                                                                  │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │ AST      │   │ LSP          │   │ Hashline     │            │
│  │ Indexing │   │ Navigation   │   │ Editing      │            │
│  │(tree-    │   │(go-to-def,   │   │(hash anchors │            │
│  │ sitter)  │   │ find-refs)   │   │ → no re-read)│            │
│  │ 85-92%   │   │ ~99% vs full │   │ ~99% vs      │            │
│  │ saved    │   │ file read    │   │ read+edit    │            │
│  └────┬─────┘   └──────┬───────┘   └──────┬───────┘            │
│       │                │                   │                     │
│       ▼                ▼                   ▼                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Context Optimization Loop (manager.ts)           │   │
│  │  agent mentions file → LSP resolves → skeleton injects   │   │
│  │  → hashline edits without re-read → pruning cleans up    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### What Hashline Solves

Currently, when the agent edits a file:
1. pi-slim already showed a skeleton (great — no full read)
2. But the **edit** tool re-reads the file to find the right lines

Hashline eliminates step 2. The LLM sees hash-annotated lines in the skeleton output (`42nd|const x = ...`). It references `42nd` in the edit call. The hashline tool validates the hash is still current and applies the edit — **no file re-read**.

### Token Cost Comparison

| Scenario | Without pi-slim | With pi-slim + hashline |
|----------|----------------|------------------------|
| Understand a file | Read full file (~200t) | Skeleton (~20t) |
| Find a function definition | Read full file (~200t) | LSP go-to-def (~2t) |
| Edit a function | Read full file again (~200t), then edit | Hashline anchor from skeleton (~0t) |
| **Total per file touch** | **~600t** | **~22t (96% less)** |

---

## Architecture: Hashline as a pi-slim Built-in Tool

Integrate hashline **into pi-slim** as a registered tool (not a standalone extension). Benefits:

1. **Shared skeleton** — pi-slim already has the file content. Hashline anchors are computed from the same content.
2. **Shared config** — no separate package.json or install step.
3. **Shared telemetry** — `SessionStats` tracks hashline edits alongside injection stats via `pi-telemetry`.
4. **Tighter loop** — skeleton → hashline edit happens in `handleContext`, not via a separate tool registration cycle.

### File Structure

```
pi-slim/
├── hashline/                  ← NEW: extracted pure modules
│   ├── line-hash.ts           ← from oh-my-pi (xxhash-wasm replaces Bun.hash)
│   ├── normalize.ts           ← from oh-my-pi (inline padding replaces @oh-my-pi/pi-tui)
│   ├── core.ts                ← from oh-my-pi hashline.ts (pure functions only)
│   │                          (parseTag, applyHashlineEdits, validateLineRef,
│   │                           tryRebaseAnchor, HashlineMismatchError,
│   │                           buildCompactHashlineDiffPreview)
│   ├── diff.ts                ← from oh-my-pi diff.ts (strip replace-mode parts)
│   └── streaming.ts           ← from oh-my-pi hashline.ts (streaming generators)
├── tools/
│   └── hashline-editor.ts     ← NEW: wraps hashline core as a pi tool
├── lsp/                       ← already adopted (files exist, unplugged)
│   ├── client.ts
│   ├── launch.ts
│   ├── language.ts
│   └── path-utils.ts
├── extension.ts               ← register hashline tool + prep LSP tool registration
├── manager.ts                 ← minor: add hashline edit tracking to SessionStats
├── config/schema.ts           ← add hashline.enabled flag
├── shared/types.ts            ← add HashlineEditStats interface
├── package.json               ← add xxhash-wasm, diff deps
├── tests/
│   ├── hashline/
│   │   ├── line-hash.test.ts
│   │   ├── core.test.ts
│   │   ├── normalize.test.ts
│   │   └── diff.test.ts
│   └── tools/
│       └── hashline-editor.test.ts
└── docs/
    └── hashline-integration-plan.md  ← THIS DOCUMENT
```

---

## Phased Implementation

### Phase A: Pure Module Extraction (2-3 hours)

Extract from oh-my-pi into `hashline/` — zero pi-mono dependencies.

#### A1. `hashline/line-hash.ts` (30 min)
**Source**: `oh-my-pi/packages/coding-agent/src/edit/line-hash.ts`

**Critical change**: Replace `Bun.hash.xxHash32(line, seed)` with `xxhash-wasm`.
xxhash-wasm exposes `h32ToString(data, seed)` returning hex string. Convert hex to integer with `parseInt(hex, 16)`, then modulo into HASHLINE_BIGRAMS.

```typescript
import xxhash from "xxhash-wasm";
let xxhashInstance: ReturnType<typeof xxhash> | null = null;
export async function initHash(): Promise<void> {
  xxhashInstance = xxhash();
}
export function computeLineHash(idx: number, line: string): string {
  line = line.replace(/\r/g, "").trimEnd();
  if (line.replace(RE_STRUCTURAL_STRIP, "").length === 0) return structuralBigram(idx);
  const seed = !RE_SIGNIFICANT.test(line) ? idx : 0;
  const hexHash = xxhashInstance!.h32ToString(line, seed);
  return HASHLINE_BIGRAMS[Number.parseInt(hexHash, 16) % HASHLINE_BIGRAMS_COUNT];
}
```

**Export everything**: `HASHLINE_BIGRAMS`, `HASHLINE_BIGRAMS_COUNT`, `HASHLINE_BIGRAM_RE_SRC`, `HASHLINE_CONTENT_SEPARATOR`, `computeLineHash`, `formatLineHash`, `formatHashLine`, `formatHashLines`, `structuralBigram`.

**Tests**: Verify against known test vectors from oh-my-pi. If xxhash-wasm gives different results than Bun.hash, we hardcode a pre-computed lookup table for the 647 bigrams.

#### A2. `hashline/normalize.ts` (15 min)
**Source**: `oh-my-pi/packages/coding-agent/src/edit/normalize.ts`

**Change**: Replace `import { padding } from "@oh-my-pi/pi-tui"` with inline:
```typescript
function padding(n: number): string { return " ".repeat(n); }
```

**Export all**: `detectLineEnding`, `normalizeToLF`, `restoreLineEndings`, `stripBom`, `normalizeForFuzzy`, `adjustIndentation`, `normalizeUnicode`, `minIndent`, `detectIndentChar`, `convertLeadingTabsToSpaces`, `countLeadingWhitespace`, `getLeadingWhitespace`.

**Tests**: Port key tests for normalizeToLF, stripBom, adjustIndentation.

#### A3. `hashline/core.ts` (1 hour)
**Source**: `oh-my-pi/packages/coding-agent/src/edit/modes/hashline.ts` — pure functions only

**Keep (all pure, no internal deps)**:
- `HashMismatch` interface
- `Anchor` type
- `HashlineEdit` union type (`replace_line`, `replace_range`, `append_at`, `prepend_at`, `append_file`, `prepend_file`)
- `parseTag(ref)` — parse `"42nd"` → `{ line: 42, hash: "nd" }`
- `validateLineRef(ref, fileLines)` — throw `HashlineMismatchError` on mismatch
- `tryRebaseAnchor(anchor, fileLines, window?)` — auto-rebase within ±5 lines
- `applyHashlineEdits(text, edits)` — main apply function
- `HashlineMismatchError` class (with `displayMessage` and `remaps`)
- `formatFullAnchorRequirement(raw?)` — user-friendly error hint
- `stripNewLinePrefixes(lines)` / `stripHashlinePrefixes(lines)` — prefix stripping
- `hashlineParseText(edit)` — normalize edit content array
- `buildCompactHashlineDiffPreview(diff, options?)` — compact diff rendering
- `CompactHashlineDiffPreview` interface + `CompactHashlineDiffOptions`
- `formatCodeFrameLine` — inline replacement (was from `../../tools/render-utils`)
- `ANCHOR_REBASE_WINDOW` constant
- `dedupeHashlineEdits`, `collectBoundaryDuplicationWarning`
- `getHashlineEditSortKey`, `applyHashlineEditToLines`, `validateHashlineEditRefs`

**Strip** (execution/infra layer, not pure):
- `executeHashlineSingle()` — needs ToolSession, LSP, writethrough
- `computeHashlineDiff()` — wrapper over apply + file read
- `resolveEditAnchors()`, `resolveEditAnchor()` — interim between tool and core
- All schema types (`hashlineEditSchema`, `hashlineEditParamsSchema`) — redefined in tool wrapper
- All streaming generators — go in `streaming.ts`
- `readHashlineFileText()` — file I/O goes in tool wrapper

**Tests**: Port tests for parseTag, validateLineRef, tryRebaseAnchor, applyHashlineEdits, buildCompactHashlineDiffPreview, HashlineMismatchError.

#### A4. `hashline/diff.ts` (30 min)
**Source**: `oh-my-pi/packages/coding-agent/src/edit/diff.ts` (strip replace-mode parts)

**Keep only**: `generateDiffString`, `DiffResult`, `DiffError`, `DiffHunk`, `ParseError`, `ApplyPatchError`.

**Strip**: `findMatch`, `EditMatchError`, `DEFAULT_FUZZY_THRESHOLD`, file reading helpers, replace-mode utilities.

**Dependency**: `diff` npm package (used by `Diff.diffLines`).

**Tests**: Test generateDiffString with known inputs.

#### A5. `hashline/streaming.ts` (15 min)
**Source**: `oh-my-pi/packages/coding-agent/src/edit/modes/hashline.ts` — generators only

**Keep**: `createHashlineChunkEmitter`, `streamHashLinesFromUtf8`, `streamHashLinesFromLines`, `HashlineStreamOptions`, `isReadableStream`.

**Tests**: Test streaming generators with simple inputs.

### Phase B: Tool Wrapper (1-2 hours)

#### B1. `tools/hashline-editor.ts`
The tool wrapper registers a `hashline_edit` tool via pi's tool registration API.

**Schema** (via TypeBox):
```typescript
parameters: Type.Object({
  path: Type.String({ description: "file path to edit" }),
  edits: Type.Array(Type.Object({
    loc: Type.Union([
      Type.Literal("append"),
      Type.Literal("prepend"),
      Type.Object({ append: Type.String() }),
      Type.Object({ prepend: Type.String() }),
      Type.Object({ range: Type.Object({ pos: Type.String(), end: Type.String() }) }),
    ]),
    content: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
  })),
})
```

**execute()**:
1. Parse `path` relative to `ctx.cwd`
2. Read file via `readFile(absolutePath, "utf8")`
3. Call `normalizeToLF` + `stripBom`
4. Call `applyHashlineEdits(normalizedContent, resolvedEdits)`
5. If no changes, return error + diagnostics
6. Write result via `writeFile(absolutePath, finalContent)`
7. Generate diff via `generateDiffString`
8. Build compact preview via `buildCompactHashlineDiffPreview`
9. Track via `pi-telemetry`: `recordToolInvocation('hashline', path)`, `recordMetric('hashline_added', addedLines)`, `recordMetric('hashline_removed', removedLines)`
10. Return result with diff preview

**renderResult()**: Show compact diff preview.

#### B2. Wire into `extension.ts`
```typescript
// In smartContextExtension():
registerHashlineTool(pi)
```

#### B3. Config flag
In `config/schema.ts`, add:
```typescript
hashline: z.object({
  enabled: z.boolean().default(true),
  maxEdits: z.number().int().positive().default(50),
}).default({}),
```

#### B4. Telemetry tracking
Add to `shared/types.ts`:
```typescript
export interface HashlineEditStats {
  totalEdits: number;
  totalAdded: number;
  totalRemoved: number;
  autoRebases: number;
  hashMismatches: number;
}
```

Track via pi-telemetry in SessionStats.

### Phase C: Connect the Loop (2-3 hours)

In `manager.ts`'s `handleContext()`:

1. **Detect mention**: Agent says "edit `auth.ts` line 42"
2. **LSP resolve**: If function name mentioned, LSP go-to-def → 1-line result
3. **Skeleton + hashline**: pi-slim already injected skeleton with hash annotations (`42nd|export function`)
4. **Search reverse refs**: Find all files importing `auth.ts` → inject as dep context
5. **Prune**: After turn ends, pruning rules remove redundant messages (already works)
6. **Repeat**: Next turn starts with clean, minimal context

Also wire the existing LSP `lsp/` client into the pipeline — register an `lsp_navigation` tool:

```typescript
tools/lsp-navigation.ts — LspNavigationTool (wraps LSPService from lsp/client.ts)
- goToDefinition(path, line, column) → { file, line, column, text }
- findReferences(path, line, column) → Array<{ file, line, column }>
- hoverInfo(path, line, column) → { contents }
```

### Phase D: Wire LSP Navigation (1-2 hours)

Already adopted but unplugged:
```
lsp/client.ts     — full LSP JSON-RPC client (adapted from pi-lens)
lsp/launch.ts     — LSP process launcher (simplified)
lsp/language.ts   — language ID mappings
lsp/path-utils.ts — cross-platform path handling
```

**To do**: Build `tools/lsp-navigation.ts` tool wrapper and register it in `extension.ts`.

---

## SOLID / DRY / OOP Compliance

| Principle | How We Apply It |
|-----------|----------------|
| **S** (SRP) | Each hashline module does ONE thing: `line-hash.ts` = hashing only, `normalize.ts` = normalization only, `core.ts` = edit logic only, `diff.ts` = diff generation only |
| **O** (OCP) | New edit operations added via the `HashlineEdit` union type — no core switch changes needed |
| **L** (LSP) | `HashlineMismatchError` extends `Error` — all existing error handlers work unchanged |
| **I** (ISP) | Each module exposes only the functions consumers need. `streaming.ts` is a separate module, not mixed into `core.ts` |
| **D** (DIP) | `core.ts` depends on `line-hash.ts`'s pure function, not on file I/O or tool context. Tool wrapper injects file I/O |
| **DRY** | All normalization/hashing/diff logic lives once. No duplication between hashline tool and other edit tools |

## Telemetry & Notifications (pi-telemetry)

| Event | When | Severity |
|-------|------|----------|
| `hashline_edit_applied` | Edit successfully applied | info |
| `hashline_hash_mismatch` | Hash validation failed, mismatch error returned | warn |
| `hashline_auto_rebase` | Anchor auto-rebased to nearby line | info |
| `hashline_noop` | Edit produced identical content (no change needed) | info |
| `hashline_file_created` | File didn't exist, was created via append/prepend | info |

Tracked via `getTelemetry()?.recordToolInvocation()`, `recordMetric()`, `recordEvent()`.

---

## Testing Strategy

| Test File | Tests | Target Coverage |
|-----------|-------|-----------------|
| `tests/hashline/line-hash.test.ts` | computeLineHash stability, formatHashLines output, structuralBigram | 100% of edge cases |
| `tests/hashline/normalize.test.ts` | normalizeToLF, stripBom, adjustIndentation, detectLineEnding | 95% |
| `tests/hashline/core.test.ts` | parseTag, validateLineRef, tryRebaseAnchor, applyHashlineEdits, buildCompactHashlineDiffPreview, HashlineMismatchError | 95% |
| `tests/hashline/diff.test.ts` | generateDiffString, DiffResult format | 90% |
| `tests/tools/hashline-editor.test.ts` | Tool schema validation, execute with mocked file system | 85% |

**Target**: 25+ new tests, 90%+ coverage on hashline modules.

---

## Publish Plan

1. **pi-slim v0.3.0**: Commit and tag
2. **Push to GitHub**: `git push origin master && git push origin v0.3.0`
3. **npm publish**: `npm publish`

---

## Effort Summary

| Phase | Hours | Files Changed |
|-------|-------|--------------|
| A: Pure modules | 2-3 | 5 new files in `hashline/` |
| B: Tool wrapper | 1-2 | 1 new `tools/hashline-editor.ts`, modify `extension.ts`, `schema.ts` |
| C: Connect loop | 2-3 | Modify `manager.ts`, add `tools/lsp-navigation.ts` |
| D: Wire LSP | 1-2 | Modify `extension.ts`, tests |
| Tests | 1-2 | 5 new test files |
| **Total** | **7-12 hours** | **~15 files** |
