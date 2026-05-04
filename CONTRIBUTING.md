# Contributing

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
git clone <your-fork>
cd pi-slim
npm install
npm run build
```

## Code Style

- TypeScript with strict mode
- ESM (`.js` extensions in imports for NodeNext resolution)
- 2-space indentation
- No semicolons (consistent with pi ecosystem)
- JSDoc comments on all exported symbols
- Prefer `const` over `let`, `let` over `var`

## Project Structure

```
pi-slim/
├── extension.ts              # Extension entry point (< 100 lines)
├── manager.ts                # SessionManager — all business logic
├── context/                  # LLM context injection pipeline
├── hashline/                 # Pure hashline edit modules
├── lsp/                      # LSP client, launcher, service
├── indexer/                  # Index engine, cache, store
├── parsers/                  # Language-specific AST parsers
├── plugins/                  # Plugin interface + built-in plugins
├── tools/                    # Pi tool definitions
├── metrics/                  # Session stats + cost estimation
├── shared/                   # Shared utilities
├── ui/                       # TUI notifications
└── tests/                    # Test suite (mirrors source structure)
```

## Adding a Language Parser

1. Create `parsers/<lang>-parser.ts` implementing `LanguageParser`:

```typescript
import type { LanguageParser } from './language-parser.js'

export class GoParser implements LanguageParser {
  readonly extensions = ['.go']

  parseFile(path: string, content: string): FileIndex {
    // Use tree-sitter to extract:
    //   - signatures (function headers, type definitions)
    //   - imports (relative/local imports)
    // Return FileIndex with skeleton + imports + contentHash
  }
}
```

2. Register it in `indexer/engine.ts`:

```typescript
import { GoParser } from '../parsers/go-parser.js'
// In IndexEngine constructor:
for (const p of [new TypeScriptParser(), new PythonParser(), new RustParser(), new GoParser()]) {
  for (const ext of p.extensions) this.parsers.set(ext, p)
}
```

3. Add import resolution in `resolveImport()` in `engine.ts`.
4. Add file extension to `FILE_PATH_RE` in `context/dep-context.ts`.
5. Add tests in `tests/parsers/<lang>-parser.test.ts`.

## Adding a Hashline Edit Operation

Hashline edit operations are defined in `hashline/core.ts` as a union type:

```typescript
export type HashlineEdit =
  | { op: "replace_line"; pos: Anchor; lines: string[] }
  | { op: "replace_range"; pos: Anchor; end: Anchor; lines: string[] }
  | { op: "append_at"; pos: Anchor; lines: string[] }
  | { op: "prepend_at"; pos: Anchor; lines: string[] }
  | { op: "append_file"; lines: string[] }
  | { op: "prepend_file"; lines: string[] };
```

To add a new operation:

1. Add a new variant to the `HashlineEdit` union type in `hashline/core.ts`
2. Implement the apply logic in `applyHashlineEditToLines()` in the same file
3. Add a sort key in `getHashlineEditSortKey()`
4. Add the anchor validation in `validateHashlineEditRefs()`
5. Add tool schema support in `tools/hashline-editor.ts` `resolveEdit()` helper
6. Add tests in `tests/hashline/core.test.ts`

## Adding an LSP Server Definition

LSP server definitions are in `lsp/service.ts`:

```typescript
const SERVERS: Record<string, ServerDef> = {
  // Add your language server here:
  java: { command: "jdtls", args: [] },
};
```

1. Add the server binary name and arguments
2. Add the file extension mapping in `lsp/language.ts`:

```typescript
'.java': 'java',
```

3. Add tests if possible (integration tests with mocked servers)

## Testing

```bash
npm test                 # Run all tests (vitest)
npm run test:watch       # Watch mode
npm run build            # Verify TypeScript compilation
```

Tests live in `tests/` mirroring the source tree structure. Use Vitest with temporary file fixtures for disk-dependent tests.

### Test conventions

- Use `mkdtemp` + `rm` for disk-backed tests
- Use `beforeEach`/`afterEach` for setup/teardown
- Test public API, not private implementation details
- One `describe` block per module, one `it` per behavior

## Committing

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change without feature/bug
- `docs:` — documentation only
- `test:` — test-only changes
- `chore:` — build/config changes

## Release Process

1. Update version in `package.json`
2. Run full test suite (`npm test`)
3. Run build (`npm run build`)
4. Publish: `npm publish`
5. Tag: `git tag v<version> && git push --tags`

## Questions?

Open a [GitHub Issue](https://github.com/dmoreq/pi-slim/issues).
