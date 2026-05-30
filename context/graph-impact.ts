/**
 * BFS dependent fan-out — shared by intelligence risk warnings and LSP hover impact.
 */

import type { GraphAnalysis } from './graph-types.js'
import { normalizeNodeIdForMatch, parseGraphNodeId } from './graph-node-id.js'

export interface DependentFanout {
  dependentCount: number
  affectedCommunities: number
}

/**
 * Count nodes that depend on the given symbol/file (incoming edges), transitively.
 */
export function computeDependentFanout(lookupKey: string, analysis: GraphAnalysis): DependentFanout {
  const g = analysis.graph
  if (!g?.edges?.length) {
    return { dependentCount: 0, affectedCommunities: 0 }
  }

  const targetNorm = normalizeNodeIdForMatch(lookupKey)
  const seedIds = new Set<string>()

  for (const n of g.nodes) {
    if (normalizeNodeIdForMatch(n.id) === targetNorm) {
      seedIds.add(n.id.toLowerCase())
    }
  }
  for (const gn of analysis.godNodes) {
    const gnNorm = normalizeNodeIdForMatch(gn.nodeId)
    const labelNorm = normalizeNodeIdForMatch(gn.label)
    if (gnNorm === targetNorm || labelNorm === targetNorm) {
      seedIds.add(gn.nodeId.toLowerCase())
    }
    const parsed = parseGraphNodeId(gn.nodeId)
    if (parsed.symbolPart && normalizeNodeIdForMatch(parsed.symbolPart) === targetNorm) {
      seedIds.add(gn.nodeId.toLowerCase())
    }
  }

  if (seedIds.size === 0) {
    seedIds.add(lookupKey.toLowerCase())
  }

  const visited = new Set<string>(seedIds)
  const queue = [...seedIds]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const edge of g.edges) {
      const target = edge.target.toLowerCase()
      if (target === current) {
        const src = edge.source.toLowerCase()
        if (!visited.has(src)) {
          visited.add(src)
          queue.push(src)
        }
      }
    }
  }

  const dependentCount = Math.max(0, visited.size - seedIds.size)
  const communityIds = new Set<string>()
  for (const dep of visited) {
    if (seedIds.has(dep)) continue
    for (const c of analysis.communities) {
      if (c.nodes.some(n => n.toLowerCase() === dep || normalizeNodeIdForMatch(n) === normalizeNodeIdForMatch(dep))) {
        communityIds.add(c.id)
      }
    }
  }

  return {
    dependentCount,
    affectedCommunities: communityIds.size || (dependentCount > 0 ? 1 : 0),
  }
}
