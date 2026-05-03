# Adoption Plan: LSP Navigation Tool from pi-lens

## Overview

Adopt the `lsp_navigation` tool from [pi-lens](https://github.com/apmantza/pi-lens) into pi-slim.
pi-lens is a comprehensive real-time code feedback extension (LSP, linters, formatters, type-checking, etc.)
for pi. pi-slim currently provides AST-indexed project context. Adding LSP navigation gives pi agents
code intelligence: go-to-definition, find references, hover info, and more.

## Comparison Matrix

| Feature | pi-lens (source) | pi-slim (target) |
|---|---|---|
| LSP navigation tool | `tools/lsp-navigation.ts` (~25KB) | Adopt with slimmed dependencies |
| LSP service layer | `clients/lsp/index.ts` (~31KB) | Adopt with simplified server definitions |
| LSP client (JSON-RPC) | `clients/lsp/client.ts` (~38KB) | Adopt with reduced scope |
| LSP server definitions | `clients/lsp/server.ts` (~44KB, 37 servers) | Adopt only 4 core servers (TS, Python, Go, Rust) |
| Server launching | `clients/lsp/launch.ts` (~25KB) | Adopt without Windows/host-specific complexity |
| Language mappings | `clients/lsp/language.ts` (~3.3KB) | Adopt as-is |
| Config | `clients/lsp/config.ts` (~5.7KB) | Adopt simplified |
| Path utils | `clients/path-utils.ts` (~4.5KB) | Adopt (needed for cross-platform path handling) |
| Latency logger | `clients/latency-logger.ts` (~2KB) | Skip (pi-slim doesn't need latency logging) |

## Strategy

- **Unique to pi-lens** → Adopt with scoping (only 4 core languages, binary-only launch)
- **pi-lens better** → Adopt LSP client and service as-is, scope server definitions
- **Simplify** → Drop installer, interactive install, cascade diagnostics, latency logging

## Implementation Steps

1. Add npm dependencies: `typebox`, `vscode-jsonrpc`
2. Copy `clients/path-utils.ts` → `lsp/path-utils.ts`
3. Copy `clients/lsp/language.ts` → `lsp/language.ts`
4. Copy `clients/lsp/launch.ts` → `lsp/launch.ts` (simplified — drop installer references)
5. Create `lsp/server.ts` (scoped — only TypeScript, Python, Go, Rust + built-in fallbacks)
6. Copy `clients/lsp/config.ts` → `lsp/config.ts` (simplified)
7. Copy `clients/lsp/client.ts` → `lsp/client.ts` (ship same JSON-RPC client)
8. Copy `clients/lsp/index.ts` → `lsp/index.ts` (LSPService — drop cascade/installer)
9. Copy `tools/lsp-navigation.ts` → `tools/lsp-navigation.ts` (minimal path adjustments)
10. Register tool and flag in `extension.ts`
11. Add tests
12. Verify build and tests pass

## Dependencies Added

- `typebox` — JSON schema generation for tool parameters
- `vscode-jsonrpc` — LSP JSON-RPC communication

## Tests Needed

- `tests/lsp/navigation.test.ts` — tool execution with mocked LSP
- `tests/lsp/client.test.ts` — LSP client init/shutdown
- `tests/lsp/service.test.ts` — LSPService lifecycle
