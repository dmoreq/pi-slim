---
type: "query"
date: "2026-05-11T13:50:58.287022+00:00"
question: "What features are available in the pi-scope codebase, which are active vs inactive, how can they be grouped by functionality, and where do they overlap or conflict?"
contributor: "graphify"
source_nodes: ["Intelligent Retrieval", "Graph Analysis", "AST Skeleton Injection", "Hashline Editing", "LSP Code Navigation", "Context Pruning"]
---

# Q: What features are available in the pi-scope codebase, which are active vs inactive, how can they be grouped by functionality, and where do they overlap or conflict?

## Answer

Grouped pi-scope features into core runtime (indexing/parsing, retrieval/context injection, graph analysis, context intelligence/generators, hashline editing, LSP) and platform ops (session/orchestration, services/caching, plugins, telemetry, configuration, visualization). Active core features are documented in README; overlap risks center on manager proliferation, context-processing fragmentation, and service duplication. Inactive/planned items include legacy config patterns, unused plugin interfaces, dormant analysis algorithms, dead-code detection, and advanced context intelligence.

## Source Nodes

- Intelligent Retrieval
- Graph Analysis
- AST Skeleton Injection
- Hashline Editing
- LSP Code Navigation
- Context Pruning