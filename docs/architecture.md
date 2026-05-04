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
│  │   └── tree-sitter AST → {skeleton, imports, exports, hash} │
│  ├── DiskCache (SHA-256, avoids re-parsing)           │
│  ├── buildGraph() → RepoIndex                         │
│  │   └── {skeletons, deps, reverseDeps, symbolIndex} │
│  └── saveStore() → .pi/slim/index.json.gz             │
│                                                       │
│  RepoMapGenerator → repo-map string (sorted by mtime) │
└──────────────────────────────────────────────────────┘
    │
    ▼
SessionManager
    │
    ├── RetrievalEngine (scored file search)
    │   └── symbolIndex + filename + depProximity → Top-K
    │
    ├── PluginManager
    │   ├── ContextPruningPlugin (dedup, supersede, error-purge)
    │   └── ReadAwarenessPlugin (prevent unread edits)
    │
    ├── HashlineEdit (registered as tool: hashline_edit)
    │   └── dry_run mode for safe planning
    │
    ├── LspNavigation (3 tools: go-to-def, references, hover)
    │   └── Results feed into context auto-injection
    │
    └── Telemetry (via pi-telemetry)
        ├── injection tracking (repo-map, dep-context)
        ├── token savings + pruning notifications
        └── session stats persistence
    │
    ▼
before_agent_start → InjectionPipeline → repo-map + guidance + context-files
    │
    ▼
context event → PluginManager.onContext (pruning)
    │               │
    │               ▼
    │       RetrievalEngine.retrieveTopK(query)
    │               │
    │               ▼
    │       ContextInjector.buildInjection(with retrieval + transitiveDepth)
    │               │
    │               ▼
    │       <dep-context> with scored, ranked skeletons
    │
    ▼
session_shutdown → LSP shutdown, plugin cleanup, stats persist
```

## Component Dependencies

```
extension.ts
    └── SessionManager
            ├── RetrievalEngine (context/retrieval.ts)
            ├── PluginManager (plugins/plugin-manager.ts)
            │   ├── Plugin interface (plugins/plugin.ts)
            │   ├── ContextPruningPlugin (plugins/context-pruning.ts)
            │   │   └── Pruning Rules (plugins/pruning-rules.ts)
            │   └── ReadAwarenessPlugin (plugins/read-awareness.ts)
            ├── HashlineEditor (tools/hashline-editor.ts)
            │   ├── hashline/line-hash.ts (xxhash-wasm)
            │   ├── hashline/normalize.ts (BOM, line endings)
            │   ├── hashline/core.ts (parse, validate, apply)
            │   ├── hashline/diff.ts (numbered-line diff)
            │   └── hashline/diff-preview.ts (compact preview)
            ├── LspNavigation (tools/lsp-navigation.ts)
            │   └── lsp/service.ts
            │       ├── lsp/client.ts (JSON-RPC)
            │       ├── lsp/launch.ts (process spawner)
            │       └── lsp/language.ts (ext → language id)
            ├── IndexEngine (indexer/engine.ts)
            │   ├── indexer/cache.ts (disk cache)
            │   └── parsers/ (TypeScript, Python, Rust)
            ├── RepoMapGenerator (context/repo-map.ts)
            ├── ContextInjector (context/dep-context.ts)
            │   ├── RetrievalEngine (scored retrieval)
            │   ├── shared/file-detector.ts
            │   └── shared/message.ts, shared/token.ts
            ├── InjectionPipeline (context/pipeline.ts)
            ├── context-files (context/context-files.ts)
            ├── guidance (context/guidance.ts)
            ├── SessionStats (metrics/tracker.ts)
            │   ├── metrics/cost-estimator.ts
            │   └── shared/runtime-state.ts
            └── context/loader.ts + context/schema.ts (config)
```

## Lifecycle Hook Map

| pi event | Handler | What happens |
|----------|---------|-------------|
| `session_start` | `SessionManager.start()` | Load or build index, init plugins, build retrieval engine |
| `before_agent_start` | `handleBeforeAgentStart()` | Build pipeline, inject repo-map + guidance + context-files |
| `context` | `handleContext()` | Run plugins (pruning), scored retrieval, build dep-context, LSP auto-inject |
| `tool_call` | `PluginManager.runToolCall()` | Read-awareness check |
| `session_shutdown` | `SessionManager.shutdown()` | Plugin cleanup, LSP shutdown, persist stats |

## Scoring Formula

```
score(file) = 3 × symbolMatch(query, file.exports) + 2 × filenameMatch(query, file.path) + 1 × dependencyProximity(file, activeDeps)
```

## Storage Layout

```
.pi/slim/
├── index.json.gz     # Gzip-compressed RepoIndex (skeletons + deps + symbolIndex + reverseDeps)
├── state.json        # Latest session state (for /slim across sessions)
├── stats.jsonl       # Historical session records (one JSON line per session)
└── slim.jsonc        # Project-local config (optional)
```

## Key Design Decisions

- **Symbol index:** Enables "edit the authenticate function" → finds `auth.ts` regardless of filename
- **Reverse deps:** Answers "what imports X?" for impact analysis
- **Scored retrieval:** Multi-signal ranking means the most relevant files fit in budget
- **Hashline anchors:** Hash-verified line references prevent editing wrong content. Dry-run for safe planning
- **LSP auto-injection:** LSP results feed into next context — no manual re-reads
- **Transitive deps:** Configurable depth (1-3) for import chains
- **Plugin system (OCP):** Adding behavior = register a plugin. No core edits
- **Telemetry DRY:** Consolidated helpers in `shared/telemetry-helpers.ts`
