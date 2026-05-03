import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexEngine } from '../../src/indexer/engine.js'
import { produceDefaults } from '../../src/config/schema.js'

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
    expect(index.reverseDeps.get(barPath)?.has(fooPath)).toBe(true)
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
})
