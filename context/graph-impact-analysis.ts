/**
 * Impact Analysis for Code Changes
 *
 * Analyzes how changes to a symbol affect dependent code:
 * - Direct dependents (who calls this)
 * - Transitive dependents (who depends indirectly)
 * - Community impact (which communities are affected)
 * - Breaking change risk
 */

import type { GraphifyGraph, GraphifyAnalysis, CommunityAnalysis } from './graph-types.js'

/**
 * Impact of a code change.
 */
export interface ChangeImpact {
  symbol: string
  directDependents: string[]
  transitiveDependents: string[]
  affectedCommunities: CommunityAnalysis[]
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedAffectedLines: number
  breakingChangeRisk: boolean
  recommendations: string[]
}

/**
 * Propagation path from source to dependent.
 */
export interface ImpactPath {
  source: string
  target: string
  path: string[]
  pathLength: number
  community?: string
}

/**
 * Analyze the impact of a change to a symbol.
 *
 * Time Complexity: O(n + m) for BFS traversal
 * Space Complexity: O(n)
 *
 * @param symbol Symbol being changed
 * @param analysis Graph analysis data
 * @param graph Optional graph data (or falls back to analysis.graph)
 * @returns Impact analysis
 */
export function analyzeSymbolImpact(symbol: string, analysis: GraphifyAnalysis, graphArg?: GraphifyGraph | null): ChangeImpact {
  // Support both explicit graph param and legacy analysis.graph for backward compat
  const g = graphArg ?? (analysis as any).graph ?? null
  // Without graph data, return a basic impact with no dependents
  if (!g) {
    const nodeId = normalizeSymbol(symbol)
    return {
      symbol,
      directDependents: [],
      transitiveDependents: [],
      affectedCommunities: [],
      riskLevel: 'LOW',
      estimatedAffectedLines: 0,
      breakingChangeRisk: false,
      recommendations: ['No graph data available for impact analysis'],
    }
  }
  const graph = g
  const nodeId = normalizeSymbol(symbol)

  // Find all direct dependents (who calls this symbol)
  const directDependents = findDirectDependents(nodeId, graph)

  // Find all transitive dependents using BFS
  const transitiveDependents = findTransitiveDependents(nodeId, graph)

  // Find affected communities
  const affectedCommunities = findAffectedCommunities(
    [nodeId, ...directDependents, ...transitiveDependents],
    analysis
  )

  // Determine risk level
  const riskLevel = determineRiskLevel(
    symbol,
    directDependents,
    transitiveDependents,
    analysis
  )

  // Estimate affected lines (rough: 20 lines per affected symbol)
  const estimatedAffectedLines = (directDependents.length + transitiveDependents.length) * 20

  // Check for breaking change risk
  const breakingChangeRisk = directDependents.length > 5

  // Generate recommendations
  const recommendations = generateRecommendations(
    symbol,
    riskLevel,
    directDependents,
    affectedCommunities
  )

  return {
    symbol,
    directDependents,
    transitiveDependents,
    affectedCommunities,
    riskLevel,
    estimatedAffectedLines,
    breakingChangeRisk,
    recommendations
  }
}

/**
 * Find all direct dependents (symbols that directly depend on this symbol).
 *
 * @param nodeId Node ID to find dependents for
 * @param graph Graph data
 * @returns Array of dependent node IDs
 */
function findDirectDependents(nodeId: string, graph: GraphifyGraph): string[] {
  const dependents = new Set<string>()

  for (const edge of graph.edges) {
    if (normalizeNodeId(edge.target) === nodeId) {
      dependents.add(edge.source)
    }
  }

  return Array.from(dependents)
}

/**
 * Find all transitive dependents using BFS.
 *
 * @param nodeId Starting node
 * @param graph Graph data
 * @param maxDepth Maximum traversal depth
 * @returns Array of transitive dependent node IDs
 */
function findTransitiveDependents(
  nodeId: string,
  graph: GraphifyGraph,
  maxDepth: number = 10
): string[] {
  const visited = new Set<string>()
  const queue: [string, number][] = [[nodeId, 0]]
  visited.add(nodeId)

  while (queue.length > 0) {
    const [currentNode, depth] = queue.shift()!

    if (depth >= maxDepth) {
      continue
    }

    // Find all nodes that depend on current node
    for (const edge of graph.edges) {
      if (normalizeNodeId(edge.target) === currentNode && !visited.has(edge.source)) {
        visited.add(edge.source)
        queue.push([edge.source, depth + 1])
      }
    }
  }

  // Remove the original node from results
  visited.delete(nodeId)
  return Array.from(visited)
}

/**
 * Find all communities affected by changes to nodes.
 *
 * @param nodes Node IDs being changed
 * @param analysis Graph analysis
 * @returns Array of affected communities
 */
function findAffectedCommunities(
  nodes: string[],
  analysis: GraphifyAnalysis
): CommunityAnalysis[] {
  const affectedCommIds = new Set<string>()
  const nodeSet = new Set(nodes.map((n) => normalizeNodeId(n)))

  for (const community of analysis.communities) {
    for (const member of community.nodes) {
      if (nodeSet.has(normalizeNodeId(member))) {
        affectedCommIds.add(community.id)
        break
      }
    }
  }

  return analysis.communities.filter((c) => affectedCommIds.has(c.id))
}

/**
 * Determine risk level of a change.
 *
 * @param symbol Symbol being changed
 * @param directDependents Direct dependents
 * @param transitiveDependents Transitive dependents
 * @param analysis Graph analysis
 * @returns Risk level
 */
function determineRiskLevel(
  symbol: string,
  directDependents: string[],
  transitiveDependents: string[],
  analysis: GraphifyAnalysis
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const totalDependents = directDependents.length + transitiveDependents.length

  // Check if symbol is a god node
  const isGodNode = analysis.godNodes.some(
    (gn) => normalizeSymbol(gn.nodeId) === normalizeSymbol(symbol)
  )

  if (isGodNode || totalDependents > 20) {
    return 'CRITICAL'
  }

  if (totalDependents > 10 || directDependents.length > 5) {
    return 'HIGH'
  }

  if (totalDependents > 5 || directDependents.length > 2) {
    return 'MEDIUM'
  }

  return 'LOW'
}

/**
 * Generate actionable recommendations.
 *
 * @param symbol Symbol being changed
 * @param riskLevel Risk level
 * @param directDependents Direct dependents
 * @param affectedCommunities Affected communities
 * @returns Array of recommendations
 */
function generateRecommendations(
  symbol: string,
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  directDependents: string[],
  affectedCommunities: CommunityAnalysis[]
): string[] {
  const recommendations: string[] = []

  if (riskLevel === 'CRITICAL') {
    recommendations.push('Request mandatory code review before merge')
    recommendations.push('Run full integration test suite')
    recommendations.push(`Notify owners of ${affectedCommunities.length} affected communities`)
    recommendations.push('Consider breaking change deprecation period')
  } else if (riskLevel === 'HIGH') {
    recommendations.push('Request peer code review')
    recommendations.push('Update affected dependents in same PR')
    if (affectedCommunities.length > 1) {
      recommendations.push('Coordinate with other community leads')
    }
  } else if (riskLevel === 'MEDIUM') {
    recommendations.push('Standard code review applies')
    recommendations.push('Add tests for dependent modules')
  }

  if (directDependents.length > 3) {
    recommendations.push(
      `Update ${directDependents.length} direct dependents: ${directDependents.slice(0, 3).join(', ')}${directDependents.length > 3 ? '...' : ''}`
    )
  }

  if (!recommendations.length) {
    recommendations.push('Low impact change - standard process applies')
  }

  return recommendations
}

/**
 * Trace all impact paths from a change to affected code.
 *
 * @param symbol Starting symbol
 * @param analysis Graph analysis
 * @param maxPaths Maximum number of paths to return
 * @returns Array of impact paths
 */
export function traceImpactPaths(
  symbol: string,
  analysis: GraphifyAnalysis,
  maxPaths: number = 10,
  graph?: GraphifyGraph | null
): ImpactPath[] {
  // Support both explicit graph param and legacy analysis.graph for backward compat
  const effectiveGraph = graph ?? (analysis as any).graph ?? null
  if (!effectiveGraph) return []
  const nodeId = normalizeSymbol(symbol)
  const paths: ImpactPath[] = []

  // BFS to find all paths
  const queue: { current: string; path: string[] }[] = [{ current: nodeId, path: [nodeId] }]
  const visited = new Set<string>()

  while (queue.length > 0 && paths.length < maxPaths) {
    const { current, path } = queue.shift()!

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    // Find dependents of current node
    for (const edge of effectiveGraph.edges) {
      if (normalizeNodeId(edge.target) === current) {
        const source = edge.source
        const newPath = [...path, source]

        if (newPath.length > 1) {
          const targetCommunity = findCommunityForNode(source, analysis)
          paths.push({
            source: nodeId,
            target: source,
            path: newPath,
            pathLength: newPath.length,
            community: targetCommunity?.label
          })
        }

        if (newPath.length < 5) {
          queue.push({ current: source, path: newPath })
        }
      }
    }
  }

  // Sort by path length (shortest first)
  return paths.sort((a, b) => a.pathLength - b.pathLength)
}

/**
 * Get impact summary for a symbol change.
 *
 * @param symbol Symbol being changed
 * @param analysis Graph analysis
 * @returns Summary string
 */
export function getImpactSummary(symbol: string, analysis: GraphifyAnalysis, graph?: GraphifyGraph | null): string {
  const impact = analyzeSymbolImpact(symbol, analysis, graph)

  const lines: string[] = [
    `Impact Analysis for: ${symbol}`,
    `Risk Level: ${impact.riskLevel}`,
    `Direct Dependents: ${impact.directDependents.length}`,
    `Transitive Dependents: ${impact.transitiveDependents.length}`,
    `Affected Communities: ${impact.affectedCommunities.length}`,
    `Estimated Lines to Update: ${impact.estimatedAffectedLines}`
  ]

  if (impact.breakingChangeRisk) {
    lines.push('⚠️ Breaking Change Risk Detected')
  }

  lines.push('')
  lines.push('Recommendations:')
  impact.recommendations.forEach((rec) => {
    lines.push(`  • ${rec}`)
  })

  return lines.join('\n')
}

/**
 * Find community for a node.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Community or undefined
 */
function findCommunityForNode(
  nodeId: string,
  analysis: GraphifyAnalysis
): CommunityAnalysis | undefined {
  const normalized = normalizeNodeId(nodeId)
  return analysis.communities.find((c) =>
    c.nodes.some((n) => normalizeNodeId(n) === normalized)
  )
}

/**
 * Normalize symbol name for comparison.
 *
 * @param symbol Symbol name
 * @returns Normalized ID
 */
function normalizeSymbol(symbol: string): string {
  return symbol.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * Normalize node ID for comparison.
 *
 * @param nodeId Node ID
 * @returns Normalized ID
 */
function normalizeNodeId(nodeId: string): string {
  return nodeId.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * Compute change impact statistics.
 *
 * @param impacts Array of change impacts
 * @returns Statistics object
 */
export function computeImpactStats(impacts: ChangeImpact[]): {
  totalImpacted: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  avgDependents: number
  maxDependents: number
} {
  const stats = {
    totalImpacted: impacts.length,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    avgDependents: 0,
    maxDependents: 0
  }

  if (impacts.length === 0) {
    return stats
  }

  let totalDependents = 0

  for (const impact of impacts) {
    const dependentCount = impact.directDependents.length + impact.transitiveDependents.length

    totalDependents += dependentCount
    stats.maxDependents = Math.max(stats.maxDependents, dependentCount)

    switch (impact.riskLevel) {
      case 'CRITICAL':
        stats.criticalCount++
        break
      case 'HIGH':
        stats.highCount++
        break
      case 'MEDIUM':
        stats.mediumCount++
        break
      case 'LOW':
        stats.lowCount++
        break
    }
  }

  stats.avgDependents = Math.round(totalDependents / impacts.length)

  return stats
}
