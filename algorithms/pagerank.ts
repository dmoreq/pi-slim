/**
 * PageRank Algorithm
 *
 * Computes importance scores for graph nodes using an iterative algorithm
 * based on Google's PageRank. Important nodes depend on other important nodes.
 */

import type { CodeGraph } from '../context/graph-types.js'

/**
 * PageRank score for a single node.
 */
export interface PageRankScore {
  nodeId: string
  score: number // 0-1, normalized importance
  rawScore: number // Before normalization
}

/**
 * Compute PageRank for all nodes in a graph.
 *
 * Time Complexity: O(k × (n + m)) where k = iterations (~30), n = nodes, m = edges
 * Space Complexity: O(n)
 *
 * Implementation details:
 * - Uses damping factor (default 0.85) to prevent rank sink
 * - Iterates until convergence or max iterations
 * - Normalizes to 0-1 scale
 *
 * @param graph The knowledge graph
 * @param damping Damping factor 0-1 (default 0.85, like Google)
 * @param maxIterations Maximum iterations (default 30)
 * @param tolerance Convergence tolerance (default 1e-6)
 * @returns PageRank scores for all nodes, sorted by score (descending)
 */
export function computePageRank(
  graph: CodeGraph,
  damping = 0.85,
  maxIterations = 30,
  tolerance = 1e-6
): PageRankScore[] {
  const n = graph.nodes.length

  // ── Initialize ────────────────────────────────────────────────────────

  if (n === 0) {
    return []
  }

  const nodeIds = graph.nodes.map(n => n.id)
  const baseScore = (1 - damping) / n

  const rank = new Map<string, number>()
  const newRank = new Map<string, number>()

  for (const id of nodeIds) {
    rank.set(id, 1 / n)
  }

  // ── Build outlink map for efficiency ───────────────────────────────────

  const outlinks = new Map<string, string[]>()
  for (const id of nodeIds) {
    outlinks.set(id, [])
  }

  for (const edge of graph.edges) {
    const links = outlinks.get(edge.source)
    if (links) {
      links.push(edge.target)
    }
  }

  // ── Iterative computation ──────────────────────────────────────────────

  let iteration = 0
  let converged = false

  while (!converged && iteration < maxIterations) {
    converged = true
    iteration++

    for (const nodeId of nodeIds) {
      let score = baseScore

      // Sum contributions from nodes pointing to this node
      for (const edge of graph.edges) {
        if (edge.target === nodeId) {
          const sourceRank = rank.get(edge.source) ?? 0
          const sourceOutDegree = outlinks.get(edge.source)?.length ?? 1
          score += damping * (sourceRank / sourceOutDegree)
        }
      }

      newRank.set(nodeId, score)

      // Check convergence
      const oldScore = rank.get(nodeId) ?? 0
      if (Math.abs(score - oldScore) > tolerance) {
        converged = false
      }
    }

    // Swap ranks for next iteration
    rank.clear()
    for (const [id, score] of newRank.entries()) {
      rank.set(id, score)
    }
  }

  // ── Normalize to 0-1 ──────────────────────────────────────────────────

  const scores = Array.from(rank.values())
  const maxScore = Math.max(...scores, 0)
  const minScore = Math.min(...scores, 0)
  const range = maxScore - minScore || 1

  const results: PageRankScore[] = nodeIds.map(id => {
    const rawScore = rank.get(id) ?? 0
    const normalizedScore = (rawScore - minScore) / range

    return {
      nodeId: id,
      score: normalizedScore,
      rawScore,
    }
  })

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results
}

/**
 * Identify god nodes by PageRank score.
 * High PageRank = important node that the codebase relies on.
 *
 * @param pageRankScores PageRank scores
 * @param threshold Minimum score threshold (default 0.1)
 * @returns Node IDs that are god nodes by PageRank
 */
export function identifyGodNodesByPageRank(pageRankScores: PageRankScore[], threshold = 0.1): string[] {
  return pageRankScores.filter(score => score.score >= threshold).map(score => score.nodeId)
}

/**
 * Rank nodes by PageRank score.
 * Top-ranked nodes are most important.
 *
 * @param pageRankScores PageRank scores
 * @param limit Return top N (default: all)
 * @returns Top N most important nodes
 */
export function rankByPageRank(pageRankScores: PageRankScore[], limit?: number): PageRankScore[] {
  const sorted = [...pageRankScores]

  return limit ? sorted.slice(0, limit) : sorted
}

/**
 * Get statistics about PageRank distribution.
 *
 * @param pageRankScores PageRank scores
 * @returns Statistics
 */
export function getPageRankStats(pageRankScores: PageRankScore[]): {
  maxScore: number
  minScore: number
  avgScore: number
  medianScore: number
  stdDev: number
  percentile95: number
} {
  if (pageRankScores.length === 0) {
    return {
      maxScore: 0,
      minScore: 0,
      avgScore: 0,
      medianScore: 0,
      stdDev: 0,
      percentile95: 0,
    }
  }

  const scores = pageRankScores.map(s => s.score)

  const max = Math.max(...scores)
  const min = Math.min(...scores)

  const sum = scores.reduce((a, b) => a + b, 0)
  const avg = sum / scores.length

  const sorted = [...scores].sort((a, b) => a - b)
  const median =
    scores.length % 2 !== 0
      ? sorted[Math.floor(scores.length / 2)]
      : (sorted[Math.floor(scores.length / 2) - 1] + sorted[Math.floor(scores.length / 2)]) / 2

  const variance = scores.reduce((sum, score) => sum + (score - avg) ** 2, 0) / scores.length
  const stdDev = Math.sqrt(variance)

  const percentileIndex = Math.ceil((95 / 100) * scores.length) - 1
  const percentile95 = sorted[Math.max(0, percentileIndex)]

  return {
    maxScore: max,
    minScore: min,
    avgScore: avg,
    medianScore: median,
    stdDev,
    percentile95,
  }
}

/**
 * Combine degree centrality and PageRank for better importance ranking.
 * Nodes with high both metrics are truly critical.
 *
 * @param degreeScores Degree centrality scores
 * @param pageRankScores PageRank scores
 * @param degreeWeight Weight for degree (default 0.4)
 * @param pageRankWeight Weight for PageRank (default 0.6)
 * @returns Combined importance scores
 */
export function combineImportanceScores(
  degreeScores: Map<string, number>,
  pageRankScores: Map<string, number>,
  degreeWeight = 0.4,
  pageRankWeight = 0.6
): Map<string, number> {
  const combined = new Map<string, number>()

  // Normalize weights
  const totalWeight = degreeWeight + pageRankWeight
  const normDegreeWeight = degreeWeight / totalWeight
  const normPageRankWeight = pageRankWeight / totalWeight

  for (const [nodeId, degree] of degreeScores.entries()) {
    const pageRank = pageRankScores.get(nodeId) ?? 0
    const importance = normDegreeWeight * degree + normPageRankWeight * pageRank

    combined.set(nodeId, importance)
  }

  return combined
}
