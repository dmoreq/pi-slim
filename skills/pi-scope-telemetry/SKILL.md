---
name: pi-scope-telemetry
description: Use when interpreting pi-scope stats, debugging injection issues, understanding token savings calculations, reading session logs, or monitoring pi-scope behavior via pi-telemetry
---

# pi-scope Telemetry & Monitoring

## No User Commands Needed

Everything is automatic — pi-telemetry handles all notifications:

| Event | What you see (pi-telemetry badge) |
|-------|-----------------------------------|
| Index loaded from cache | `[index] Loaded 1,234 files from cache` |
| Index built fresh | `[index] Indexed 1,234 files in 2.1s` |
| Graph data loaded | `[graph] Graph: 144 nodes, 330 edges` |
| Error occurred | `[error] indexing failed: ...` |

You don't need to run `/scope` or any command. All stats are tracked silently in `.pi/pi-scope/stats.jsonl`.

## Notification Types

| Prefix | Meaning | Trigger |
|--------|---------|---------|
| `[index] Loaded N files from cache` | Success — cache hit | Session start |
| `[index] Indexed N files in Xs` | Success — fresh build | First session |
| `[graph] Graph: N nodes, M edges` | Info — graph loaded | Session start (if graph available) |
| `[error] ...` | Error — build failure | Session start |

## Status Bar

The TUI status bar shows live stats during a session (auto-managed by pi-scope):

```
SmartCtx: 1,234 files | map ~3,500t | 12 inj | 1 ctx | 1 guid
```

| Segment | Meaning |
|---------|---------|
| `files` | Number of files indexed |
| `map ~Nt` | Repo-map token count |
| `N inj` | Dep-context injection count this session |
| `N ctx` | Context files loaded |
| `N guid` | Provider guidance files loaded |

## Token Savings Calculation

```
savingsRatio = 1 - (skeletonTokens / (skeletonTokens + fullFileTokens))
```

Where `fullFileTokens` is estimated from the actual file content on disk. If the file can't be read, a heuristic multiplier of **8× skeleton size** is used.

The savings ratio shown in notifications (e.g., "88% saved") is cumulative across all dep-context injections.

## Session Data Files

All stored under `.pi/pi-scope/`:

| File | Format | Content |
|------|--------|---------|
| `index.json.gz` | gzipped JSON | Versioned RepoIndex (skeletons, deps, metadata) |
| `repo-map.txt` | Plain text | The `<repo-map>` XML block |
| `state.json` | JSON | Last session state |
| `stats.jsonl` | JSON Lines | One record per session (append-only) |
| `slim.jsonc` | JSONC | Project-local config (optional) |

## SessionRecord Shape (`stats.jsonl`)

```json
{
  "sessionId": "abc123",
  "startedAt": "2026-05-04T...",
  "endedAt": "2026-05-04T...",
  "indexSource": "cache",
  "indexedFiles": 1234,
  "depEdges": 567,
  "repoMapTokens": 3500,
  "depContextTriggers": 12,
  "depContextTotalTokens": 2400,
  "uniqueFilesInjected": 24,
  "topFiles": [{"file": "src/auth.ts", "mentions": 6}],
  "totalTokensSaved": 18000,
  "savingsRatio": 0.88
}
```

## Debugging Injection Issues

| Problem | Log symptom | Cause |
|---------|-------------|-------|
| No dep-context injected | No `[index]` notification | No file paths/symbols found in recent messages |
| High token usage in skeletons | Large injection count | Too many files matching query; lower `maxInjectionTokens` |
| Dep-context contains wrong files | Files injected that weren't mentioned | Broad regex match or high-scoring symbol match across many files |
| Files not found | File not in injected set | Extension not supported, file in excluded dir, or not in `scanLastNMessages` window |
| LSP results not feeding in | LSP returns paths but no auto-injection | LSP results only feed into *next* context turn |
