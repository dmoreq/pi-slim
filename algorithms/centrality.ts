/**
 * Centrality Algorithms
 *
 * Computes degree and betweenness centrality for graph nodes.
 * These metrics identify important nodes in the dependency graph.
 */

import type { CodeGraph } from '../context/graph-types.js'

/**
 * Degree centrality score for a single node.
 * In-degree: how many nodes depend on this.
 * Out-degree: how many nodes this depends on.
 */
export interface DegreeScore {
  nodeId: string
  inDegree: number // Incoming edges (depends on this)
  outDegree: number // Outgoing edges (depends on)
  totalDegree: number // In + Out
  normalized: number // 0-1, normalized by max
}

/**
 * Compute degree centrality for all nodes in a graph.
 *
 * Time Complexity: O(n + m) where n = nodes, m = edges
 * Space Complexity: O(n)
 *
 * @param graph The knowledge graph
 * @returns Degree scores for all nodes, sorted by total degree (descending)
 */
export function computeDegreeCentrality(graph: CodeGraph): DegreeScore[] {
  const inDegree = new Map<string, number>()
  const outDegree = new Map<string, number>()

  // Initialize all nodes
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0)
    outDegree.set(node.id, 0)
  }

  // Count edges
  for (const edge of graph.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  // Find maximum degree for normalization
  let maxDegree = 0
  for (const node of graph.nodes) {
    const total = (inDegree.get(node.id) ?? 0) + (outDegree.get(node.id) ?? 0)
    if (total > maxDegree) maxDegree = total
  }

  // Create result array
  const results: DegreeScore[] = []

  for (const node of graph.nodes) {
    const in_ = inDegree.get(node.id) ?? 0
    const out = outDegree.get(node.id) ?? 0
    const total = in_ + out

    results.push({
      nodeId: node.id,
      inDegree: in_,
      outDegree: out,
      totalDegree: total,
      normalized: maxDegree > 0 ? total / maxDegree : 0,
    })
  }

  // Sort by total degree descending
  results.sort((a, b) => b.totalDegree - a.totalDegree)

  return results
}

/**
 * Identify god nodes based on degree centrality.
 * God nodes have high in-degree (many things depend on them).
 *
 * @param degreeScores Sorted degree scores
 * @param threshold Minimum in-degree to be considered a god node (default: 3)
 * @returns Node IDs that are god nodes
 */
export function identifyGodNodesByDegree(degreeScores: DegreeScore[], threshold = 3): string[] {
  return degreeScores.filter(score => score.inDegree >= threshold).map(score => score.nodeId)
}

/**
 * Identify bottleneck nodes.
 * Bottlenecks have high out-degree relative to in-degree.
 * They import/depend on many things.
 *
 * @param degreeScores Degree scores
 * @param threshold Minimum out-degree (default: 5)
 * @returns Node IDs that are bottlenecks
 */
export function identifyBottlenecksByDegree(degreeScores: DegreeScore[], threshold = 5): string[] {
  return degreeScores.filter(score => score.outDegree >= threshold).map(score => score.nodeId)
}

/**
 * Rank nodes by their in-degree (dependency count).
 * Higher rank = more nodes depend on it.
 *
 * @param degreeScores Degree scores
 * @param limit Return top N (default: all)
 * @returns Top N most-depended-on nodes
 */
export function rankByInDegree(degreeScores: DegreeScore[], limit?: number): DegreeScore[] {
  const sorted = [...degreeScores].sort((a, b) => b.inDegree - a.inDegree)

  return limit ? sorted.slice(0, limit) : sorted
}

/**
 * Get statistics about degree distribution.
 *
 * @param degreeScores Degree scores
 * @returns Statistics
 */
export function getDegreeCentralityStats(degreeScores: DegreeScore[]): {
  maxInDegree: number
  maxOutDegree: number
  maxTotalDegree: number
  avgInDegree: number
  avgOutDegree: number
  avgTotalDegree: number
  medianInDegree: number
  medianOutDegree: number
  medianTotalDegree: number
} {
  const inDegrees = degreeScores.map(s => s.inDegree)
  const outDegrees = degreeScores.map(s => s.outDegree)
  const totalDegrees = degreeScores.map(s => s.totalDegree)

  const getMedian = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
  const max = (arr: number[]) => Math.max(...arr, 0)

  return {
    maxInDegree: max(inDegrees),
    maxOutDegree: max(outDegrees),
    maxTotalDegree: max(totalDegrees),
    avgInDegree: inDegrees.length > 0 ? sum(inDegrees) / inDegrees.length : 0,
    avgOutDegree: outDegrees.length > 0 ? sum(outDegrees) / outDegrees.length : 0,
    avgTotalDegree: totalDegrees.length > 0 ? sum(totalDegrees) / totalDegrees.length : 0,
    medianInDegree: getMedian(inDegrees),
    medianOutDegree: getMedian(outDegrees),
    medianTotalDegree: getMedian(totalDegrees),
  }
}
