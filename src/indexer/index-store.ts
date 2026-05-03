/**
 * Persists the generated RepoIndex and repo map to .pi/smart-context/ inside
 * the project root so they survive across sessions.
 *
 * Layout:
 *   .pi/smart-context/
 *     repo-map.txt   — the <repo-map>…</repo-map> string
 *     index.json     — serialised skeletons + dep graph + metadata
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { smartContextDir } from '../paths.js'
import type { RepoIndex } from '../types.js'

const STORE_VERSION = 1

interface StoredIndex {
  version: number
  builtAt: string
  projectRoot: string
  fileCount: number
  skeletons: Record<string, string>
  deps: Record<string, string[]>
  reverseDeps: Record<string, string[]>
}

function storeDir(projectRoot: string): string {
  return smartContextDir(projectRoot)
}

function indexPath(projectRoot: string): string {
  return join(storeDir(projectRoot), 'index.json')
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

/** Serialize and write RepoIndex + repo map to .pi/smart-context/. */
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

  const stored: StoredIndex = {
    version: STORE_VERSION,
    builtAt: new Date().toISOString(),
    projectRoot,
    fileCount: index.skeletons.size,
    skeletons,
    deps,
    reverseDeps,
  }

  await Promise.all([
    writeFile(indexPath(projectRoot), JSON.stringify(stored, null, 2), 'utf-8'),
    writeFile(mapPath(projectRoot), repoMap, 'utf-8'),
  ])
}

/** Load and deserialize RepoIndex + repo map from .pi/smart-context/. */
export async function loadStore(
  projectRoot: string,
): Promise<{ index: RepoIndex; repoMap: string; builtAt: string; fileCount: number }> {
  const [rawIndex, repoMap] = await Promise.all([
    readFile(indexPath(projectRoot), 'utf-8'),
    readFile(mapPath(projectRoot), 'utf-8'),
  ])

  const stored: StoredIndex = JSON.parse(rawIndex)

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

  return {
    index: { skeletons, deps, reverseDeps },
    repoMap,
    builtAt: stored.builtAt,
    fileCount: stored.fileCount,
  }
}
