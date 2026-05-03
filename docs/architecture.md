# Architecture

## Data Flow

```
session_start
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  IndexEngine                                          │
│  ├── walkDir() → file list (respects .gitignore)     │
│  ├── LanguageParser.parseFile() → FileIndex           │
│  │   └── tree-sitter AST → {skeleton, imports, hash}  │
│  ├── DiskCache (SHA-256 cache, avoids re-parsing)     │
│  ├── buildGraph() → RepoIndex {skeletons, deps}       │
│  └── saveStore() → .pi/slim/index.json.gz (gzip)      │
│                                                       │
│  RepoMapGenerator → .pi/slim/repo-map.txt             │
└──────────────────────────────────────────────────────┘
    │
    ▼
before_agent_start (first turn)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  InjectionPipeline                                    │
│  ├── priority 1: <repo-map>                           │
│  ├── priority 2: <provider-guidance>                  │
│  ├── priority 4: <context-files>                      │
│  └── trim to maxRepoMapTokens + maxInjectionTokens    │
└──────────────────────────────────────────────────────┘
    │
    ▼
context event (every turn)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  ContextInjector                                      │
│  ├── file-detector (messages + tool calls + output)   │
│  ├── detectInFocusFiles() → set of mentioned paths    │
│  ├── buildInjection() → <dep-context> block           │
│  └── trim to maxInjectionTokens                       │
└──────────────────────────────────────────────────────┘
```

## Component Dependencies

```
extension.ts
    └── SessionManager
            ├── IndexEngine
            │       ├── DiskCache
            │       └── LanguageParser (x3: TS, Python, Rust)
            ├── RepoMapGenerator
            ├── ContextInjector
            │       ├── file-detector (detect/)
            │       └── shared/message.ts, shared/token.ts
            ├── InjectionPipeline
            │       └── shared/token.ts
            ├── context-files (injectors/)
            ├── guidance (injectors/)
            ├── SessionStats
            │       ├── metrics/cost-estimator.ts
            │       └── persistence/runtime-state.ts
            └── config/loader.ts
                    └── config/schema.ts (zod)
```

## Lifecycle Hook Map

| pi event | Handler | What happens |
|----------|---------|-------------|
| `session_start` | `SessionManager.start()` | Load or build index, init status bar |
| `before_agent_start` | `SessionManager.handleBeforeAgentStart()` | Build pipeline, inject repo-map + guidance + context-files |
| `context` | `SessionManager.handleContext()` | Scan messages, build dep-context, record stats |
| `session_shutdown` | `SessionManager.shutdown()` | Show summary, persist stats, clear status bar |

## Injection Priority

| Source | Priority | Frequency | Trimmed first? |
|--------|----------|-----------|----------------|
| `<repo-map>` | 1 | Once | No (highest) |
| `<provider-guidance>` | 2 | Once | Only if severely over budget |
| `<context-files>` | 4 | Once | Yes (lowest) |
| `<dep-context>` | (separate flow) | Per turn | Handled by ContextInjector budget |

## Storage Layout

```
.pi/slim/
├── index.json.gz     # Gzip-compressed RepoIndex (skeletons + dep graph)
├── repo-map.txt      # Generated repo-map string
├── state.json        # Latest session state (for cross-session /slim)
├── stats.jsonl       # Historical session records (one JSON line per session)
└── slim.jsonc        # Project-local config (optional)
```

## Key Design Decisions

- **One-directional dep graph:** Answers "what does X import?" only. For reverse lookups ("what imports X?"), use `search` / `ripgrep`.
- **SHA-256 content hashing:** Avoids re-parsing unchanged files across sessions.
- **Gzip compression:** Reduces `.pi/slim/` disk usage by ~84% vs raw JSON.
- **Atomic writes:** Cache + store use tmp + rename to prevent corruption on crash.
- **Handler registry (OCP):** Adding an injection source = register handler + add pipeline source — no switch statements.
