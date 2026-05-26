/**
 * IndexService — owns the index lifecycle: build, cache, load, freshness.
 *
 * SRP: Only responsible for creating and managing the RepoIndex.
 * All other concerns (context, graph, telemetry) belong in other services.
 */

import { RepoMapGenerator } from '../context/repo-map.js'
import { IndexEngine } from '../indexer/engine.js'
import { checkIndexFreshness, type StalenessResult } from '../indexer/freshness.js'
import { loadStore, saveStore, storeExists } from '../indexer/index-store.js'
import { collectMetadata } from '../indexer/metadata.js'
import { type IndexMetadata, extractMetadata } from '../shared/schema-v2.js'
import type { RepoIndex, SlimConfig } from '../shared/types.js'

export interface IndexResult {
  index: RepoIndex
  repoMap: string
  metadata: IndexMetadata
  builtAt: number
  fileCount: number
  buildTimeMs: number
}

export interface CacheLoadResult {
  loaded: boolean
  stale?: StalenessResult
}

export class IndexService {
  private _index: RepoIndex | null = null
  private _repoMap: string | null = null
  private _metadata: IndexMetadata | null = null

  get index(): RepoIndex | null {
    return this._index
  }
  get repoMap(): string | null {
    return this._repoMap
  }
  get metadata(): IndexMetadata | null {
    return this._metadata
  }

  /**
   * Try loading index from cache. Returns true if cache hit.
   */
  async loadFromCache(projectRoot: string): Promise<boolean> {
    if (!(await storeExists(projectRoot))) return false
    try {
      const result = await loadStore(projectRoot)
      this._index = result.index
      this._repoMap = result.repoMap
      this._metadata = extractMetadata(result.storedIndex)
      return true
    } catch {
      return false
    }
  }

  /**
   * Load cache only if it passes freshness validation.
   */
  async loadFromCacheIfFresh(
    projectRoot: string,
    options?: { maxAgeHours?: number; checkGit?: boolean; checkFiles?: boolean }
  ): Promise<CacheLoadResult> {
    if (!(await storeExists(projectRoot))) return { loaded: false }
    try {
      const result = await loadStore(projectRoot)
      const stale = await checkIndexFreshness(projectRoot, result.storedIndex, options)
      if (stale.stale) return { loaded: false, stale }
      this._index = result.index
      this._repoMap = result.repoMap
      this._metadata = extractMetadata(result.storedIndex)
      return { loaded: true }
    } catch {
      return { loaded: false }
    }
  }

  /**
   * Build fresh index from scratch.
   */
  async buildFresh(projectRoot: string, config: SlimConfig): Promise<IndexResult> {
    const engine = new IndexEngine(projectRoot, config)
    const buildStartTime = Date.now()

    await engine.build()
    const index = engine.getRepoIndex()

    const repoMap = new RepoMapGenerator(projectRoot, config.maxRepoMapTokens).generate(index)
    const rawMetadata = collectMetadata(projectRoot, index, config, buildStartTime) as any

    // Save to cache
    const stored = await saveStore(projectRoot, index, repoMap, rawMetadata)

    this._index = index
    this._repoMap = repoMap
    this._metadata = extractMetadata(stored)

    return {
      index,
      repoMap,
      metadata: this._metadata!,
      builtAt: buildStartTime,
      fileCount: index.skeletons.size,
      buildTimeMs: Date.now() - buildStartTime,
    }
  }
}
