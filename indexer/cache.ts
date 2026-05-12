import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CacheFile, FileIndex } from '../shared/types.js'
import { CACHE_VERSION } from '../shared/types.js'
import { PathUtils } from '../shared/utils/path-utils.js'

export class DiskCache {
  private readonly cachePath: string
  private entries: Map<string, FileIndex> = new Map()

  constructor(projectRoot: string) {
    this.cachePath = PathUtils.joinSafe(projectRoot, '.pi-cache', 'slim.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, 'utf-8')
      const data: CacheFile = JSON.parse(raw)
      if (data.version !== CACHE_VERSION) {
        console.log(
          `[slim/cache] Cache version mismatch (expected ${CACHE_VERSION}, got ${data.version}), starting fresh`
        )
        this.entries = new Map()
        return
      }
      this.entries = new Map(Object.entries(data.entries))
      console.log(`[slim/cache] Loaded ${this.entries.size} entries from ${this.cachePath}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[slim/cache] Failed to load cache, starting fresh:', err)
      } else {
        console.log('[slim/cache] No existing cache found, starting fresh')
      }
      this.entries = new Map()
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true })
    const data: CacheFile = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(this.entries),
    }
    console.log(`[slim/cache] Persisting ${this.entries.size} entries to ${this.cachePath}`)
    const tmp = `${this.cachePath}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
      await rename(tmp, this.cachePath)
    } catch (err) {
      await unlink(tmp).catch(() => {})
      throw err
    }
  }

  get(path: string): FileIndex | undefined {
    return this.entries.get(path)
  }

  set(index: FileIndex): void {
    this.entries.set(index.path, index)
  }

  delete(path: string): void {
    this.entries.delete(path)
  }
}
