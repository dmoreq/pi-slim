# Enhanced context intelligence

pi-scope augments each session with an **intelligence layer** that reads the recent transcript, correlates it with graph analysis (when available), and injects compact guidance so agents favor consistent tool usage (hashline, LSP) and high-impact symbols.

## What gets injected

1. **Workflow optimization** — When to use `hashline_edit`, `lsp_go_to_definition`, `lsp_find_references`, and related tools.
2. **High-impact symbols** — God nodes and risk notes when edit intent matches graph labels.
3. **Smart dependency context** — High-priority symbols, recommended tools for the current intent, and light architectural hints from communities.
4. **Repository map prioritization** — On `before_agent_start`, the repo map can be prefixed with graph-prioritized navigation when analysis is loaded.

## Session flow

- **`before_agent_start`** — Builds the usual injection pipeline (repo map, provider guidance, context files). Repo map text may be prefixed with graph-prioritized sections. After graph insights, **`generateIntelligentGuidance`** output is appended so the system prompt carries dynamic steering before the first model turn.
- **`context`** — `handleContext` always syncs the transcript buffer, evaluates whether dependency skeleton injection should run (paths, tools, retrieval, broad queries — unchanged gates), **and** composes an enhanced guidance block (`actionable` + smart dependency suggestions). Guidance is prefixed to `<dep-context>` when both apply, or returned as a standalone developer-context payload when gates skip skeleton injection.

## Configuration

Enhanced intelligence respects the same **slim** flags as core pi-scope (`slim.enabled`, token budgets, `slim.scanLastNMessages`). No separate feature flag is required: if indexing is disabled and no session exists, context handlers no-op like before.

Graph correlation uses **`GraphService.analysis`** / **`loadGraphifyAnalysis`** when present (e.g. graphify cache under `graphify-out/`).

## Testing

Run the focused suite:

```bash
npm run test:intelligence
```

Watch mode:

```bash
npm run test:intelligence:watch
```

Build plus intelligence tests:

```bash
npm run build:intelligence
```

Integration coverage lives in **`tests/integration/enhanced-context.test.ts`**.

## Performance

Insight generation avoids network I/O in the steady path: it reuses cached graph analysis and runs synchronously aside from resolving optional **`loadGraphifyAnalysis`**. Guidance is appended to prompts in linear time relative to transcript length (capped in `SessionManager`).
