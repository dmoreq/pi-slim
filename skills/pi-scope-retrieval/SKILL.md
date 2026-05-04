---
name: pi-scope-retrieval
description: Use when pi-scope fails to find the right files by context, when you need files retrieved by symbol name instead of path, or when you want to understand how file scoring and dep-context injection works
---

# pi-scope Intelligent Retrieval

## How File Retrieval Works

At session start, pi-scope builds a **symbol index** of every exported name across all parsed files. When you mention a function/class/variable name, the retrieval engine matches against this index — not just filenames.

## Scoring Formula

```
score(file) = 3 × symbolMatch + 2 × filenameMatch + 1 × depProximity
```

| Signal | Weight | What it matches |
|--------|--------|-----------------|
| **symbolMatch** | 3× | Query token matches a symbol that `file` exports |
| **filenameMatch** | 2× | Query token matches the file's basename (without extension) |
| **depProximity** | 1× | File is already a transitive dep of an active file |

## What Gets Injected

Each turn, pi-scope examines the last N messages (default 10) and:

1. **Scans for file paths** via regex — matches `path/to/file.ts` patterns
2. **Scans tool calls** — reads `path`, `filePath`, `file`, `target` arguments from `read`/`write`/`edit`/`bash`/`grep` calls
3. **Scans tool outputs** — extracts paths from compiler errors, logs, and grep results
4. **Runs scored retrieval** — if symbol index exists, scores all files against query text

Matches are combined into an `<dep-context>` block:

```xml
<dep-context>
## Active files
### src/auth.ts
export function authenticate(token: string): User { ... }

## Direct dependencies
### src/auth/models.ts
export interface User { ... }
</dep-context>
```

## Influencing Retrieval

**To make pi-scope find a file:**

1. **Mention the symbol name** — "edit the `authenticate` function" → finds files exporting `authenticate`
2. **Mention the filename** — "look at `auth.ts`" → `filenameMatch` fires
3. **Use `/hashline-read`** — file becomes visible to dep-proximity scoring
4. **Call an LSP tool** — resolved locations feed into next context's `extraPaths`

**Avoid vague queries** like "that validation module" — use the actual symbol name.

## Reading the `<dep-context>` Block

```
<dep-context>
## Active files              ← Files matching your query
### src/auth.ts              ← File path (relative to project root)
export function auth...      ← AST skeleton (signatures only, ~10% of file)

## Direct dependencies       ← Imported modules of active files
### src/auth/models.ts       ← Available without reading
export interface User...
</dep-context>
```

- **Active files** section: highest-scored matches, sorted by relevance
- **Direct dependencies** section: transitive imports (depth configurable via `dependencyDepth`)
- Each entry shows the **AST skeleton** (function/class signatures), not full content

## Transitive Dependency Depth

Configurable via `dependencyDepth` (0-3, default 1):

| Depth | Resolution |
|-------|------------|
| 0 | Active files only — no dependency injection |
| 1 | Active files + their direct imports |
| 2 | Active files + direct imports + those imports' imports |
| 3 | Three levels deep |

## Common Mistakes

| Mistake | Why it fails | Fix |
|---------|--------------|-----|
| Using vague references | No symbol match — falls back to regex path scanning | Use the exact symbol name |
| Expecting full file content | Only **skeletons** are injected | Read the file explicitly if you need full content |
| Assuming all dirs indexed | Excluded dirs (`node_modules`, `dist`, patterns in `slim.exclude`) are skipped | Check your `exclude` config |
| Path not in recent N messages | `scanLastNMessages` default = 10; older messages are ignored | Mention the path again in a recent message |
