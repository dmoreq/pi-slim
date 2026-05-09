/**
 * pi-scope build script — simple ESM transpiler.
 * Strips TypeScript type annotations and outputs .js files to dist/.
 * No external dependencies needed.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'

const SRC = process.cwd()
const OUT = join(SRC, 'dist')

const TS_EXTS = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'tests', '__tests__', '.pi', 'skills', 'scripts'])

/** Simple TS→JS transpilation: strips type annotations and unused imports. */
function transpile(src) {
  let out = src
  
  // Convert import paths: .ts → .js
  out = out.replace(/(from\s+['"])\.(\/.+?)\.ts(['"])/g, '$1.$2.js$3')
  
  out = out
    // Remove type annotations (simplified)
    .replace(/:\s*(?:string|number|boolean|void|any|unknown|never|null|undefined)\b/g, '')
    // Remove type imports
    .replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '\n')
    .replace(/import\s+\{([^}]*)\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, (match, names) => {
      // Keep non-type imports, strip `type` prefix
      const kept = names.split(',').filter(n => !n.trim().startsWith('type ')).join(',')
      return kept.trim() ? match.replace(names, kept) : ''
    })
    // Remove `export type`
    .replace(/export\s+type\s+/g, 'export ')
    // Remove `as Type` casts
    .replace(/\s+as\s+(?:Record|string|number|boolean|any|unknown|never|null|undefined|Map|Set|Array|Promise)\b(?:<[^>]*>)?/g, '')
    .replace(/\s+as\s+\w+/g, '')
    // Strip interface/type declarations (keeping export)
    .replace(/^export\s+interface\s+\w+\s*\{[\s\S]*?\n\}/gm, '')
    .replace(/^interface\s+\w+\s*\{[\s\S]*?\n\}/gm, '')
    .replace(/^export\s+type\s+\w+\s*=.*;/gm, '')
    // Remove : Type annotations in params and return types
    .replace(/(\)\s*):\s*\w+(?:<[^>]*>)?\s*(\{|=>)/g, '$1 $2')
    // Remove generics from function calls/definitions
    .replace(/<[A-Z]\w*(?:\s+extends\s+\w+)?>/g, '')
  
  return out
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, files)
    } else if (TS_EXTS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full)
    }
  }
  return files
}

const tsFiles = walk(SRC)
let count = 0

for (const srcPath of tsFiles) {
  const rel = relative(SRC, srcPath)
  const outPath = join(OUT, rel.replace(/\.tsx?$/, '.js'))
  
  const src = readFileSync(srcPath, 'utf8')
  const js = transpile(src)
  
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, js)
  count++
}

// Generate .d.ts for query-intent (new module)
writeFileSync(join(OUT, 'shared/query-intent.d.ts'),
  '/** Returns true if the query is a broad codebase-introspection question. */\n' +
  'export declare function isBroadCodebaseQuery(text: string): boolean;\n')

console.log(`Built ${count} files to dist/`)
