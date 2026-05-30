/**
 * Resolve graph node IDs for LSP hover / impact lookup.
 */

import { normalizeNodeIdForMatch, parseGraphNodeId } from './graph-node-id.js'
import type { GraphAnalysis } from './graph-types.js'

export interface GraphLookupResolution {
  /** Preferred lookup key for computeDependentFanout / god node match. */
  lookupKey: string
  /** Full node id when known (`file:path` or `file:path:Symbol`). */
  nodeId?: string
}

function fileNodeId(relPath: string): string {
  return `file:${relPath.replace(/\\/g, '/')}`
}

function symbolNodeId(relPath: string, symbol: string): string {
  return `${fileNodeId(relPath)}:${symbol}`
}

function findNodeInAnalysis(nodeId: string, analysis: GraphAnalysis | null): boolean {
  if (!analysis) return false
  const norm = normalizeNodeIdForMatch(nodeId)
  if (analysis.godNodes.some(gn => normalizeNodeIdForMatch(gn.nodeId) === norm)) return true
  const g = analysis.graph
  if (g?.nodes.some(n => normalizeNodeIdForMatch(n.id) === norm)) return true
  return false
}

/**
 * Resolve the best graph node for LSP hover enrichment.
 */
export function resolveGraphLookup(
  relativeFilePath: string | undefined,
  symbolHint: string,
  analysis: GraphAnalysis | null
): GraphLookupResolution {
  const sym = symbolHint.trim()
  const rel = relativeFilePath?.replace(/\\/g, '/')

  if (rel && sym) {
    const explicit = symbolNodeId(rel, sym)
    if (findNodeInAnalysis(explicit, analysis)) {
      return { lookupKey: explicit, nodeId: explicit }
    }
    if (analysis) {
      for (const gn of analysis.godNodes) {
        const parsed = parseGraphNodeId(gn.nodeId)
        if (
          parsed.symbolPart &&
          normalizeNodeIdForMatch(parsed.symbolPart) === normalizeNodeIdForMatch(sym) &&
          (parsed.pathPart === rel || rel.endsWith('/' + parsed.pathPart))
        ) {
          return { lookupKey: gn.nodeId, nodeId: gn.nodeId }
        }
      }
    }
    return { lookupKey: explicit, nodeId: explicit }
  }

  if (rel) {
    const fileId = fileNodeId(rel)
    if (findNodeInAnalysis(fileId, analysis)) {
      return { lookupKey: fileId, nodeId: fileId }
    }
    const stem = rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? rel
    return { lookupKey: stem, nodeId: fileId }
  }

  return { lookupKey: sym || 'unknown' }
}
