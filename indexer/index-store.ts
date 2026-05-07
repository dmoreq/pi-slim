/**
 * Persists the generated RepoIndex and repo map to .pi/slim/ inside
 * the project root so they survive across sessions.
 *
 * Layout:
 *   .pi/slim/
 *     repo-map.txt      — the <repo-map>…</repo-map> string
 *     index.json.gz     — gzip-compressed skeletons + dep graph + metadata
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gzip, gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { slimDir } from '../shared/paths.js'
import type { RepoIndex } from '../shared/types.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const STORE_VERSION = 3

interface StoredIndex {
  version: number
  builtAt: string
  projectRoot: string
  fileCount: number
  skeletons: Record<string, string>
  deps: Record<string, string[]>
  reverseDeps: Record<string, string[]>
  symbolIndex: Record<string, string[]>
}

function storeDir(projectRoot: string): string {
  return slimDir(projectRoot)
}

function indexPath(projectRoot: string): string {
  return join(storeDir(projectRoot), 'index.json.gz')
}

function mapPath(projectRoot: string): string {
  return join(storeDir(projectRoot), 'repo-map.txt')
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

/** Serialize, gzip-compress, and write RepoIndex + repo map to .pi/slim/. */
export async function saveStore(
  projectRoot: string,
  index: RepoIndex,
  repoMap: string,
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

  const stored: StoredIndex = {
    version: STORE_VERSION,
    builtAt: new Date().toISOString(),
    projectRoot,
    fileCount: index.skeletons.size,
    skeletons,
    deps,
    reverseDeps,
    symbolIndex,
  }

  const json = JSON.stringify(stored)
  const rawSize = Buffer.byteLength(json, 'utf-8')
  const compressed = await gzipAsync(json)
  console.log(`[slim/store] Persisting index → ${indexPath(projectRoot)} (${rawSize} → ${compressed.length} bytes, ${Math.round((1 - compressed.length / rawSize) * 100)}% compressed)`)

  await Promise.all([
    writeFile(indexPath(projectRoot), compressed),
    writeFile(mapPath(projectRoot), repoMap, 'utf-8'),
  ])
}

/** Load, gunzip-decompress, and deserialize RepoIndex + repo map from .pi/slim/. */
export async function loadStore(
  projectRoot: string,
): Promise<{ index: RepoIndex; repoMap: string; builtAt: string; fileCount: number }> {
  const [compressed, repoMap] = await Promise.all([
    readFile(indexPath(projectRoot)),
    readFile(mapPath(projectRoot), 'utf-8'),
  ])

  console.log(`[slim/store] Loading index from ${indexPath(projectRoot)} (${compressed.length} bytes compressed)`)
  const raw = await gunzipAsync(compressed)
  const stored: StoredIndex = JSON.parse(raw.toString('utf-8'))

  if (stored.version !== STORE_VERSION) {
    throw new Error(`Store version mismatch: expected ${STORE_VERSION}, got ${stored.version}`)
  }

  const skeletons = new Map<string, string>(Object.entries(stored.skeletons))
  const deps = new Map<string, Set<string>>(
    Object.entries(stored.deps).map(([k, v]) => [k, new Set(v)]),
  )
  const reverseDeps = new Map<string, Set<string>>(
    Object.entries(stored.reverseDeps).map(([k, v]) => [k, new Set(v)]),
  )
  const symbolIndex = new Map<string, string[]>(Object.entries(stored.symbolIndex))

  console.log(`[slim/store] Loaded ${skeletons.size} skeletons, ${deps.size} dep nodes, ${reverseDeps.size} reverse deps, ${symbolIndex.size} symbols`)

  return {
    index: { skeletons, deps, reverseDeps, symbolIndex },
    repoMap,
    builtAt: stored.builtAt,
    fileCount: stored.fileCount,
  }
}
