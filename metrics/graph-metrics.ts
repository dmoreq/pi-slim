/**
 * Graph Metrics — compute token savings, quality metrics, and performance
 * benchmarks from graph analysis.
 *
 * Tracks:
 *   - Token savings from graph-boosted retrieval vs baseline
 *   - Quality metrics (precision, recall, rank improvement)
 *   - Performance benchmarks (computation time, cache hit ratio)
 *   - Aggregated stats for reporting
 */

import type {
  GraphifyAnalysis,
  GraphifyGraph,
  GodNode,
  CommunityAnalysis
} from '../context/graph-types.js'
import type { ScoredFile } from '../context/retrieval.js'

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Token savings from graph-boosted retrieval.
 */
export interface GraphTokenSavings {
  /** Total tokens saved by using graph boost (vs baseline) */
  totalSaved: number
  /** Tokens saved per turn */
  perTurn: number[]
  /** Average tokens saved per turn */
  avgPerTurn: number
  /** Peak tokens saved in a single turn */
  peakPerTurn: number
  /** Percentage reduction vs baseline */
  reductionPercent: number
}

/**
 * Quality metrics for graph-enhanced retrieval.
 */
export interface GraphQualityMetrics {
  /** Precision@5 — fraction of top-5 results that are relevant */
  precisionAt5: number
  /** Recall@10 — fraction of relevant results in top-10 */
  recallAt10: number
  /** Mean Reciprocal Rank */
  meanReciprocalRank: number
  /** Average rank improvement vs baseline */
  avgRankImprovement: number
  /** God nodes appearing in top-5 */
  godNodesInTop5: number
  /** Unique communities represented in results */
  communitiesRepresented: number
}

/**
 * Performance benchmarks for graph computation.
 */
export interface GraphPerformanceBenchmark {
  /** Time to compute graph analysis (ms) */
  computationTimeMs: number
  /** Time to load graph from cache (ms) */
  cacheLoadTimeMs: number
  /** Cache hit ratio (0-1) */
  cacheHitRatio: number
  /** Memory used for graph data (bytes, rough) */
  estimatedMemoryBytes: number
  /** Number of nodes */
  nodeCount: number
  /** Number of edges */
  edgeCount: number
}

/**
 * Aggregated statistics about the graph.
 */
export interface GraphAggregateStats {
  /** Total graphs computed */
  totalComputations: number
  /** Total cache hits */
  totalCacheHits: number
  /** Total cache misses */
  totalCacheMisses: number
  /** Average computation time (ms) */
  avgComputationTimeMs: number
  /** Average cache load time (ms) */
  avgCacheLoadTimeMs: number
  /** Cumulative token savings */
  cumulativeTokenSavings: number
}

// ── Token Savings Computation ──────────────────────────────────────────────

/**
 * Compute token savings from graph-boosted retrieval.
 *
 * Graph boost reduces the number of files needed to return relevant results
 * by elevating god nodes and injecting community context.
 *
 * @param baselineResults Results without graph boost
 * @param boostedResults Results with graph boost
 * @returns Token savings
 */
export function computeGraphTokenSavings(
  baselineResults: ScoredFile[],
  boostedResults: ScoredFile[]
): GraphTokenSavings {
  const baselineTokens = estimateResultsTokens(baselineResults)
  const boostedTokens = estimateResultsTokens(boostedResults)

  const saved = Math.max(0, baselineTokens - boostedTokens)
  const reduction = baselineTokens > 0 ? saved / baselineTokens : 0

  return {
    totalSaved: saved,
    perTurn: [saved],
    avgPerTurn: saved,
    peakPerTurn: saved,
    reductionPercent: Math.round(reduction * 100),
  }
}

/**
 * Estimate token cost of retrieval results.
 * Rough: each file reference ~10 tokens, each path ~5 tokens.
 */
function estimateResultsTokens(results: ScoredFile[]): number {
  return results.reduce((sum, f) => sum + 10 + f.file.length / 4, 0)
}

// ── Quality Metrics ────────────────────────────────────────────────────────

/**
 * Compute quality metrics for graph-enhanced retrieval.
 *
 * @param baselineRankings Original ranking order (file paths)
 * @param boostedRankings Enhanced ranking order (file paths)
 * @param relevantFileIds Set of files known to be relevant
 * @param analysis Graph analysis data
 * @returns Quality metrics
 */
export function computeGraphQualityMetrics(
  baselineRankings: string[],
  boostedRankings: string[],
  relevantFileIds: Set<string>,
  analysis: GraphifyAnalysis
): GraphQualityMetrics {
  // Precision@5
  const top5Boosted = boostedRankings.slice(0, 5)
  const relevantInTop5 = top5Boosted.filter(f => relevantFileIds.has(f))
  const precisionAt5 = top5Boosted.length > 0
    ? relevantInTop5.length / top5Boosted.length
    : 0

  // Recall@10
  const top10Boosted = boostedRankings.slice(0, 10)
  const relevantInTop10 = top10Boosted.filter(f => relevantFileIds.has(f))
  const recallAt10 = relevantFileIds.size > 0
    ? relevantInTop10.length / relevantFileIds.size
    : 0

  // Mean Reciprocal Rank
  let mrr = 0
  for (const file of relevantFileIds) {
    const rank = boostedRankings.indexOf(file)
    if (rank >= 0) {
      mrr += 1 / (rank + 1)
    }
  }
  const meanReciprocalRank = relevantFileIds.size > 0
    ? mrr / relevantFileIds.size
    : 0

  // Rank improvement
  let totalImprovement = 0
  let compared = 0
  for (let i = 0; i < Math.min(baselineRankings.length, 10); i++) {
    const file = baselineRankings[i]
    const newRank = boostedRankings.indexOf(file)
    if (newRank >= 0) {
      totalImprovement += i - newRank // positive = improved
      compared++
    }
  }
  const avgRankImprovement = compared > 0 ? totalImprovement / compared : 0

  // God nodes in top-5
  const godNodesInTop5 = top5Boosted.filter(f => {
    const fileName = f.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    return analysis.godNodes.some(g => {
      const gName = g.nodeId.includes(':') ? g.nodeId.split(':')[1] : g.nodeId
      return gName === fileName
    })
  }).length

  // Unique communities represented
  const communitiesInResults = new Set<string>()
  for (const file of boostedRankings) {
    const fileName = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    for (const community of analysis.communities) {
      if (community.nodes.includes(fileName)) {
        communitiesInResults.add(community.id)
      }
    }
  }

  return {
    precisionAt5: Math.round(precisionAt5 * 100) / 100,
    recallAt10: Math.round(recallAt10 * 100) / 100,
    meanReciprocalRank: Math.round(meanReciprocalRank * 1000) / 1000,
    avgRankImprovement: Math.round(avgRankImprovement * 100) / 100,
    godNodesInTop5,
    communitiesRepresented: communitiesInResults.size,
  }
}

// ── Performance Benchmarks ─────────────────────────────────────────────────

/**
 * Compute performance benchmarks for graph operations.
 *
 * @param computationTimeMs Time to compute graph analysis
 * @param cacheLoadTimeMs Time to load from cache (0 if not from cache)
 * @param cacheHit Whether this was a cache hit
 * @param analysis The graph analysis data
 * @returns Performance benchmarks
 */
export function computeGraphPerformanceBenchmarks(
  computationTimeMs: number,
  cacheLoadTimeMs: number | undefined,
  cacheHit: boolean,
  analysis: GraphifyAnalysis
): GraphPerformanceBenchmark {
  // Estimate memory usage: rough calculation
  const nodeMemory = analysis.metrics.totalNodes * 200  // ~200 bytes per node
  const edgeMemory = analysis.metrics.totalEdges * 100  // ~100 bytes per edge
  const communityMemory = analysis.communities.length * 500  // ~500 bytes per community

  return {
    computationTimeMs,
    cacheLoadTimeMs: cacheLoadTimeMs ?? 0,
    cacheHitRatio: cacheHit ? 1 : 0,
    estimatedMemoryBytes: nodeMemory + edgeMemory + communityMemory,
    nodeCount: analysis.metrics.totalNodes,
    edgeCount: analysis.metrics.totalEdges,
  }
}

// ── Graph Summary ──────────────────────────────────────────────────────────

/**
 * Generate a human-readable summary of graph analysis.
 *
 * @param analysis Graph analysis data
 * @returns Markdown summary string
 */
export function generateGraphSummary(analysis: GraphifyAnalysis): string {
  const lines: string[] = [
    '## 🔗 Graph Analysis Summary',
    '',
    `**Graph:** ${analysis.metrics.totalNodes} nodes, ${analysis.metrics.totalEdges} edges`,
    `**Density:** ${(analysis.metrics.graphDensity * 100).toFixed(2)}%`,
    `**Average Degree:** ${analysis.metrics.averageDegree.toFixed(1)}`,
  ]

  if (analysis.metrics.godNodeCount > 0) {
    lines.push('')
    lines.push(`**God Nodes (${analysis.metrics.godNodeCount}):**`)
    for (const gn of analysis.godNodes.slice(0, 5)) {
      lines.push(`  - ${gn.label} (${gn.inDegree} in, ${gn.outDegree} out, ${gn.criticality})`)
    }
    if (analysis.godNodes.length > 5) {
      lines.push(`  - ... and ${analysis.godNodes.length - 5} more`)
    }
  }

  if (analysis.metrics.communityCount > 0) {
    lines.push('')
    lines.push(`**Communities (${analysis.metrics.communityCount}):**`)
    for (const c of analysis.communities.slice(0, 5)) {
      lines.push(`  - ${c.label}: ${c.nodes.length} nodes, ` +
        `density ${(c.internalDensity * 100).toFixed(0)}%`)
    }
  }

  if (analysis.metrics.cycleCount > 0) {
    lines.push('')
    lines.push(`**Circular Dependencies:** ${analysis.metrics.cycleCount}`)
    for (const a of analysis.anomalies.filter(a => a.type === 'circular_dependency').slice(0, 3)) {
      lines.push(`  - ${a.description}`)
    }
  }

  lines.push('')
  lines.push(`**Bottlenecks:** ${analysis.metrics.bottleneckCount}`)

  return lines.join('\n')
}

// ── Aggregation ────────────────────────────────────────────────────────────

/**
 * Aggregate graph metrics across multiple sessions.
 */
export class GraphMetricsAggregator {
  private computations: number[] = []
  private cacheLoads: number[] = []
  private totalComputations = 0
  private totalCacheHits = 0
  private totalCacheMisses = 0
  private cumulativeTokenSavings = 0

  /**
   * Record a graph computation.
   */
  recordComputation(timeMs: number): void {
    this.computations.push(timeMs)
    this.totalComputations++
  }

  /**
   * Record a cache load.
   */
  recordCacheLoad(timeMs: number, hit: boolean): void {
    this.cacheLoads.push(timeMs)
    if (hit) {
      this.totalCacheHits++
    } else {
      this.totalCacheMisses++
    }
  }

  /**
   * Record token savings.
   */
  recordTokenSavings(tokens: number): void {
    this.cumulativeTokenSavings += tokens
  }

  /**
   * Get aggregated statistics.
   */
  getStats(): GraphAggregateStats {
    return {
      totalComputations: this.totalComputations,
      totalCacheHits: this.totalCacheHits,
      totalCacheMisses: this.totalCacheMisses,
      avgComputationTimeMs: this.computations.length > 0
        ? this.computations.reduce((a, b) => a + b) / this.computations.length
        : 0,
      avgCacheLoadTimeMs: this.cacheLoads.length > 0
        ? this.cacheLoads.reduce((a, b) => a + b) / this.cacheLoads.length
        : 0,
      cumulativeTokenSavings: this.cumulativeTokenSavings,
    }
  }

  /**
   * Generate a report.
   */
  generateReport(): string {
    const stats = this.getStats()
    const lines: string[] = [
      '## Graph Metrics Report',
      '',
      '### Performance',
      `Computations: ${stats.totalComputations}`,
      `Avg Computation: ${stats.avgComputationTimeMs.toFixed(0)}ms`,
      `Cache Hits: ${stats.totalCacheHits}`,
      `Cache Misses: ${stats.totalCacheMisses}`,
      `Cache Hit Ratio: ${(stats.totalComputations > 0
        ? (stats.totalCacheHits / stats.totalComputations) * 100
        : 0).toFixed(1)}%`,
      `Avg Cache Load: ${stats.avgCacheLoadTimeMs.toFixed(0)}ms`,
      '',
      '### Savings',
      `Cumulative Token Savings: ~${stats.cumulativeTokenSavings}t`,
    ]
    return lines.join('\n')
  }

  /**
   * Reset all accumulated metrics.
   */
  reset(): void {
    this.computations = []
    this.cacheLoads = []
    this.totalComputations = 0
    this.totalCacheHits = 0
    this.totalCacheMisses = 0
    this.cumulativeTokenSavings = 0
  }
}

// ── Stat Export Helpers ────────────────────────────────────────────────────

/**
 * Extract the top-K god nodes as a display-ready array.
 */
export function getTopGodNodes(analysis: GraphifyAnalysis, k: number = 5): GodNode[] {
  return [...analysis.godNodes]
    .sort((a, b) => b.pageRank - a.pageRank)
    .slice(0, k)
}

/**
 * Extract community statistics.
 */
export function getCommunityStats(analysis: GraphifyAnalysis): {
  largest: CommunityAnalysis | null
  smallest: CommunityAnalysis | null
  avgSize: number
  mostDense: CommunityAnalysis | null
  mostConnected: CommunityAnalysis | null
} {
  if (analysis.communities.length === 0) {
    return { largest: null, smallest: null, avgSize: 0, mostDense: null, mostConnected: null }
  }

  const sortedBySize = [...analysis.communities].sort((a, b) => b.nodes.length - a.nodes.length)
  const sortedByDensity = [...analysis.communities].sort((a, b) => b.internalDensity - a.internalDensity)
  const sortedByExternal = [...analysis.communities].sort((a, b) => b.externalDensity - a.externalDensity)

  return {
    largest: sortedBySize[0],
    smallest: sortedBySize[sortedBySize.length - 1],
    avgSize: sortedBySize.reduce((sum, c) => sum + c.nodes.length, 0) / sortedBySize.length,
    mostDense: sortedByDensity[0],
    mostConnected: sortedByExternal[0],
  }
}

/**
 * Compute graph health score (0-100).
 * Higher = healthier architecture.
 */
export function computeGraphHealthScore(analysis: GraphifyAnalysis): number {
  let score = 100

  // Penalty: too many god nodes indicates poor modularity
  const godNodePenalty = Math.min(20, analysis.metrics.godNodeCount * 3)
  score -= godNodePenalty

  // Penalty: cycles
  const cyclePenalty = Math.min(30, analysis.metrics.cycleCount * 10)
  score -= cyclePenalty

  // Penalty: low modularity (few communities in a large graph)
  if (analysis.metrics.totalNodes > 20 && analysis.metrics.communityCount <= 1) {
    score -= 15
  }

  // Bonus: high community density
  if (analysis.communities.length > 0) {
    const avgDensity = analysis.communities.reduce((s, c) => s + c.internalDensity, 0) / analysis.communities.length
    if (avgDensity > 0.3) score += 5
    if (avgDensity > 0.5) score += 5
  }

  // Bonus: few bottlenecks
  if (analysis.metrics.bottleneckCount === 0) score += 5

  return Math.max(0, Math.min(100, score))
}
