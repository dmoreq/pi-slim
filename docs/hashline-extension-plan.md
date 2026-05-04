# Plan: Extract Hashline Edits as a pi-mono Extension

## Overview

Extract the Hashline Edits feature from oh-my-pi (a pi-mono fork) into a standalone pi-mono extension. The extension registers a new custom tool `hashline_edit` that the LLM can call instead of the built-in `edit` tool. The core hashing, parsing, validation, and diff logic are extracted as pure modules; file I/O and tool registration use the pi-mono extension SDK.

## Architecture

```
hashline-edit/
├── package.json            # npm deps: typebox, xxhash-wasm, diff
├── src/
│   ├── index.ts            # Entry: registerTool("hashline_edit"), register renderCall/renderResult
│   ├── line-hash.ts        # Extracted from oh-my-pi line-hash.ts (pure, 0 deps)
│   ├── normalize.ts        # Extracted from oh-my-pi normalize.ts (line endings, BOM)
│   ├── core.ts             # Extracted hashline logic: parseTag, applyHashlineEdits, validateLineRef, tryRebaseAnchor, HashlineMismatchError
│   ├── diff.ts             # generateDiffString (via "diff" npm pkg), buildCompactHashlineDiffPreview
│   └── streaming.ts        # streamHashLinesFromUtf8, streamHashLinesFromLines, createHashlineChunkEmitter
```

## Phase 1: Extract Pure Modules (No pi-mono Dependencies)

These modules are pure JavaScript/TypeScript logic. They compile and test standalone.

### 1.1 `line-hash.ts`

**Source**: `packages/coding-agent/src/edit/line-hash.ts` (770 lines)

**Changes needed**:
- Replace `Bun.hash.xxHash32(line, seed)` with a call to an xxhash library

**Dependency**: `xxhash-wasm` (preferred — WebAssembly, fast, matches output format) or `xxhashjs` (pure JS fallback). xxhash-wasm exposes `h32ToString(data: string, seed?: number): string` which returns a hex string — wrap as:

```typescript
import xxhash from "xxhash-wasm";
const xxhashInstance = await xxhash();
export function computeLineHash(idx: number, line: string): string {
  // ... same logic ...
  return HASHLINE_BIGRAMS[Number.parseInt(xxhashInstance.h32ToString(line, seed), 16) % HASHLINE_BIGRAMS_COUNT];
}
```

> **Critical**: Seed and modulo must produce identical results to oh-my-pi's `Bun.hash.xxHash32(line, seed) % 647`. Verify with test vectors. If xxhash-wasm gives different results at the same seed, hardcode a pre-computed lookup table for the 647 possible hash values — the bigram table is stable forever.

**Exports** (preserve all):
- `HASHLINE_BIGRAMS` — the 647-element bigram table
- `HASHLINE_BIGRAMS_COUNT` — `647`
- `HASHLINE_BIGRAM_RE_SRC` — regex source for matching bigrams
- `HASHLINE_CONTENT_SEPARATOR` — `"|"`
- `computeLineHash(idx, line)` — returns 2-char bigram
- `formatLineHash(line, lines)` — returns `"42nd"`
- `formatHashLine(lineNumber, line)` — returns `"42nd|content"`
- `formatHashLines(text, startLine?)` — returns full file with hashline prefixes
- `structuralBigram(line)` — ordinal suffix for brace-only lines

### 1.2 `normalize.ts`

**Source**: `packages/coding-agent/src/edit/normalize.ts` (340 lines)

**Changes needed**:
- Replace `import { padding } from "@oh-my-pi/pi-tui"` with an inline `" ".repeat(n)`:
```typescript
// Replace this:
import { padding } from "@oh-my-pi/pi-tui";
// With:
function padding(n: number): string { return " ".repeat(n); }
```

**Exports**: All normalization helpers — `detectLineEnding`, `normalizeToLF`, `restoreLineEndings`, `stripBom`, `normalizeForFuzzy`, `adjustIndentation`, `normalizeUnicode`, etc.

### 1.3 `diff.ts`

**Source**: `packages/coding-agent/src/edit/diff.ts` (minus the replace-mode-specific parts)

**Changes needed**:
- Strip replace-mode logic (`findMatch`, `EditMatchError`, `DEFAULT_FUZZY_THRESHOLD`, file reading helpers)
- Strip imports that reference `../tools/path-utils`, `../tools/replace`, `./read-file`
- Keep only: `generateDiffString`, `DiffResult`, `DiffError` types

**Dependency**: `diff` npm package (used by `Diff.diffLines`)

### 1.4 `core.ts` — Hashline Core Logic

**Source**: `packages/coding-agent/src/edit/modes/hashline.ts` — pure functions only, strip executor

**What to keep (all pure, no internal deps)**:
- `HashMismatch` interface
- `Anchor` type
- `HashlineEdit` union type
- `parseTag(ref)` — parse `"42nd"` → `{ line: 42, hash: "nd" }`
- `validateLineRef(ref, fileLines)` — throw `HashlineMismatchError` on mismatch
- `tryRebaseAnchor(anchor, fileLines, window?)` — auto-rebase within ±5 lines
- `applyHashlineEdits(text, edits)` — main apply function
- `HashlineMismatchError` class (with `displayMessage`)
- `formatFullAnchorRequirement(raw?)` — user-friendly error hint
- `stripNewLinePrefixes(lines)` / `stripHashlinePrefixes(lines)` — prefix stripping
- `hashlineParseText(edit)` — normalize edit content array
- `buildCompactHashlineDiffPreview(diff, options?)` — compact diff rendering
- `CompactHashlineDiffPreview` interface + `CompactHashlineDiffOptions`
- `formatCodeFrameLine` — inline replacement (was imported from `../../tools/render-utils`)
- `ANCHOR_REBASE_WINDOW` constant

**What to strip** (internal deps, not in scope):
- `ExecuteHashlineSingleOptions` interface
- `executeHashlineSingle()` function — needs ToolSession, LSP, writethrough
- `computeHashlineDiff()` function — thin wrapper over apply + file read
- `resolveEditAnchors()`, `resolveEditAnchor()` — interim between tool and core
- All schema types (`hashlineEditSchema`, `hashlineEditParamsSchema`) — will be redefined
- All streaming helpers — will be in `streaming.ts`
- `readHashlineFileText()` helper

### 1.5 `streaming.ts`

**Source**: `packages/coding-agent/src/edit/modes/hashline.ts` — streaming generators only

**Keep**:
- `createHashlineChunkEmitter(options, formatLine?)`
- `streamHashLinesFromUtf8(source, options?)`
- `streamHashLinesFromLines(lines, options?)`
- `HashlineStreamOptions` interface
- `isReadableStream()` helper

## Phase 2: Build the Extension Shell

### 2.1 `package.json`

```json
{
  "name": "hashline-edit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "typebox": "^0.34.0",
    "xxhash-wasm": "^1.1.0",
    "diff": "^7.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

### 2.2 `src/index.ts` — Extension Entry Point

The extension registers a single tool `hashline_edit` with:

**Tool schema** (via TypeBox):
```typescript
parameters: Type.Object({
  path: Type.String({ description: "file path for edits" }),
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

**`execute()` function**:
1. Parse `path` relative to `ctx.cwd`
2. Read file via `readFile(absolutePath, "utf8")`
3. Call `applyHashlineEdits(normalizedContent, resolvedEdits)`
4. If no changes, return error with diagnostics
5. Write result via `writeFile(absolutePath, finalContent)` wrapped in `withFileMutationQueue(absolutePath, ...)`
6. Generate diff via `generateDiffString(original, result)`
7. Build compact preview via `buildCompactHashlineDiffPreview(diff)`
8. Return result with diff text

**`renderCall()`**: Show file path and edit count while streaming.

**`renderResult()`**: Render the compact diff preview in the TUI.

**`promptSnippet`**: `"Edit files using hashline anchors (LINE+bigram references)"`

**`promptGuidelines`**: Include instructions for anchor format, range boundaries, the closing-delimiter check, etc.

## Phase 3: Prompt Integration

### 3.1 `prompt-snippet.md` (prompt text embedded in the tool definition)

Contains the hashline prompt text adapted from `hashline.md` in oh-my-pi. The same pattern: read file, copy anchors from the `read` output, reference them as `"42nd"`.

### 3.2 Handlebars Helpers (Optional)

If pi-mono's extension SDK exposes Handlebars registration, register `{{hline}}`, `{{href}}`, `{{hrefr}}` for use in prompt templates. Otherwise, instructions in prompt text are sufficient.

## Phase 4: Registration & Deployment

**Install**: The user places the extension at `~/.pi/agent/extensions/hashline-edit/` or `.pi/extensions/hashline-edit/` and runs:

```bash
cd ~/.pi/agent/extensions/hashline-edit/
npm install
```

Then `/reload` in pi.

**Auto-discovery**: pi scans `~/.pi/agent/extensions/*/index.ts` — the `pi.extensions` field in `package.json` points to `./src/index.ts`.

## What We Leave Behind

The following features exist in oh-my-pi's hashline but are **not in scope** for the initial extension:

| Feature | Reason |
|---|---|
| **LSP writethrough** | Not available in extension SDK. Results in no realtime diagnostics. |
| **Plan mode guard** | Not applicable — extension operates outside plan mode. |
| **Streaming diff during tool call** | pi-mono handles this internally for built-in tools. Extension renderCall is static. |
| **Fuzzy match fallback** | Built-in replace mode feature, not hashline-specific. |
| **Auto-generated file guard** | `assertEditableFileContent` is an oh-my-pi internal. Extension trusts the file. |
| **Inline arg placeholder detection** | Prompt template feature, not core to hashline. |
| **Configurable edit mode** (`PI_EDIT_VARIANT`) | Extension is a separate tool, not a mode toggle. |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `Bun.hash.xxHash32` behavior differs from xxhash-wasm | Verify with test vectors. Ship pre-computed lookup table as fallback. |
| pi-mono extension SDK doesn't expose `withFileMutationQueue` | Fall back to plain `writeFile` — rare race with built-in `edit` in same turn, but acceptable for initial release. |
| TUI rendering (`renderCall`/`renderResult`) not matching built-in polish | Start minimal (raw text), iterate. |
| Model confused between `edit` and `hashline_edit` | Use `promptGuidelines` to clearly differentiate: "Use hashline_edit for precise line-targeted edits; use edit for str_replace style." |

## Success Criteria

1. Extension installs cleanly via `npm install` in the extension directory
2. `hashline_edit` appears in pi's tool list after `/reload`
3. LLM can call `hashline_edit` with hashline anchors and edits are applied
4. Hash validation works: stale anchors produce `HashlineMismatchError` with corrected anchors
5. Auto-rebase works: shifted lines within ±5 window are retargeted
6. Compact diff preview is returned in the tool result
7. File mutations play nice with built-in `edit`/`write` in the same turn (via `withFileMutationQueue`)
