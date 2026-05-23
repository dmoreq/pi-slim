import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DiskCache } from '../../indexer/cache.js'
import type { FileIndex } from '../../types.js'

const SAMPLE: FileIndex = {
  path: '/project/src/foo.ts',
  skeleton: 'export function foo(): void { ... }',
  imports: ['./bar'],
  contentHash: 'abc123',
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-cache-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('DiskCache', () => {
  it('returns undefined for missing entries before load', () => {
    const cache = new DiskCache(tmpDir)
    expect(cache.get('/project/src/foo.ts')).toBeUndefined()
  })

  it('persists entries across save and load', async () => {
    const cache = new DiskCache(tmpDir)
    cache.set(SAMPLE)
    await cache.save()

    const cache2 = new DiskCache(tmpDir)
    await cache2.load()
    expect(cache2.get(SAMPLE.path)).toEqual(SAMPLE)
  })

  it('returns empty cache if file does not exist', async () => {
    const cache = new DiskCache(tmpDir)
    await cache.load()
    expect(cache.get('/nonexistent')).toBeUndefined()
  })

  it('discards cache on version mismatch', async () => {
    const cache = new DiskCache(tmpDir)
    cache.set(SAMPLE)
    await cache.save()

    // Tamper with version
    const { readFile, writeFile } = await import('node:fs/promises')
    const cachePath = join(tmpDir, '.pi', 'pi-scope', 'parser-cache.json')
    const data = JSON.parse(await readFile(cachePath, 'utf-8'))
    data.version = 999
    await writeFile(cachePath, JSON.stringify(data))

    const cache2 = new DiskCache(tmpDir)
    await cache2.load()
    expect(cache2.get(SAMPLE.path)).toBeUndefined()
  })

  it('recovers gracefully from corrupt JSON', async () => {
    const cache = new DiskCache(tmpDir)
    cache.set(SAMPLE)
    await cache.save()

    const { writeFile } = await import('node:fs/promises')
    const cachePath = join(tmpDir, '.pi', 'pi-scope', 'parser-cache.json')
    await writeFile(cachePath, '{ this is not valid json !!!', 'utf-8')

    const cache2 = new DiskCache(tmpDir)
    await cache2.load()
    expect(cache2.get(SAMPLE.path)).toBeUndefined()
  })

  it('deletes entries', async () => {
    const cache = new DiskCache(tmpDir)
    cache.set(SAMPLE)
    cache.delete(SAMPLE.path)
    await cache.save()

    const cache2 = new DiskCache(tmpDir)
    await cache2.load()
    expect(cache2.get(SAMPLE.path)).toBeUndefined()
  })
})
