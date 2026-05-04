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
│  ├── DiskCache (SHA-256, avoids re-parsing)           │
│  ├── buildGraph() → RepoIndex {skeletons, deps}       │
│  └── saveStore() → .pi/slim/index.json.gz             │
│                                                       │
│  RepoMapGenerator → repo-map string                   │
└──────────────────────────────────────────────────────┘
    │
    ▼
SessionManager
    │
    ├── PluginManager (OCP-compliant plugin system)
    │   ├── ContextPruningPlugin (dedup, supersede, error-purge)
    │   └── ReadAwarenessPlugin (prevent unread edits)
    │
    ├── HashlineEdit (registered as tool: hashline_edit)
    │   ├── line-hash.ts → compute xxHash32 bigram
    │   ├── core.ts → validate anchor → apply edits → diff
    │   └── tools/hashline-editor.ts → tool wrapper
    │
    ├── LspNavigation (registered as tools: lsp_*)
    │   ├── lsp/client.ts → LSP JSON-RPC client
    │   ├── lsp/service.ts → singleton service
    │   └── tools/lsp-navigation.ts → tool wrappers
    │
    └── Telemetry (via pi-telemetry)
        ├── injection tracking (repo-map, dep-context)
        ├── token savings estimation
        └── session stats persistence
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
┌──────────────────────────────────────────────────────────┐
│  PluginManager.runHook('onContext')                       │
│  └── ContextPruningPlugin.onContext()                     │
│      ├── deduplicate identical messages                   │
│      ├── supersede old file writes                        │
│      └── purge resolved errors                            │
│                                                           │
│  ContextInjector (context/dep-context.ts)                  │
│  ├── shared/file-detector → find file mentions           │
│  ├── detectInFocusFiles() → set of mentioned paths        │
│  ├── buildInjection() → <dep-context> block               │
│  └── trim to maxInjectionTokens                           │
└──────────────────────────────────────────────────────────┘
```

## Component Dependencies

```
extension.ts
    └── SessionManager
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
            │       └── lsp/language.ts (ext -> language id)
            ├── IndexEngine (indexer/engine.ts)
            │   ├── indexer/cache.ts (disk cache)
            │   └── parsers/ (TypeScript, Python, Rust)
            ├── RepoMapGenerator (context/repo-map.ts)
            ├── ContextInjector (context/dep-context.ts)
            │   ├── shared/file-detector.ts
            │   └── shared/message.ts, shared/token.ts
            ├── InjectionPipeline (context/pipeline.ts)
            │   └── shared/token.ts
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
| `session_start` | `SessionManager.start()` | Load or build index, init plugins |
| `before_agent_start` | `handleBeforeAgentStart()` | Build pipeline, inject repo-map + guidance + context-files |
| `context` | `handleContext()` | Run plugins (pruning), scan messages, build dep-context |
| `tool_call` | `PluginManager.runToolCall()` | Read-awareness check |
| `session_shutdown` | `SessionManager.shutdown()` | Plugin cleanup, LSP shutdown, persist stats |

## Hashline Edit Flow

```
User: hashline_edit({path, edits})
    │
    ▼
tools/hashline-editor.ts
    ├── readFile(absPath)
    ├── stripBom() → normalizeToLF() → detectLineEnding()
    ├── resolveEdit() → parseTag() → HashlineEdit[]
    ├── hashline/core.ts: applyHashlineEdits()
    │   ├── validate anchors (hash match → pass, shift → auto-rebase, mismatch → HashlineMismatchError)
    │   ├── collect boundary duplication warnings
    │   ├── dedupe identical edits
    │   ├── sort bottom-up and apply
    │   └── return { lines, firstChangedLine, warnings, noopEdits }
    ├── restoreLineEndings() → writeFile(absPath)
    ├── generateDiffString() → buildCompactHashlineDiffPreview()
    └── return { diff preview + counters }
```

## LSP Navigation Flow

```
Tool call (e.g. lsp_go_to_definition)
    │
    ▼
tools/lsp-navigation.ts
    └── lsp/service.ts: LspNavigationService
        ├── ensureServer(filePath, projectRoot)
        │   ├── getLanguageId() → lookup language
        │   ├── SERVERS[lang] → find command
        │   ├── lsp/launch.ts: launchLSP() → spawn process
        │   └── lsp/client.ts: createLSPClient() → JSON-RPC
        ├── client.definition() / client.references() / client.hover()
        └── format result → return string
```

## Injection Priority

| Source | Priority | Frequency | Trimmed first? |
|--------|----------|-----------|----------------|
| `<repo-map>` | 1 | Once | No (highest) |
| `<provider-guidance>` | 2 | Once | Only if severely over budget |
| `<context-files>` | 4 | Once | Yes (lowest) |
| `<dep-context>` | (separate flow) | Per turn | Handled by ContextInjector budget |

## Pruning Rule Pipeline

```
Incoming messages → Deduplication → Superseded Writes → Error Purging → Pruned messages
```

## Storage Layout

```
.pi/slim/
├── index.json.gz     # Gzip-compressed RepoIndex
├── state.json        # Latest session state (for /slim across sessions)
├── stats.jsonl       # Historical session records (one JSON line per session)
└── slim.jsonc        # Project-local config (optional)
```

## Key Design Decisions

- **One-directional dep graph:** Answers "what does X import?" only. Reverse lookups → `search`.
- **SHA-256 content hashing:** Avoids re-parsing unchanged files across sessions.
- **Gzip compression:** Reduces `.pi/slim/` disk usage by ~84%.
- **Hashline anchors:** Hash-verified line references prevent editing the wrong content. Auto-rebase within ±5 lines handles common shifts.
- **LSP lazy startup:** Language servers only start when a navigation tool is called; shut down at session end.
- **Plugin system (OCP):** Adding a new behavior = register a plugin. No core edits needed.
- **Telemetry consolidation:** DRY helper functions in `shared/telemetry-helpers.ts`.
