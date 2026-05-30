---
name: pi-scope-lsp
description: Use when navigating code with pi-scope LSP tools, installing language servers, or choosing between lsp_go_to_definition, lsp_find_references, lsp_hover, and workspace symbol search
---

# pi-scope LSP Navigation

## When to use

- Locate definitions or implementations → LSP, not full-file `read`
- Assess blast radius before edits → `lsp_find_references`
- Type info + graph impact + hashline anchor → `lsp_hover`
- Search symbol by name → `lsp_workspace_symbol`
- Compare server errors after build → `lsp_diagnostics`
- Parameter hints at call sites → `lsp_signature_help`

## Line and column

Tools use **0-based** `line` and `column` (LSP convention).

From citation `src/auth.ts:42` use `line: 41`, `column: 0` unless you know the exact column.

## Recommended workflow

1. `lsp_go_to_definition` or `lsp_workspace_symbol` to find the symbol
2. `lsp_find_references` before changing shared APIs
3. `lsp_hover` for type, graph impact, and hashline anchor at cursor
4. After `tsc`/test failures: `lsp_diagnostics` on error files, then `lsp_hover` at each error line (0-based)
5. `hashline_edit` with `dry_run: true` then apply

## Language servers (install on PATH)

| Language | Binary |
|----------|--------|
| TypeScript/JavaScript | `typescript-language-server` |
| Python | `pyright-langserver` |
| Go | `gopls` |
| Rust | `rust-analyzer` |

Check `/scope` for server health when `lsp.probeServersOnStart` is enabled.

## Config (`slim.lsp`)

- `injectPathsSameTurn` — LSP result files enter dep-context on the next context pass (same message batch)
- `steerFromManualSearch` — nudge away from `grep` / line-targeted `read`
- `strictNavigation` — block those tools when LSP is preferred

See `docs/LSP_ADOPTION_PLAN_VI.md` for the full adoption plan.
