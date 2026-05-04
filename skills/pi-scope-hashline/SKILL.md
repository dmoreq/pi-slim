---
name: pi-scope-hashline
description: Use when editing files with hashline anchors, when hashline_edit returns a HashlineMismatchError, when you need to understand LINE+BIGRAM references, or when you want to use dry-run mode for safe edits
---

# pi-scope Hashline Editing

## How Hashline Anchors Work

Every line in a file has a `LINE+BIGRAM` anchor — a 1-indexed line number followed by a 2-letter hash:

```
1tz|import { readFile } from 'fs'
2tr|export function authenticate(token: string): User {
3nd|  // ...
```

The 2-letter suffix is a BPE bigram (from a stable set of 647 bigrams), computed via xxHash32 modulo 647 over the normalized line content. Structural lines (whitespace/braces only) use English ordinal suffixes (`st`, `nd`, `rd`, `th`) instead.

The anchor serves as both an **address** and a **staleness check** — if the line content changed, the bigram won't match.

## Editing with Hash Anchors

Instead of providing the full old/new text (like the normal `edit` tool), you reference lines by their anchor:

```
hashline_edit({
  path: "src/auth.ts",
  edits: [
    {
      loc: { append: "3nd" },
      content: ["return user;"]
    }
  ]
})
```

## Edit Operations

| Operation | `loc` Format | Description |
|-----------|-------------|-------------|
| **replace_line** | no loc needed (provide content matching anchor) | Replace one line |
| **replace_range** | `{ range: { pos: "10ab", end: "20cd" } }` | Replace a range of lines (inclusive) |
| **append_at** | `{ append: "42nd" }` | Insert lines **after** the anchor |
| **prepend_at** | `{ prepend: "42nd" }` | Insert lines **before** the anchor |
| **append_file** | `"append"` | Append lines to end of file |
| **prepend_file** | `"prepend"` | Prepend lines to beginning of file |

## Getting Hash Anchors

1. **From skeletons** — dep-context skeletons include anchors automatically
2. **`/hashline-read <file>`** — read any file with anchor annotations
3. **`read` tool** — use `hashline_edit` after reading normally (the edit tool validates anchors)

## Dry-Run Mode

Always validate edits safely before writing:

```
hashline_edit({
  path: "src/auth.ts",
  edits: [...],
  dry_run: true  // Validate anchors + show diff without writing
})
```

Returns a diff preview showing `+` (added), `-` (removed), `*` (modified), and ` ` (unchanged) lines with anchors.

## Auto-Rebase

If a line shifts within ±5 lines of the anchor position (e.g., another edit added/removed lines above), the system auto-rebases — as long as the **content hash** still matches at the new position.

```
Auto-rebased anchor 42nd → 44nd (line shifted within ±5; hash matched).
```

If the content changed, you get a `HashlineMismatchError`.

## HashlineMismatchError Recovery

When anchors don't match, the error shows:

```
Edit rejected: 1 line has changed since the last read (marked *).
The edit was NOT applied, please use the updated file content shown below.

* 42nd|export function authenticate(token: string): User {
  43rd|  const db = getDb()
```

**Recovery steps:**

1. Re-read the file with `/hashline-read <file>`
2. Use the **new anchors** shown — they are the current valid addresses
3. Re-issue the edit with corrected anchors

The error includes a `.remaps` map converting old anchors to new ones.

## Prefix Stripping

If you copy/paste content from a hashline-annotated read into your edit, the system auto-strips hashline prefixes and diff markers (`+`, `>` markers) from your content. This keeps your edits clean.

## Common Pitfalls

| Mistake | Result | Fix |
|---------|--------|-----|
| Supplying only the 2-letter suffix ("nd") | Parse error | Supply the full anchor ("42nd") — line number + bigram |
| Editing unread file | ReadAwarenessPlugin blocks it | Read the file first with `read` or `/hashline-read` |
| Forgetting `dry_run: true` | Edit applied immediately | Use dry-run for validation first |
| Re-using stale anchors | HashlineMismatchError | Re-read file, use current anchors |
| Editing range where pos > end | Error | Ensure start line < end line |
| Targeting nonexistent line | Error | Check file has enough lines |
