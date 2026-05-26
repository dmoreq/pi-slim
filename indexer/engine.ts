import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, relative, resolve } from 'node:path'
import { PathUtils } from '../shared/utils/path-utils.js'

// CJS `export = fn` doesn't unwrap under NodeNext + esModuleInterop; use createRequire instead
const _require = createRequire(import.meta.url)
type IgnoreInstance = { add(p: string | string[]): IgnoreInstance; ignores(p: string): boolean }
const ignore: () => IgnoreInstance = _require('ignore')
import type { LanguageParser } from '../parsers/language-parser.js'
import { PythonParser } from '../parsers/python-parser.js'
import { RustParser } from '../parsers/rust-parser.js'
import { TypeScriptParser } from '../parsers/typescript-parser.js'
import type { FileIndex, RepoIndex, SlimConfig } from '../shared/types.js'
import { DiskCache } from './cache.js'

const DEFAULT_IGNORES = ['node_modules', '.git', '.pi-cache', 'dist', 'build']

function buildIgnore(projectRoot: string, extraExcludes: string[] = []) {
  const ig = ignore()
  ig.add(DEFAULT_IGNORES)
  if (extraExcludes.length) ig.add(extraExcludes)
  try {
    const gitignore = readFileSync(PathUtils.joinSafe(projectRoot, '.gitignore'), 'utf-8')
    ig.add(gitignore)
  } catch {
    /* no .gitignore */
  }
  return ig
}

async function* walkDir(dir: string, root: string, ig: IgnoreInstance): AsyncGenerator<string> {
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[]
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as unknown as {
      name: string
      isDirectory(): boolean
      isFile(): boolean
    }[]
  } catch (err) {
    console.warn(`[IndexEngine] Cannot read directory ${dir}:`, err)
    return
  }

  for (const entry of entries) {
    const full = PathUtils.joinSafe(dir, entry.name)
    const rel = relative(root, full)
    if (ig.ignores(rel)) continue
    if (entry.isDirectory()) {
      yield* walkDir(full, root, ig)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

function resolveImport(raw: string, fromFile: string, ext: string): string | null {
  if (ext === '.ts' || ext === '.tsx') {
    if (!raw.startsWith('.') && !raw.startsWith('/')) return null
    const base = resolve(dirname(fromFile), raw)
    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      PathUtils.joinSafe(base, 'index.ts'),
      PathUtils.joinSafe(base, 'index.tsx'),
      base,
    ]) {
      if (PathUtils.existsSync(candidate)) return candidate
    }
    return null
  }

  if (ext === '.py') {
    if (!raw.startsWith('.')) return null
    const dots = raw.match(/^\.+/)?.[0].length ?? 0
    const module = raw.slice(dots).replace(/\./g, '/')
    let dir = dirname(fromFile)
    for (let i = 1; i < dots; i++) dir = dirname(dir)
    const candidate = PathUtils.joinSafe(dir, `${module}.py`)
    return PathUtils.existsSync(candidate) ? candidate : null
  }

  if (ext === '.rs') {
    if (raw.startsWith('mod:')) {
      const name = raw.slice(4)
      const sibling = PathUtils.joinSafe(dirname(fromFile), `${name}.rs`)
      const modFile = PathUtils.joinSafe(dirname(fromFile), name, 'mod.rs')
      if (PathUtils.existsSync(sibling)) return sibling
      if (PathUtils.existsSync(modFile)) return modFile
      return null
    }
    if (raw.startsWith('crate::') || raw.startsWith('super::')) {
      const parts = raw.replace(/^(crate|super)::/, '').split('::')
      const candidate = `${PathUtils.joinSafe(dirname(fromFile), ...parts)}.rs`
      return PathUtils.existsSync(candidate) ? candidate : null
    }
    return null
  }

  return null
}

export class IndexEngine {
  private readonly projectRoot: string
  private readonly config: SlimConfig
  private readonly parsers: Map<string, LanguageParser> = new Map()
  private readonly cache: DiskCache
  private repoIndex: RepoIndex = {
    skeletons: new Map(),
    deps: new Map(),
    reverseDeps: new Map(),
    symbolIndex: new Map(),
  }

  constructor(projectRoot: string, config: SlimConfig) {
    this.projectRoot = projectRoot
    this.config = config
    this.cache = new DiskCache(projectRoot)

    for (const p of [new TypeScriptParser(), new PythonParser(), new RustParser()]) {
      for (const ext of p.extensions) this.parsers.set(ext, p)
    }
  }

  async build(): Promise<void> {
    await this.cache.load()
    const ig = buildIgnore(this.projectRoot, [...this.config.exclude])
    const fileIndexes: FileIndex[] = []

    for await (const filePath of walkDir(this.projectRoot, this.projectRoot, ig)) {
      const ext = extname(filePath)
      const parser = this.parsers.get(ext)
      if (!parser) continue

      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch (err) {
        console.warn(`[IndexEngine] Cannot read file ${filePath}:`, err)
        continue
      }
      const hash = createHash('sha256').update(content).digest('hex')
      const cached = this.cache.get(filePath)

      if (cached && cached.contentHash === hash) {
        fileIndexes.push(cached)
      } else {
        try {
          const index = parser.parseFile(filePath, content)
          this.cache.set(index)
          fileIndexes.push(index)
        } catch (err) {
          // During active editing a file may be transiently invalid; keep the last
          // known-good parse for that file so a single failure does not abort reindexing.
          if (cached) {
            console.warn(`[IndexEngine] Parser failed for ${filePath}, reusing cached index entry:`, err)
            fileIndexes.push(cached)
          } else {
            console.warn(`[IndexEngine] Parser failed for ${filePath}, skipping file:`, err)
          }
        }
      }
    }

    await this.cache.save()
    this.repoIndex = this.buildGraph(fileIndexes)
  }

  private buildGraph(files: FileIndex[]): RepoIndex {
    const skeletons = new Map<string, string>()
    const deps = new Map<string, Set<string>>()

    for (const f of files) {
      skeletons.set(f.path, f.skeleton)
      deps.set(f.path, new Set())
    }

    // Forward deps + reverse deps
    const reverseDeps = new Map<string, Set<string>>()
    for (const f of files) {
      const ext = extname(f.path)
      for (const raw of f.imports) {
        const resolved = resolveImport(raw, f.path, ext)
        if (resolved && skeletons.has(resolved)) {
          deps.get(f.path)?.add(resolved)
          if (!reverseDeps.has(resolved)) reverseDeps.set(resolved, new Set())
          reverseDeps.get(resolved)?.add(f.path)
        }
      }
    }

    // Build symbol index: symbol => files[]
    const symbolIndex = new Map<string, string[]>()
    for (const f of files) {
      for (const sym of f.exports) {
        if (!symbolIndex.has(sym)) symbolIndex.set(sym, [])
        symbolIndex.get(sym)?.push(f.path)
      }
    }

    return { skeletons, deps, reverseDeps, symbolIndex }
  }

  getRepoIndex(): RepoIndex {
    return this.repoIndex
  }
}
