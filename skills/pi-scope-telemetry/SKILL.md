---
name: pi-scope-telemetry
description: Use when interpreting pi-scope stats, debugging injection issues, understanding token savings calculations, reading session logs, or monitoring pi-scope behavior via pi-telemetry
---

# pi-scope Telemetry & Monitoring

## The `/pi-scope` Command

Shows injection stats for the current session:

```
── pi-scope session stats ───────────────────────────
  Index source     : cache
  Files indexed    : 1,234
  Dep edges        : 567
  Repo map         : ~3,500t (once)
  Dep-context      : 12x, ~2,400t total
  Context files    : 1, ~150t (once)
  Provider guidance: 1, ~200t (once)
  Token savings    : ~18,000t (88% vs full reads)
  Unique files seen: 24
  Most-mentioned files:
    6×  auth/services.ts
    4×  db/connection.ts
─────────────────────────────────────────────────
```

Cross-session stats available via `/pi-scope` when no current session exists — reads from `.pi/slim/state.json`.

## Notification Types

| Prefix | Meaning | Trigger |
|--------|---------|---------|
| `[slim] ✓ 1,234 files loaded` | Success — cache hit | Session start |
| `[slim] indexed 1,234 files, 567 edges` | Success — fresh build | First session |
| `[slim] ℹ injecting 3 file(s) (~150 tokens (88% saved))` | Info — dep-context injection | Per turn |
| `[slim] ⚠ repo-map trimmed (5000 tokens > budget)` | Warning — budget exceeded | Before agent start |
| `[slim] ✂️ Pruned 5/30 messages (17%)` | Success — pruning active | Per turn |
| `[slim] ✗ indexing failed: ...` | Error — build failure | Session start |
| `[slim] ℹ store corrupted, rebuilding…` | Warning — auto-recovery | Session start |

## Status Bar

The TUI status bar shows live stats during a session:

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

All stored under `.pi/slim/`:

| File | Format | Content |
|------|--------|---------|
| `index.json.gz` | gzipped JSON | Versioned RepoIndex (skeletons, deps, metadata) |
| `repo-map.txt` | Plain text | The `<repo-map>` XML block |
| `state.json` | JSON | Last session state (for cross-session `/pi-scope`) |
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
  "contextFilesTokens": 150,
  "contextFilesCount": 1,
  "providerGuidanceTokens": 200,
  "providerGuidanceCount": 1,
  "totalTokensSaved": 18000,
  "savingsRatio": 0.88
}
```

## Debugging Injection Issues

| Problem | Log symptom | Cause |
|---------|-------------|-------|
| No dep-context injected | No `ℹ injecting N file(s)` message | No file paths/symbols found in recent messages |
| High token usage in skeletons | Unexpectedly large `~Nt` per turn | Too many files matching query; lower `maxInjectionTokens` |
| Dep-context contains wrong files | Files injected that weren't mentioned | Broad regex match or high-scoring symbol match across many files |
| Files not found | File not in injected set | Extension not supported, file in excluded dir, or not in `scanLastNMessages` window |
| LSP results not feeding in | LSP returns paths but no auto-injection | LSP results only feed into *next* context turn |
