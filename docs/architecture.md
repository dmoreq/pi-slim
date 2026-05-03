# Architecture

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        session_start                            │
│                                                                 │
│  Project directory                                              │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  IndexEngine │───→│ LanguageParser│───→│   FileIndex[]    │   │
│  │  (walk dir)  │    │ (tree-sitter) │    │ {skeleton,       │   │
│  └──────────────┘    └──────────────┘    │  imports, hash}   │   │
│                                          └────────┬─────────┘   │
│                                                   │             │
│                          ┌──────────────┐          │             │
│                          │  DiskCache   │◄─────────┘             │
│                          │ (SHA-256)    │                        │
│                          └──────────────┘                        │
│                                                   │             │
│                                                   ▼             │
│                                          ┌──────────────────┐   │
│                                          │   RepoIndex      │   │
│                                          │ {skeletons, deps, │   │
│                                          │  reverseDeps}    │   │
│                                          └────────┬─────────┘   │
│                                                   │             │
│                          ┌──────────────┐          │             │
│                          │  index-store │◄─────────┘             │
│                          │ (.pi/smart-  │                        │
│                          │  context/)   │                        │
│                          └──────────────┘                        │
│                                                   │             │
│                                                   ▼             │
│                          ┌──────────────────────────────┐       │
│                          │      RepoMapGenerator        │       │
│                          │  <repo-map>src/              │       │
│                          │    foo.ts  Foo, bar()         │       │
│                          └──────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     before_agent_start (first turn)              │
│                                                                 │
│  InjectionPipeline                                              │
│  ┌──────────────┐  priority 1  →  <repo-map>                   │
│  │  register()  │  priority 2  →  <provider-guidance>          │
│  │              │  priority 4  →  <context-files>              │
│  │  build(12K)  │                                              │
│  │  (trim if    │  Output: combined block appended to           │
│  │   over budget)│  systemPrompt                                │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       context (every turn)                       │
│                                                                 │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐ │
│  │  file-detector│──→│ ContextInjector │──→│  <dep-context>   │ │
│  │  (message +  │    │ (skeleton +     │    │ ## Active files  │ │
│  │   tool scan) │    │  1st-degree     │    │ ## Dependencies  │ │
│  └──────────────┘    │  deps)          │    └──────────────────┘ │
│                      └────────────────┘                         │
│                                                                 │
│  Preprended as developer-role message before every LLM call      │
└─────────────────────────────────────────────────────────────────┘
```

## Component Dependency Graph

```
extension.ts (80 lines — lifecycle wiring)
    │
    └── SessionManager (manager.ts)
            │
            ├── IndexEngine (indexer/engine.ts)
            │       ├── DiskCache (indexer/cache.ts)
            │       ├── TypeScriptParser (parsers/typescript-parser.ts)
            │       ├── PythonParser (parsers/python-parser.ts)
            │       └── RustParser (parsers/rust-parser.ts)
            │
            ├── RepoMapGenerator (injectors/repo-map.ts)
            │       └── types.ts
            │
            ├── ContextInjector (injectors/dep-context.ts)
            │       ├── file-detector (detect/file-detector.ts)
            │       ├── utils/message.ts
            │       └── utils/token.ts
            │
            ├── InjectionPipeline (injectors/pipeline.ts)
            │       └── utils/token.ts
            │
            ├── context-files (injectors/context-files.ts)
            ├── guidance (injectors/guidance.ts)
            │
            ├── SessionStats (metrics/tracker.ts)
            │       ├── metrics/cost-estimator.ts
            │       ├── persistence/runtime-state.ts
            │       └── paths.ts
            │
            └── config/loader.ts
                    └── config/schema.ts
                            └── zod
```

## Extension Lifecycle Hook Map

```
pi lifecycle              slim handler           what happens
─────────────              ─────────────────────          ─────────────
session_start              SessionManager.start()         Load/build index
                                                          Load context files
                                                          Init status bar

before_agent_start         SessionManager.handleBeforeAgentStart()
                                                          Build pipeline
                                                          Inject repo-map
                                                          Inject guidance
                                                          Inject context-files

context (per turn)         SessionManager.handleContext() Early-exit check
                                                          Scan messages
                                                          Build dep-context
                                                          Record stats

session_shutdown           SessionManager.shutdown()      Show summary
                                                          Persist stats
                                                          Clear status bar
```

## Pipeline Priority

Sources register with a numeric priority. Lower = higher priority (injected first, trimmed last).

| Source | Priority | Injected | Trimmed first? |
|--------|----------|----------|----------------|
| `<repo-map>` | 1 | Once | No (highest priority) |
| `<provider-guidance>` | 2 | Once | Only if very over budget |
| `<context-files>` | 4 | Once | Yes (lowest priority) |
| `<dep-context>` | (separate flow) | Per turn | Handled by ContextInjector budget |

## Storage Layout

```
.pid/slim/
├── index.json       # Serialized RepoIndex (skeletons + dep graph)
├── repo-map.txt     # Generated repo-map string
├── state.json       # Latest session state (for cross-session /slim)
├── stats.jsonl      # Historical session records (one JSON line per session)
└── slim.jsonc  # Project-local config (optional)
```
