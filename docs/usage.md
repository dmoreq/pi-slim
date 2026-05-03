# Usage Guide

## Installation

### Via pi CLI

```bash
pi install @pi/slim
```

### Via settings.json

Add to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["@pi/slim"]
}
```

### From source

```bash
git clone https://github.com/dmoreq/pi-slim.git
cd pi-slim
npm install && npm run build
pi install ./path/to/pi-slim
```

## First Run

On the first `pi` session in a project, you'll see:

```
[slim] first run — indexing project (this takes a few seconds)…
[slim] ✓ indexed 1,234 files, 567 edges → .pi/slim/
```

Subsequent sessions load instantly from cache:

```
[slim] ✓ 1,234 files loaded (built May 3 2026)
```

## What Gets Injected

### `<repo-map>` (system prompt, once per session)

```
<repo-map>
  src/
    extension.ts   smartContextExtension, FLAGS, registerFlags
    manager.ts     SessionManager, INJECTION_HANDLERS
  src/indexer/
    engine.ts      IndexEngine, walkDir, resolveImport
  ...
</repo-map>
```

Use this to answer "where does X live?" without reading any files.

### `<dep-context>` (developer message, every turn)

```
<dep-context>
## Active files
### src/manager.ts
export class SessionManager { ... }
export interface SessionState { ... }

## Direct dependencies
### src/metrics/tracker.ts
export class SessionStats { ... }
</dep-context>
```

Use this to understand function signatures and dependencies without reading the full file.

### `<context-files>` (system prompt, once)

```
# Extra Context Files

Additional project instructions and guidelines:

## /path/to/project/AGENTS.local.md

...
```

### `<provider-guidance>` (system prompt, once)

```
# Provider-Specific Context

## /path/to/project/CLAUDE.md

...
```

## Configuration Reference

### Layer priority

1. **CLI flags** (highest) — set via `pi` config or command-line
2. **Project config** — `.pi/slim.jsonc`
3. **Global config** — `~/.pi/agent/slim.jsonc`
4. **Defaults** — hardcoded in `config/schema.ts`

### JSONC Config Format

Global config (`~/.pi/agent/slim.jsonc`):

```jsonc
{
  // Applied to all projects
  "maxRepoMapTokens": 4000,
  "contextFiles": {
    "filenames": ["AGENTS.local.md", "CLAUDE.local.md"]
  }
}
```

Project config (`.pi/slim.jsonc`):

```jsonc
{
  // Per-project overrides
  "enabled": true,
  "maxInjectionTokens": 12000,
  "exclude": [
    "**/node_modules/**",
    "**/vendor/**",
    "**/*.generated.*"
  ],
  "providerGuidance": {
    "enabled": false  // Disable if you don't use CLAUDE.md etc.
  }
}
```

### Token Budget Tuning

If you see warnings like `repo-map trimmed (6000 tokens > budget)`, increase the budget:

```jsonc
{
  "maxRepoMapTokens": 8000,
  "maxInjectionTokens": 12000
}
```

The combined budget for `before_agent_start` is `maxRepoMapTokens + maxInjectionTokens`.

## Commands

### `/slim`

Shows injection statistics for the current or last session:

```
── slim session stats ──────────────────
  Index source     : fresh
  Files indexed    : 1,234
  Dep edges        : 567
  Repo map         : ~3,500t (once)
  Dep-context      : 12x, ~2,400t total
  Token savings    : ~18,000t (88% vs full reads)
  Unique files seen: 45

  Most-mentioned files:
    5×  src/manager.ts
    3×  src/extension.ts
─────────────────────────────────────────────────
```

## Troubleshooting

### Index build is slow

Large projects (10,000+ files) take longer. The cache reduces subsequent sessions to near-instant:

```
[slim] first run — indexing project…
# Wait 3-5 seconds for large projects. Subsequent sessions are instant.
```

To speed up the first index, add more `exclude` patterns:

```jsonc
{ "exclude": ["**/node_modules/**", "**/*.test.*", "**/examples/**"] }
```

### Files not being detected

The file detector scans:
1. User messages containing paths like `src/foo.ts`
2. Tool call arguments (read/write/edit path values)
3. Tool output (compiler errors with file references)

If a file isn't detected, check:
- Does the file have a supported extension (`.ts`, `.tsx`, `.py`, `.rs`)?
- Is the path mentioned with at least one directory level (e.g., `src/foo.ts` not just `foo.ts`)?
- Is the file excluded via `exclude` patterns?

### Seeing duplicate context

If you also have `pi-me` installed, you may get duplicate injection of `AGENTS.local.md` and `CLAUDE.md`. This is because pi-me's `extra-context-files` and `agent-guidance` were migrated into pi-slim. Update pi-me to the latest version which no longer includes those extensions:

```bash
pi update pi-me
```

## Language Support Matrix

| Feature | TypeScript | Python | Rust | Go (planned) | Java (planned) |
|---------|-----------|--------|------|-------------|---------------|
| Skeleton extraction | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| Import resolution | ✅ | ✅ (relative) | ✅ (`mod`, `crate`, `super`) | ⬜ | ⬜ |
| File path detection | ✅ | ✅ | ✅ | ⬜ | ⬜ |

## Uninstalling

```bash
pi uninstall @pi/slim
rm -rf .pi/slim/  # Remove cached index (optional)
```
