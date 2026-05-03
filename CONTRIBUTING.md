# Contributing

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
git clone <your-fork>
cd pi-smart-context
npm install --legacy-peer-deps
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
src/
├── extension.ts          # Lifecycle wiring (< 100 lines)
├── manager.ts            # All business logic
├── types.ts              # Core shared types
├── paths.ts              # Path constants
├── config/               # Schema + loader
├── indexer/              # Index engine, cache, store
├── injectors/            # Pipeline, repo-map, dep-context, etc.
├── detect/               # File path detection
├── metrics/              # Stats tracking, cost estimator
├── persistence/          # Runtime state file I/O
├── ui/                   # TUI notifications
├── utils/                # Shared utilities (token, message)
└── parsers/              # Language-specific AST parsers
```

## Adding a Language Parser

1. Create `src/parsers/<lang>-parser.ts` implementing `LanguageParser`:

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

2. Register it in `src/indexer/engine.ts`:

```typescript
import { GoParser } from '../parsers/go-parser.js'

// In IndexEngine constructor:
for (const p of [new TypeScriptParser(), new PythonParser(), new RustParser(), new GoParser()]) {
  for (const ext of p.extensions) this.parsers.set(ext, p)
}
```

3. Add import resolution in `resolveImport()` in `engine.ts`.
4. Add file extension to `FILE_PATH_RE` in `injectors/dep-context.ts`.
5. Add tests in `tests/parsers/<lang>-parser.test.ts`.
6. Update the language support matrix in `docs/usage.md`.

## Adding an Injection Source

1. Add a pipeline source in `manager.ts` `handleBeforeAgentStart()`.
2. Add a handler in `INJECTION_HANDLERS` registry (no switch statement needed).
3. Add stats tracking fields in `metrics/tracker.ts`.
4. Update the schema defaults in `config/schema.ts` if configurable.
5. Add tests.

## Testing

```bash
npm test                 # Run all tests (vitest)
npm run test:watch       # Watch mode for development
npm run build            # Verify TypeScript compilation
```

Tests live in `tests/` mirroring the `src/` structure. Use Vitest with temporary file fixtures for disk-dependent tests.

### Test conventions

- Use `mkdtemp` + `rm` for disk-backed tests
- Use `beforeEach`/`afterEach` for setup/teardown
- Test public API, not private implementation details
- One `describe` block per module, one `it` per behavior

## Committing

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change that doesn't add feature or fix bug
- `docs:` — documentation only
- `test:` — test-only changes
- `chore:` — build/config changes

## Release Process

1. Update version in `package.json`
2. Run full test suite
3. Run build
4. Publish: `npm publish`
5. Tag: `git tag v<version> && git push --tags`

## Questions?

Open a [GitHub Issue](https://github.com/dmoreq/pi-smart-context/issues).
