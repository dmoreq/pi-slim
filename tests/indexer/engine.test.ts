import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexEngine } from '../../indexer/engine.js'
import { saveStore, loadStore } from '../../indexer/index-store.js'
import { produceDefaults } from '../../context/schema.js'

const DEFAULT_CONFIG = produceDefaults()

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-index-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeFixture(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('IndexEngine', () => {
  it('builds skeleton for a TypeScript file', async () => {
    await writeFixture('src/foo.ts', `
export function add(a: number, b: number): number {
  return a + b
}
`)
    const engine = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine.build()
    const index = engine.getRepoIndex()

    const fooPath = join(tmpDir, 'src/foo.ts')
    expect(index.skeletons.has(fooPath)).toBe(true)
    expect(index.skeletons.get(fooPath)).toContain('add')
  })

  it('resolves TypeScript relative imports into dependency edges', async () => {
    await writeFixture('src/foo.ts', `import { bar } from './bar'`)
    await writeFixture('src/bar.ts', `export function bar() {}`)

    const engine = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine.build()
    const index = engine.getRepoIndex()

    const fooPath = join(tmpDir, 'src/foo.ts')
    const barPath = join(tmpDir, 'src/bar.ts')
    expect(index.deps.get(fooPath)?.has(barPath)).toBe(true)
  })

  it('ignores node_modules', async () => {
    await writeFixture('node_modules/pkg/index.ts', `export function x() {}`)
    await writeFixture('src/foo.ts', `export const y = 1`)

    const engine = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine.build()
    const index = engine.getRepoIndex()

    for (const key of index.skeletons.keys()) {
      expect(key).not.toContain('node_modules')
    }
  })

  it('uses cache for unchanged files on second build', async () => {
    await writeFixture('src/foo.ts', `export function foo() {}`)

    const engine1 = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine1.build()

    // Second build — should hit cache
    const engine2 = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine2.build()

    const fooPath = join(tmpDir, 'src/foo.ts')
    expect(engine2.getRepoIndex().skeletons.has(fooPath)).toBe(true)
  })

  it('persists and restores symbolIndex and reverseDeps in store', async () => {
    // Create files with exports and dependencies
    await writeFixture('src/auth.ts', `
export function authenticate(token: string) {
  return { valid: true }
}
export class User {
  constructor(public name: string) {}
}
`)
    
    await writeFixture('src/server.ts', `
import { authenticate, User } from './auth'

export function startServer() {
  console.log('server started')
}
`)

    const engine = new IndexEngine(tmpDir, DEFAULT_CONFIG)
    await engine.build()
    const originalIndex = engine.getRepoIndex()
    
    // Verify original index has symbol data
    expect(originalIndex.symbolIndex.size).toBeGreaterThan(0)
    expect(originalIndex.reverseDeps.size).toBeGreaterThan(0)
    expect(originalIndex.symbolIndex.get('authenticate')).toEqual([expect.stringContaining('auth.ts')])
    expect(originalIndex.symbolIndex.get('User')).toEqual([expect.stringContaining('auth.ts')])
    
    // Save to store
    await saveStore(tmpDir, originalIndex, 'test-repo-map')
    
    // Load from store
    const { index: restoredIndex } = await loadStore(tmpDir)
    
    // Verify symbolIndex is preserved
    expect(restoredIndex.symbolIndex.size).toBe(originalIndex.symbolIndex.size)
    expect(restoredIndex.symbolIndex.get('authenticate')).toEqual(originalIndex.symbolIndex.get('authenticate'))
    expect(restoredIndex.symbolIndex.get('User')).toEqual(originalIndex.symbolIndex.get('User'))
    expect(restoredIndex.symbolIndex.get('startServer')).toEqual(originalIndex.symbolIndex.get('startServer'))
    
    // Verify reverseDeps is preserved  
    expect(restoredIndex.reverseDeps.size).toBe(originalIndex.reverseDeps.size)
    const authPath = Array.from(originalIndex.reverseDeps.keys()).find(k => k.includes('auth.ts'))
    const serverPath = Array.from(originalIndex.skeletons.keys()).find(k => k.includes('server.ts'))
    expect(authPath).toBeDefined()
    expect(serverPath).toBeDefined()
    const authDeps = restoredIndex.reverseDeps.get(authPath!)
    expect(authDeps).toBeDefined()
    expect(authDeps?.has(serverPath!)).toBe(true)
  })
})
