/**
 * Persists the generated RepoIndex and repo map to .pi/pi-scope/ inside
 * the project root so they survive across sessions.
 *
 * Layout:
 *   .pi/pi-scope/
 *     repo-map.txt      — the <repo-map>…</repo-map> string
 *     index.json.gz     — gzip-compressed skeletons + dep graph + metadata
 *
 * Supports both:
 * - StoredIndexV2 (new: rich metadata, graph data, checksums)
 * - StoredIndexV3 (old: minimal, auto-migrated to v2)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import { scopeDir } from '../shared/paths.js'
import type { StoredIndexV2 } from '../shared/schema-v2.js'
import { STORE_VERSION_V2, migrateToV2 } from '../shared/schema-v2.js'
import type { RepoIndex } from '../shared/types.js'
import { PathUtils } from '../shared/utils/path-utils.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// Support both v2 (new) and v3 (old for backwards compatibility)
const STORE_VERSION = STORE_VERSION_V2 // 2
const LEGACY_STORE_VERSION = 3 // old version, will be migrated

// Old interface (v3) - kept for reading legacy stores
interface StoredIndexV3 {
  version: number
  builtAt: string
  projectRoot: string
  fileCount: number
  skeletons: Record<string, string>
  deps: Record<string, string[]>
  reverseDeps: Record<string, string[]>
  symbolIndex: Record<string, string[]>
}

type StoredIndex = StoredIndexV2 | StoredIndexV3

function storeDir(projectRoot: string): string {
  return scopeDir(projectRoot)
}

function indexPath(projectRoot: string): string {
  return PathUtils.joinSafe(storeDir(projectRoot), 'index.json.gz')
}

function mapPath(projectRoot: string): string {
  return PathUtils.joinSafe(storeDir(projectRoot), 'repo-map.txt')
}

/** Returns true if both persisted files exist. */
export async function storeExists(projectRoot: string): Promise<boolean> {
  try {
    await readFile(indexPath(projectRoot))
    await readFile(mapPath(projectRoot))
    return true
  } catch {
    return false
  }
}

/**
 * Serialize, gzip-compress, and write RepoIndex + repo map to .pi/pi-scope/.
 *
 * Saves as StoredIndexV2 (new format) with rich metadata.
 */
export async function saveStore(
  projectRoot: string,
  index: RepoIndex,
  repoMap: string,
  metadata?: {
    buildDuration?: number
    gitCommit?: string
    gitBranch?: string
    languages?: Record<string, { fileCount: number; symbolCount: number; edgeCount: number }>
    config?: { scanPatterns: string[]; ignorePatterns: string[]; languages: string[] }
    graph?: any
  }
): Promise<void> {
  await mkdir(storeDir(projectRoot), { recursive: true })

  const skeletons: Record<string, string> = {}
  for (const [k, v] of index.skeletons) skeletons[k] = v

  const deps: Record<string, string[]> = {}
  for (const [k, v] of index.deps) deps[k] = [...v]

  const reverseDeps: Record<string, string[]> = {}
  for (const [k, v] of index.reverseDeps) reverseDeps[k] = [...v]

  const symbolIndex: Record<string, string[]> = {}
  for (const [k, v] of index.symbolIndex) symbolIndex[k] = [...v]

  // Calculate stats
  const edgeCount = [...index.deps.values()].reduce((s, v) => s + v.size, 0)
  const symbolCount = [...index.symbolIndex.values()].reduce((s, v) => s + v.length, 0)

  const stored: StoredIndexV2 = {
    version: STORE_VERSION,
    schemaVersion: '2.0',
    builtAt: new Date().toISOString(),
    builtIn: metadata?.buildDuration ?? 0,
    buildMode: 'fresh',
    projectRoot,
    projectName: projectRoot.split('/').pop() || 'unknown',
    gitCommit: metadata?.gitCommit,
    gitBranch: metadata?.gitBranch,
    fileCount: index.skeletons.size,
    symbolCount,
    edgeCount,
    languages: metadata?.languages ?? {},
    config: metadata?.config ?? {
      scanPatterns: ['src/**', 'lib/**'],
      ignorePatterns: ['node_modules', 'dist', '.git'],
      languages: ['typescript'],
    },
    skeletons,
    deps,
    reverseDeps,
    symbolIndex,
    checksums: {
      files: {},
      timestamp: Date.now(),
    },
    ...(metadata?.graph && { graph: metadata.graph }),
  }

  const json = JSON.stringify(stored)
  const rawSize = Buffer.byteLength(json, 'utf-8')
  const compressed = await gzipAsync(json)
  console.log(
    `[scope/store] Persisting index v2 → ${indexPath(projectRoot)} (${rawSize} → ${compressed.length} bytes, ${Math.round((1 - compressed.length / rawSize) * 100)}% compressed)`
  )

  await Promise.all([writeFile(indexPath(projectRoot), compressed), writeFile(mapPath(projectRoot), repoMap, 'utf-8')])
}

/** Load, gunzip-decompress, and deserialize RepoIndex + repo map from .pi/pi-scope/. */
export async function loadStore(
  projectRoot: string
): Promise<{ index: RepoIndex; repoMap: string; builtAt: string; fileCount: number; metadata?: any }> {
  const [compressed, repoMap] = await Promise.all([
    readFile(indexPath(projectRoot)),
    readFile(mapPath(projectRoot), 'utf-8'),
  ])

  console.log(`[scope/store] Loading index from ${indexPath(projectRoot)} (${compressed.length} bytes compressed)`)
  const raw = await gunzipAsync(compressed)
  const stored: StoredIndex = JSON.parse(raw.toString('utf-8'))

  // Auto-migrate v3 → v2
  let index: StoredIndexV2
  if (stored.version === LEGACY_STORE_VERSION) {
    console.log('[scope/store] Detected legacy v3 index, migrating to v2...')
    index = migrateToV2(stored)
  } else if (stored.version === STORE_VERSION) {
    index = stored as StoredIndexV2
  } else {
    throw new Error(
      `Store version mismatch: expected ${STORE_VERSION} or ${LEGACY_STORE_VERSION}, got ${stored.version}`
    )
  }

  const skeletons = new Map<string, string>(Object.entries(index.skeletons))
  const deps = new Map<string, Set<string>>(Object.entries(index.deps).map(([k, v]) => [k, new Set(v)]))
  const reverseDeps = new Map<string, Set<string>>(Object.entries(index.reverseDeps).map(([k, v]) => [k, new Set(v)]))
  const symbolIndex = new Map<string, string[]>(Object.entries(index.symbolIndex))

  console.log(
    `[scope/store] Loaded ${skeletons.size} skeletons, ${deps.size} dep nodes, ${reverseDeps.size} reverse deps, ${symbolIndex.size} symbols`
  )

  return {
    index: { skeletons, deps, reverseDeps, symbolIndex },
    repoMap,
    builtAt: index.builtAt,
    fileCount: index.fileCount,
    metadata: {
      version: index.version,
      symbolCount: index.symbolCount,
      edgeCount: index.edgeCount,
      languages: index.languages,
      gitCommit: index.gitCommit,
      gitBranch: index.gitBranch,
      buildDuration: index.builtIn,
      godNodes: index.graph?.godNodes,
      communities: index.graph?.communities,
    },
  }
}
