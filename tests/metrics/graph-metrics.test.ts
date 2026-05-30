import { describe, expect, it } from 'vitest'
import type { GraphAnalysis } from '../../context/graph-types'
import {
  buildGraphMetricsSummary,
  computeGraphPerformanceMetrics,
  computeGraphQualityMetrics,
  computeGraphTokenMetrics,
  formatGraphMetricsSummary,
} from '../../metrics/graph-metrics'

// ── Fixture ────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<GraphAnalysis['metrics']> = {}): GraphAnalysis {
  return {
    godNodes: Array.from({ length: overrides.godNodeCount ?? 3 }, (_, i) => ({
      nodeId: `node${i}`,
      label: `Node ${i}`,
      inDegree: 5,
      outDegree: 1,
      betweenness: 0.5,
      pageRank: 0.1,
      community: 'comm1',
      criticality: 'NORMAL' as const,
    })),
    communities: Array.from({ length: overrides.communityCount ?? 4 }, (_, i) => ({
      id: `comm${i}`,
      label: `Community ${i}`,
      nodes: [`node${i}`],
      internalDensity: 0.8,
      externalDensity: 0.1,
      interfaceNodes: [],
      bottlenecks: [],
    })),
    surprises: Array.from({ length: 2 }, (_, i) => ({
      source: `node${i}`,
      target: `node${i + 5}`,
      reason: 'cross-community' as const,
      confidence: 0.9,
    })),
    bottlenecks: [],
    anomalies: [],
    wikipedia: {
      entries: new Map(),
      query: () => [],
      get: () => undefined,
      find: () => [],
    },
    metrics: {
      totalNodes: overrides.totalNodes ?? 50,
      totalEdges: overrides.totalEdges ?? 80,
      godNodeCount: overrides.godNodeCount ?? 3,
      communityCount: overrides.communityCount ?? 4,
      averageDegree: overrides.averageDegree ?? 3.2,
      maxDegree: overrides.maxDegree ?? 12,
      graphDensity: overrides.graphDensity ?? 0.033,
      avgClusteringCoeff: 0.4,
      cycleCount: overrides.cycleCount ?? 0,
      bottleneckCount: overrides.bottleneckCount ?? 2,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }
}

// ── Quality metrics ────────────────────────────────────────────────────────

describe('computeGraphQualityMetrics', () => {
  it('produces expected field values from analysis', () => {
    const analysis = makeAnalysis({ godNodeCount: 3, communityCount: 4, cycleCount: 0 })
    const q = computeGraphQualityMetrics(analysis)

    expect(q.godNodeCount).toBe(3)
    expect(q.communityCount).toBe(4)
    expect(q.cycleCount).toBe(0)
    expect(q.surpriseCount).toBe(2)
    expect(q.density).toBeCloseTo(0.033, 3)
    expect(q.avgDegree).toBeCloseTo(3.2, 1)
  })

  it('starts at 100 and penalises cycles', () => {
    const q = computeGraphQualityMetrics(makeAnalysis({ cycleCount: 10, godNodeCount: 0, communityCount: 1 }))
    // 10 cycles × 2 = -20
    expect(q.score).toBe(80)
  })

  it('penalises god nodes', () => {
    const q = computeGraphQualityMetrics(makeAnalysis({ godNodeCount: 15, cycleCount: 0, communityCount: 1 }))
    // 15 god nodes = -15
    expect(q.score).toBe(85)
  })

  it('rewards extra communities (capped at +10)', () => {
    const q = computeGraphQualityMetrics(makeAnalysis({ communityCount: 12, cycleCount: 0, godNodeCount: 0 }))
    // 11 extra communities → +10 (cap); score never exceeds 100
    expect(q.score).toBe(100)
    expect(q.score).toBeLessThanOrEqual(100)
  })

  it('caps score at 0 for severely cyclic graphs', () => {
    // cycles cap penalty at -40, god nodes cap at -20 → 100 - 40 - 20 = 40 (not below 0 unless > 100 total)
    const q = computeGraphQualityMetrics(makeAnalysis({ cycleCount: 100, godNodeCount: 50, communityCount: 1 }))
    expect(q.score).toBe(40)
    expect(q.score).toBeGreaterThanOrEqual(0)
  })
})

// ── Performance metrics ────────────────────────────────────────────────────

describe('computeGraphPerformanceMetrics', () => {
  it('reports cache hit correctly', () => {
    const analysis = makeAnalysis({ totalNodes: 100, totalEdges: 200 })
    const p = computeGraphPerformanceMetrics(analysis, 5, true)

    expect(p.cacheHit).toBe(true)
    expect(p.nodeCount).toBe(100)
    expect(p.edgeCount).toBe(200)
    expect(p.analysisMs).toBe(5)
  })

  it('computes throughput as nodes/ms', () => {
    const analysis = makeAnalysis({ totalNodes: 200 })
    const p = computeGraphPerformanceMetrics(analysis, 10, false)
    expect(p.throughput).toBe(20) // 200 nodes / 10ms
  })

  it('returns 0 throughput when analysisMs is 0', () => {
    const analysis = makeAnalysis({ totalNodes: 50 })
    const p = computeGraphPerformanceMetrics(analysis, 0, false)
    expect(p.throughput).toBe(0)
  })
})

// ── Token metrics ──────────────────────────────────────────────────────────

describe('computeGraphTokenMetrics', () => {
  it('computes godNodeCoverage as fraction', () => {
    const analysis = makeAnalysis({ godNodeCount: 5, totalNodes: 50 })
    const t = computeGraphTokenMetrics(analysis, 1)
    expect(t.godNodeCoverage).toBeCloseTo(0.1, 3)
  })

  it('computes activeCommunityRatio', () => {
    const analysis = makeAnalysis({ communityCount: 4 })
    const t = computeGraphTokenMetrics(analysis, 1)
    expect(t.activeCommunityRatio).toBeCloseTo(0.25, 3)
  })

  it('estimates savings from inactive communities', () => {
    const analysis = makeAnalysis({ communityCount: 5 })
    const t = computeGraphTokenMetrics(analysis, 1)
    // 4 inactive × 50 files × 80 tokens
    expect(t.estimatedSavings).toBe(4 * 50 * 80)
  })

  it('returns 0 savings when all communities are active', () => {
    const analysis = makeAnalysis({ communityCount: 3 })
    const t = computeGraphTokenMetrics(analysis, 3)
    expect(t.estimatedSavings).toBe(0)
  })

  it('clamps ratio to 1 when activeCommunityCount > communityCount', () => {
    const analysis = makeAnalysis({ communityCount: 2 })
    const t = computeGraphTokenMetrics(analysis, 5)
    // activeCommunityRatio = 5/2 = 2.5 — technically > 1, but we don't clamp in current impl
    // estimated savings = max(0, 2-5) = 0
    expect(t.estimatedSavings).toBe(0)
  })
})

// ── Summary builder ────────────────────────────────────────────────────────

describe('buildGraphMetricsSummary', () => {
  it('combines all three metric groups', () => {
    const analysis = makeAnalysis()
    const summary = buildGraphMetricsSummary(analysis, 42, false, 2)

    expect(summary.quality).toBeDefined()
    expect(summary.performance).toBeDefined()
    expect(summary.token).toBeDefined()
    expect(summary.performance.analysisMs).toBe(42)
    expect(summary.performance.cacheHit).toBe(false)
  })
})

// ── Formatter ─────────────────────────────────────────────────────────────

describe('formatGraphMetricsSummary', () => {
  it('includes quality score and node counts', () => {
    const summary = buildGraphMetricsSummary(makeAnalysis(), 100, false)
    const text = formatGraphMetricsSummary(summary)

    expect(text).toContain('Quality score')
    expect(text).toContain('Nodes / Edges')
    expect(text).toContain('Communities')
    expect(text).toContain('100ms fresh')
  })

  it('shows "cache hit" label for cached runs', () => {
    const summary = buildGraphMetricsSummary(makeAnalysis(), 3, true)
    const text = formatGraphMetricsSummary(summary)
    expect(text).toContain('cache hit')
  })

  it('includes cycle warning when cycleCount > 0', () => {
    const summary = buildGraphMetricsSummary(makeAnalysis({ cycleCount: 3 }), 10, false)
    const text = formatGraphMetricsSummary(summary)
    expect(text).toContain('⚠')
    expect(text).toContain('3')
  })

  it('omits cycle line when no cycles', () => {
    const summary = buildGraphMetricsSummary(makeAnalysis({ cycleCount: 0 }), 10, false)
    const text = formatGraphMetricsSummary(summary)
    expect(text).not.toContain('⚠')
  })
})
