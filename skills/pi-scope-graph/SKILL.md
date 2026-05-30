---
name: pi-scope-graph
description: Use when editing or navigating code with pi-scope graph analysis — god nodes, communities, impact, and /scope graph
---

# pi-scope Code-Graph

## When to use

- Before changing shared APIs or central symbols → check **god nodes** and run `lsp_find_references`
- Understanding module boundaries → read **COMMUNITIES** in repo map and `ARCHITECTURAL CONTEXT`
- High-risk edits → read **Graph pulse** / graph insights in system context
- Offline impact without LSP → `graph_symbol_impact` tool

## Injected blocks (what to read)

| Block | Meaning |
|-------|---------|
| Graph Analysis Insights | Full snapshot (first turn): god nodes, communities, bottlenecks |
| Graph pulse | Compact reminder: active community, focused god nodes, cycle hint |
| HIGH-PRIORITY SYMBOLS | Symbols matching god nodes for this turn |
| ARCHITECTURAL CONTEXT | Communities mentioned or relevant to symbols |
| Graph impact (LSP hover) | Dependents, criticality — prefer `lsp_hover` when server available |

## Workflow before risky edits

1. Confirm symbol is a **god node** (CRITICAL / high in-degree in context)
2. `lsp_find_references` then `lsp_hover`
3. `hashline_edit` with `dry_run: true` then apply
4. Avoid deepening **circular dependencies** if context warns

## Limits

- Graph is built from **import/export** relationships, not every runtime call
- God node = many importers — confirm with LSP before assuming blast radius
- `/scope` and `/scope graph` show quality score, cycles, active community

## Config (`slim.graph`)

See `docs/GRAPH_ADOPTION_PLAN_VI.md` for full adoption plan.
