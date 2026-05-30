/**
 * Map graph communities to project file paths for retrieval boosting.
 */

import { relative, resolve } from 'node:path'
import { parseGraphNodeId } from './graph-node-id.js'
import type { GraphAnalysis } from './graph-types.js'

/** Collect absolute file paths that belong to a community (module nodes). */
export function communityFilePaths(
  analysis: GraphAnalysis,
  communityId: string,
  projectRoot: string
): Set<string> {
  const comm = analysis.communities.find(c => c.id === communityId)
  if (!comm) return new Set()

  const paths = new Set<string>()
  for (const nodeId of comm.nodes) {
    const { pathPart, symbolPart } = parseGraphNodeId(nodeId)
    if (symbolPart) continue
    const abs = resolve(projectRoot, pathPart)
    paths.add(abs)
  }
  return paths
}

export function fileInCommunity(
  absPath: string,
  communityId: string,
  analysis: GraphAnalysis,
  projectRoot: string
): boolean {
  const files = communityFilePaths(analysis, communityId, projectRoot)
  if (files.has(absPath)) return true
  const rel = relative(projectRoot, absPath).replace(/\\/g, '/')
  for (const f of files) {
    const r = relative(projectRoot, f).replace(/\\/g, '/')
    if (rel === r || rel.endsWith(`/${r}`)) return true
  }
  return false
}
