/**
 * Graph Metrics — compute token savings, quality metrics, and performance
 * benchmarks from graph analysis results.
 *
 * These metrics feed:
 *   - Telemetry reporting in TelemetryService
 *   - Status-bar display in notifications.ts
 *   - Session-stats recording in SessionStats
 *   - Debug logging in SessionManager.loadGraph()
 */

import type { GraphAnalysis } from '../context/graph-types.js'

// ── Type Definitions ───────────────────────────────────────────────────────

/** Quality metrics derived from the graph structure. */
export interface GraphQualityMetrics {
  /** Total god-node count (high-centrality symbols). */
  godNodeCount: number
  /** Number of detected communities (modules / clusters). */
  communityCount: number
  /** Total circular dependency cycles. */
  cycleCount: number
  /** Number of bottleneck nodes (high betweenness). */
  bottleneckCount: number
  /** Surprising / cross-community connections found. */
  surpriseCount: number
  /** Graph density: edges / (nodes × (nodes − 1)). 0–1. */
  density: number
  /** Average node degree (in + out). */
  avgDegree: number
  /**
   * Composite quality score 0–100.
   * Rewards clear community structure; penalises cycles and excessive god nodes.
   */
  score: number
}

/** Performance characteristics of the analysis run. */
export interface GraphPerformanceMetrics {
  nodeCount: number
  edgeCount: number
  /** Wall-clock milliseconds the analysis took. */
  analysisMs: number
  /** True when the result was served from disk cache. */
  cacheHit: boolean
  /** Nodes processed per millisecond (0 when analysisMs = 0). */
  throughput: number
}

/** Estimated token-cost impact of graph-prioritised context injection. */
export interface GraphTokenMetrics {
  /**
   * Fraction of graph nodes that are god nodes (0–1).
   * High values mean the graph is dominated by a few heavy hitters.
   */
  godNodeCoverage: number
  /**
   * Fraction of communities that are "active" given the current conversation.
   * Lower is better: the context engine can skip inactive communities entirely.
   */
  activeCommunityRatio: number
  /**
   * Rough upper-bound token savings estimate.
   * Heuristic: each inactive community saves ~50 skeletons × 80 tokens each.
   */
  estimatedSavings: number
}

/** Combined summary used in telemetry and status bar. */
export interface GraphMetricsSummary {
  quality: GraphQualityMetrics
  performance: GraphPerformanceMetrics
  token: GraphTokenMetrics
}

// ── Computation ────────────────────────────────────────────────────────────

/**
 * Derive quality metrics from a completed graph analysis.
 */
export function computeGraphQualityMetrics(analysis: GraphAnalysis): GraphQualityMetrics {
  const {
    totalNodes,
    godNodeCount,
    communityCount,
    cycleCount,
    bottleneckCount,
    graphDensity,
    averageDegree,
  } = analysis.metrics
  const surpriseCount = analysis.surprises.length

  // Quality score: start at 100, subtract for structural problems.
  let score = 100
  // Each cycle costs 2 pts (cap −40)
  score -= Math.min(cycleCount * 2, 40)
  // Each god node costs 1 pt (cap −20)
  score -= Math.min(godNodeCount, 20)
  // Each community beyond 1 adds +1 (cap +10) — structure is good
  score += Math.min(Math.max(0, communityCount - 1), 10)
  score = Math.max(0, Math.min(100, score))

  return {
    godNodeCount,
    communityCount,
    cycleCount,
    bottleneckCount,
    surpriseCount,
    density: graphDensity,
    avgDegree: averageDegree,
    score,
  }
}

/**
 * Build performance metrics for a completed analysis run.
 *
 * @param analysis     The completed analysis result
 * @param analysisMs   Wall-clock time in milliseconds
 * @param cacheHit     Whether the result was served from disk cache
 */
export function computeGraphPerformanceMetrics(
  analysis: GraphAnalysis,
  analysisMs: number,
  cacheHit: boolean
): GraphPerformanceMetrics {
  const { totalNodes, totalEdges } = analysis.metrics
  const throughput = analysisMs > 0 ? Math.round(totalNodes / analysisMs) : 0
  return { nodeCount: totalNodes, edgeCount: totalEdges, analysisMs, cacheHit, throughput }
}

/**
 * Estimate token savings from community-based context filtering.
 *
 * @param analysis             The completed analysis
 * @param activeCommunityCount How many communities are currently "in focus"
 */
export function computeGraphTokenMetrics(
  analysis: GraphAnalysis,
  activeCommunityCount = 1
): GraphTokenMetrics {
  const { godNodeCount, communityCount, totalNodes } = analysis.metrics

  const godNodeCoverage = totalNodes > 0 ? godNodeCount / totalNodes : 0
  const activeCommunityRatio = communityCount > 0 ? activeCommunityCount / communityCount : 1

  // Heuristic: inactive communities each skip ~50 skeletons × 80 tokens
  const inactiveCommunities = Math.max(0, communityCount - activeCommunityCount)
  const estimatedSavings = inactiveCommunities * 50 * 80

  return { godNodeCoverage, activeCommunityRatio, estimatedSavings }
}

/**
 * Build the full summary in one call — convenience wrapper used by `loadGraph()`.
 */
export function buildGraphMetricsSummary(
  analysis: GraphAnalysis,
  analysisMs: number,
  cacheHit: boolean,
  activeCommunityCount = 1
): GraphMetricsSummary {
  return {
    quality: computeGraphQualityMetrics(analysis),
    performance: computeGraphPerformanceMetrics(analysis, analysisMs, cacheHit),
    token: computeGraphTokenMetrics(analysis, activeCommunityCount),
  }
}

/**
 * Format a `GraphMetricsSummary` as a multi-line string suitable for debug logs.
 */
/** Single-line quality summary for notifications and status bar. */
export function formatGraphQualityOneLine(summary: GraphMetricsSummary): string {
  const { quality, performance } = summary
  const analysis = performance.cacheHit ? 'cache' : `${performance.analysisMs}ms`
  let line = `Graph quality ${quality.score}/100 · ${analysis}`
  if (quality.cycleCount > 0) {
    line += ` · ${quality.cycleCount} cycle${quality.cycleCount === 1 ? '' : 's'}`
  }
  return line
}

export function formatGraphMetricsSummary(summary: GraphMetricsSummary): string {
  const { quality, performance, token } = summary
  const lines: string[] = [
    '── Graph Metrics ─────────────────────────────────',
    `  Quality score     : ${quality.score}/100`,
    `  Nodes / Edges     : ${performance.nodeCount} / ${performance.edgeCount}`,
    `  Communities       : ${quality.communityCount}`,
    `  God nodes         : ${quality.godNodeCount}`,
  ]
  if (quality.cycleCount > 0) {
    lines.push(`  Cycles            : ${quality.cycleCount} ⚠`)
  }
  if (quality.surpriseCount > 0) {
    lines.push(`  Surprises         : ${quality.surpriseCount}`)
  }
  lines.push(
    `  Analysis          : ${performance.cacheHit ? 'cache hit' : `${performance.analysisMs}ms fresh`}`,
    `  God-node coverage : ${Math.round(token.godNodeCoverage * 100)}%`,
    `  Est. token savings: ~${token.estimatedSavings}t`,
    '─────────────────────────────────────────────────'
  )
  return lines.join('\n')
}
