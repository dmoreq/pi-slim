# Contributing

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
git clone <your-fork>
cd pi-scope
npm install
npm run build
```

## Code Style

- TypeScript with strict mode
- ESM (`.js` extensions in imports for NodeNext resolution)
- 2-space indentation
- No semicolons
- JSDoc comments on exported symbols
- Prefer `const` over `let`, `let` over `var`

## Project Structure

```
pi-scope/
├── extension.ts              # Extension entry point (< 100 lines)
├── manager.ts                # SessionManager — all business logic
├── context/                  # Retrieval engine + injection pipeline
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
export class GoParser implements LanguageParser {
  readonly extensions = ['.go']

  parseFile(path: string, content: string): FileIndex {
    // Extract: signatures, imports, exports (symbol names)
    // Return { path, skeleton, imports, exports, contentHash }
  }
}
```

2. Register in `indexer/engine.ts`:

```typescript
import { GoParser } from '../parsers/go-parser.js'
for (const p of [new TypeScriptParser(), new PythonParser(), new RustParser(), new GoParser()]) {
  for (const ext of p.extensions) this.parsers.set(ext, p)
}
```

3. Add import resolution and file extension patterns.

## Adding a Retrieval Signal

To add a new scoring signal (e.g., recency, BM25):

1. Add the data source (e.g., recency from `stats.jsonl`)
2. Add scoring logic in `context/retrieval.ts` `scoreFile()`
3. The formula updates auto-propagate

## Adding a Hashline Edit Operation

1. Add variant to `HashlineEdit` union in `hashline/core.ts`
2. Implement in `applyHashlineEditToLines()`
3. Add sort key in `getHashlineEditSortKey()`
4. Add validation in `validateHashlineEditRefs()`
5. Add schema support in `tools/hashline-editor.ts`

## Adding an LSP Server

1. Add to `SERVERS` in `lsp/service.ts`:
```typescript
java: { command: "jdtls", args: [] },
```
2. Add extension mapping in `lsp/language.ts`

## Testing

```bash
npm test                 # Run all tests (vitest)
npm run test:watch       # Watch mode
npm run build            # Verify compilation
```

Tests mirror source structure. Use `mkdtemp` + `rm` for disk-backed tests.

## Committing

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`

## Release

1. Update version in `package.json`
2. `npm test && npm run build`
3. `git tag v<version> && git push --tags`
4. `npm publish`

## Questions?

Open a [GitHub Issue](https://github.com/dmoreq/pi-scope/issues).
