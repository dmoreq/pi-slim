---
name: pi-scope-parsers
description: Use when working with TypeScript, Python, or Rust AST parsing; adding new language support via the LanguageParser interface; or understanding how skeleton extraction and import resolution work
---

# pi-scope Multi-Language Parsers

## Prerequisites

Parsers require tree-sitter language packages (auto-installed with pi-scope):
```bash
# Already installed. Verify with:
npm ls tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-rust 2>/dev/null | head -3
```

**Adding a new language** requires writing a parser file and adding its tree-sitter npm package as a dependency.

## How Parsing Works

Each language is parsed via **tree-sitter**. Files are:

1. **Walked** — recursive directory scan respecting `.gitignore` + `exclude` patterns
2. **Parsed** — each file is parsed into a tree-sitter CST
3. **Extracted** — function/class/type signatures become the **skeleton** (~8-15% of full file size)
4. **Indexed** — exported symbols → symbol index, imports → dep graph

## LanguageParser Interface

`parsers/language-parser.ts`:

```typescript
interface LanguageParser {
  readonly extensions: string[];  // File extensions this parser handles
  parseFile(path: string, content: string): FileIndex;
}
```

`FileIndex` shape (`shared/types.ts`):

```typescript
interface FileIndex {
  path: string;
  skeleton: string;      // AST signatures only
  imports: string[];     // Raw import strings
  exports: string[];     // Exported symbol names
  contentHash: string;   // SHA-256 for cache invalidation
}
```

## Supported Languages

### TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`)

**Skeleton extraction:** `function_declaration`, `class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `abstract_class_declaration`, `function_signature`, `method_signature`

Body blocks (`{ ... }`) are truncated to `{ ... }` — only the signature survives.

**Import resolution:** Standard relative `./foo`, `../bar` and folder index (`./lib` → `./lib/index.ts`/`.tsx`).

**Parser:** `typescript` grammar for `.ts`, `tsx` grammar for `.tsx` (tree-sitter-typescript).

### Python (`.py`, `.pyi`)

**Skeleton extraction:** `function_definition` (signature + `...` body), `class_definition` (class header + method stubs with indentation).

**Import resolution:** Relative imports using dot-count parent walking. `from .module import x` resolves by traversing up N directories for N dots.

**Parser:** tree-sitter-python.

### Rust (`.rs`)

**Skeleton extraction:** `fn`, `struct`, `enum`, `trait`, `impl` blocks. Methods inside `impl` blocks are preserved with `impl` context.

**Import resolution:** `mod x;` → sibling `x.rs` or `x/mod.rs`; `crate::` → project root; `super::` → parent directory.

**Parser:** tree-sitter-rust.

## Adding a New Language

1. Create `parsers/<lang>-parser.ts` implementing `LanguageParser`
2. Set `extensions` to the file extensions your parser handles
3. Implement `parseFile()` using tree-sitter (install the grammar)
4. Register in `indexer/engine.ts` constructor:

```typescript
constructor(projectRoot, config) {
  // ...
  for (const p of [new TypeScriptParser(), new PythonParser(), new RustParser(), new YourParser()]) {
    for (const ext of p.extensions) this.parsers.set(ext, p);
  }
}
```

5. Add import resolution logic in `resolveImport()` in `indexer/engine.ts`
6. (Optional) Add LSP support in `lsp/language.ts` and `lsp/service.ts`

## Cache Behavior

- **SHA-256 content hash** — unchanged files are not re-parsed
- **DiskCache** at `.pi-cache/slim.json` — persists between sessions
- **Cache version** (`CACHE_VERSION = 1`) — stale caches are invalidated automatically
- **IndexStore** at `.pi/scope/index.json.gz` — gzip-compressed for fast load
