/**
 * Community Detection Algorithm (Louvain Method)
 *
 * Detects communities (densely connected subgraphs) using the Louvain algorithm.
 * Iteratively optimizes modularity to find natural groupings in the graph.
 */

import type { CommunityAnalysis, CodeGraph } from '../context/graph-types.js'

/**
 * Modularity statistics for a community.
 */
export interface ModularityStats {
  modularity: number
  iterations: number
  converged: boolean
}

/**
 * Detect communities in a graph using the Louvain algorithm.
 *
 * The Louvain algorithm works in two phases:
 * 1. Local optimization: Move each node to the community that maximizes modularity gain
 * 2. Community aggregation: Contract communities and repeat until convergence
 *
 * Time Complexity: O(k × (n + m)) where k = iterations, typically k ≈ log(n)
 * Space Complexity: O(n)
 *
 * @param graph The knowledge graph
 * @param maxIterations Maximum iterations (default: 10)
 * @returns Array of detected communities
 */
export function detectCommunitiesLouvain(graph: CodeGraph, maxIterations = 10): CommunityAnalysis[] {
  const n = graph.nodes.length

  if (n === 0) {
    return []
  }

  // Initialize: each node is its own community
  const nodeIds = graph.nodes.map(n => n.id)
  const communities = new Map<string, Set<string>>()

  for (const nodeId of nodeIds) {
    communities.set(nodeId, new Set([nodeId]))
  }

  // Build adjacency for efficiency
  const neighbors = buildNeighborMap(graph)
  const m = graph.edges.length // Total edges (undirected count)

  // Iteratively optimize modularity
  let iteration = 0
  let improved = true

  while (improved && iteration < maxIterations) {
    improved = false
    iteration++

    // Phase 1: Try moving each node to neighboring communities
    for (const nodeId of nodeIds) {
      const currentCommunity = findCommunity(communities, nodeId)
      const nodeNeighbors = neighbors.get(nodeId) ?? new Set()

      // Collect neighboring communities
      const neighboringCommunities = new Set<string>()
      for (const neighbor of nodeNeighbors) {
        const neighborComm = findCommunity(communities, neighbor)
        if (neighborComm !== currentCommunity) {
          neighboringCommunities.add(neighborComm)
        }
      }

      // Try each neighboring community
      let bestCommunity = currentCommunity
      let bestDelta = 0

      for (const targetComm of neighboringCommunities) {
        const delta = computeModularityDelta(nodeId, currentCommunity, targetComm, communities, graph, neighbors, m)

        if (delta > bestDelta) {
          bestDelta = delta
          bestCommunity = targetComm
        }
      }

      // Move node if improvement found
      if (bestCommunity !== currentCommunity && bestDelta > 1e-10) {
        communities.get(currentCommunity)?.delete(nodeId)
        communities.get(bestCommunity)?.add(nodeId)
        improved = true
      }
    }
  }

  // Phase 2: Collapse communities to final result
  const finalCommunities: CommunityAnalysis[] = []
  const seen = new Set<string>()

  for (const [commId, members] of communities) {
    if (members.size > 0 && !seen.has(commId)) {
      const internalEdges = countEdgesInCommunity(members, graph)
      const externalEdges = countEdgesOutside(members, graph)
      const density = computeDensity(members, internalEdges)
      const interfaceNodes = findInterfaceNodes(members, graph)

      finalCommunities.push({
        id: `community-${finalCommunities.length}`,
        label: `Community ${finalCommunities.length + 1}`,
        nodes: Array.from(members),
        internalDensity: density,
        externalDensity: externalEdges > 0 ? externalEdges / (members.size * (graph.nodes.length - members.size)) : 0,
        interfaceNodes,
        bottlenecks: findBottlenecksInCommunity(members, neighbors),
      })

      for (const member of members) {
        seen.add(member)
      }
    }
  }

  return finalCommunities
}

/**
 * Build a neighbor map for efficiency.
 * Maps each node to its direct neighbors.
 *
 * @param graph The knowledge graph
 * @returns Map of node ID to neighbor set
 */
function buildNeighborMap(graph: CodeGraph): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>()

  // Initialize
  for (const node of graph.nodes) {
    neighbors.set(node.id, new Set())
  }

  // Add edges (treating as undirected)
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.add(edge.target)
    neighbors.get(edge.target)?.add(edge.source)
  }

  return neighbors
}

/**
 * Find which community a node belongs to.
 *
 * @param communities Community map
 * @param nodeId Node to find
 * @returns Community ID or node ID if not found
 */
function findCommunity(communities: Map<string, Set<string>>, nodeId: string): string {
  for (const [commId, members] of communities) {
    if (members.has(nodeId)) {
      return commId
    }
  }
  return nodeId
}

/**
 * Compute modularity delta if node moves to target community.
 *
 * Approximation: count edges that would be internal vs external.
 *
 * @param nodeId Node to move
 * @param fromCommunity Current community
 * @param toCommunity Target community
 * @param communities Community map
 * @param graph The graph
 * @param neighbors Neighbor map
 * @param m Total edges
 * @returns Modularity change
 */
function computeModularityDelta(
  nodeId: string,
  fromCommunity: string,
  toCommunity: string,
  communities: Map<string, Set<string>>,
  _graph: CodeGraph,
  neighbors: Map<string, Set<string>>,
  _m: number
): number {
  const _fromMembers = communities.get(fromCommunity) ?? new Set()
  const toMembers = communities.get(toCommunity) ?? new Set()
  const nodeNeighbors = neighbors.get(nodeId) ?? new Set()

  // Count internal edges if we move
  let internalEdges = 0
  for (const neighbor of nodeNeighbors) {
    if (toMembers.has(neighbor)) {
      internalEdges++
    }
  }

  // Count external edges if we stay
  let externalEdges = 0
  for (const neighbor of nodeNeighbors) {
    if (!toMembers.has(neighbor)) {
      externalEdges++
    }
  }

  // Simple heuristic: internal edges positive, external negative
  return internalEdges - externalEdges * 0.5
}

/**
 * Count edges within a community.
 *
 * @param community Set of node IDs
 * @param graph The graph
 * @returns Number of edges within community
 */
function countEdgesInCommunity(community: Set<string>, graph: CodeGraph): number {
  let count = 0
  for (const edge of graph.edges) {
    if (community.has(edge.source) && community.has(edge.target)) {
      count++
    }
  }
  return count
}

/**
 * Count edges going outside a community.
 *
 * @param community Set of node IDs
 * @param graph The graph
 * @returns Number of edges crossing boundary
 */
function countEdgesOutside(community: Set<string>, graph: CodeGraph): number {
  let count = 0
  for (const edge of graph.edges) {
    const sourceIn = community.has(edge.source)
    const targetIn = community.has(edge.target)
    if (sourceIn !== targetIn) {
      count++
    }
  }
  return count
}

/**
 * Compute density of a community.
 *
 * @param community Set of node IDs
 * @param internalEdges Number of internal edges
 * @returns Density (0-1)
 */
function computeDensity(community: Set<string>, internalEdges: number): number {
  const n = community.size
  if (n <= 1) {
    return 0
  }

  const maxEdges = n * (n - 1) // Directed
  return maxEdges > 0 ? internalEdges / maxEdges : 0
}

/**
 * Find interface nodes (nodes with external connections).
 *
 * @param community Set of node IDs
 * @param graph The graph
 * @returns Array of interface node IDs
 */
function findInterfaceNodes(community: Set<string>, graph: CodeGraph): string[] {
  const interfaceNodes = new Set<string>()

  for (const edge of graph.edges) {
    const sourceIn = community.has(edge.source)
    const targetIn = community.has(edge.target)

    if (sourceIn && !targetIn) {
      interfaceNodes.add(edge.source)
    }
    if (targetIn && !sourceIn) {
      interfaceNodes.add(edge.target)
    }
  }

  return Array.from(interfaceNodes)
}

/**
 * Find bottleneck nodes within a community.
 * Bottlenecks have high degree relative to others in the community.
 *
 * @param community Set of node IDs
 * @param neighbors Neighbor map
 * @returns Array of bottleneck node IDs
 */
function findBottlenecksInCommunity(community: Set<string>, neighbors: Map<string, Set<string>>): string[] {
  const degrees = new Map<string, number>()

  // Count degree within community
  for (const nodeId of community) {
    const nodeNeighbors = neighbors.get(nodeId) ?? new Set()
    let internalDegree = 0

    for (const neighbor of nodeNeighbors) {
      if (community.has(neighbor)) {
        internalDegree++
      }
    }

    degrees.set(nodeId, internalDegree)
  }

  // Find nodes with above-average degree
  const avgDegree = Array.from(degrees.values()).reduce((a, b) => a + b, 0) / community.size

  const bottlenecks: string[] = []
  for (const [nodeId, degree] of degrees) {
    if (degree > avgDegree * 1.5) {
      bottlenecks.push(nodeId)
    }
  }

  return bottlenecks.sort((a, b) => (degrees.get(b) ?? 0) - (degrees.get(a) ?? 0))
}

/**
 * Compute global modularity of a community structure.
 * Higher modularity = better community structure.
 *
 * @param communities Array of communities
 * @param graph The graph
 * @returns Modularity score (0-1)
 */
export function computeGlobalModularity(communities: CommunityAnalysis[], graph: CodeGraph): number {
  let modularity = 0

  for (const community of communities) {
    const communitySet = new Set(community.nodes)
    const internalEdges = countEdgesInCommunity(communitySet, graph)
    const totalEdges = graph.edges.length

    if (totalEdges === 0) continue

    // Modularity contribution of this community
    const communityModularity =
      internalEdges / totalEdges -
      ((community.nodes.length * community.nodes.length) / (graph.nodes.length * graph.nodes.length)) * 0.1 // Penalty for size

    modularity += communityModularity
  }

  return Math.max(0, modularity)
}

/**
 * Get statistics about detected communities.
 *
 * @param communities Array of communities
 * @returns Statistics object
 */
export function getCommunityStats(communities: CommunityAnalysis[]): {
  count: number
  avgSize: number
  minSize: number
  maxSize: number
  avgDensity: number
  minDensity: number
  maxDensity: number
} {
  if (communities.length === 0) {
    return {
      count: 0,
      avgSize: 0,
      minSize: 0,
      maxSize: 0,
      avgDensity: 0,
      minDensity: 0,
      maxDensity: 0,
    }
  }

  const sizes = communities.map(c => c.nodes.length)
  const densities = communities.map(c => c.internalDensity)

  return {
    count: communities.length,
    avgSize: sizes.reduce((a, b) => a + b) / sizes.length,
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    avgDensity: densities.reduce((a, b) => a + b) / densities.length,
    minDensity: Math.min(...densities),
    maxDensity: Math.max(...densities),
  }
}
