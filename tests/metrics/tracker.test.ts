import { describe, expect, it } from 'vitest'
import type { GraphAnalysis } from '../../context/graph-types.js'
import { buildGraphMetricsSummary } from '../../metrics/graph-metrics.js'
import { SessionStats } from '../../metrics/tracker.js'

function minimalAnalysis(): GraphAnalysis {
  return {
    godNodes: [],
    communities: [{ id: 'c1', label: 'C1', nodes: ['n1'], internalDensity: 0.8, externalDensity: 0.1, interfaceNodes: [], bottlenecks: [] }],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 10,
      totalEdges: 12,
      godNodeCount: 1,
      communityCount: 1,
      averageDegree: 2,
      maxDegree: 4,
      graphDensity: 0.1,
      avgClusteringCoeff: 0.2,
      cycleCount: 0,
      bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
  }
}

// Validation helper: SessionRecord includes all new token fields
type HasNewFields = {
  graphInsightsTokens?: number
  intelligenceTokens?: number
  smartDepContextTokens?: number
}

describe('SessionStats – guidance token tracking', () => {
  it('recordGraphInsightsInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordGraphInsightsInjection(120)
    expect((stats as unknown as HasNewFields).graphInsightsTokens).toBe(120)
  })

  it('recordIntelligenceInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordIntelligenceInjection(80)
    stats.recordIntelligenceInjection(60)
    expect((stats as unknown as HasNewFields).intelligenceTokens).toBe(140)
  })

  it('recordSmartDepContextInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordSmartDepContextInjection(50)
    expect((stats as unknown as HasNewFields).smartDepContextTokens).toBe(50)
  })

  it('toRecord includes all new token fields', () => {
    const stats = new SessionStats('test-session')
    // Cast to access new methods
    const s = stats as unknown as {
      recordGraphInsightsInjection: (n: number) => void
      recordIntelligenceInjection: (n: number) => void
      recordSmartDepContextInjection: (n: number) => void
      toRecord: () => HasNewFields
    }
    s.recordGraphInsightsInjection(100)
    s.recordIntelligenceInjection(90)
    s.recordSmartDepContextInjection(70)
    const record = s.toRecord()
    expect(record.graphInsightsTokens).toBe(100)
    expect(record.intelligenceTokens).toBe(90)
    expect(record.smartDepContextTokens).toBe(70)
  })

  it('toRecord includes graph metrics and session duration fields', () => {
    const stats = new SessionStats('test-session')
    const summary = buildGraphMetricsSummary(minimalAnalysis(), 42, true)
    stats.recordGraphMetrics(summary)
    stats.recordRepoMapInjection(100)
    stats.recordIntelligenceInjection(50)
    stats.recordCommunityPrune(3)

    const record = stats.toRecord()
    expect(record.graphQualityScore).toBe(summary.quality.score)
    expect(record.graphAnalysisMs).toBe(42)
    expect(record.graphCacheHit).toBe(true)
    expect(record.totalInjectionTokens).toBe(150)
    expect(record.communityPruneCount).toBe(3)
    expect(record.sessionDurationMs).toBeGreaterThanOrEqual(0)
  })

  it('fires onMilestone exactly once per threshold', () => {
    const stats = new SessionStats('test-session')
    const fired: number[] = []
    stats.onMilestone = (t) => fired.push(t)
    stats.recordDepContextInjection(['/a.ts'], 100, 700)
    expect(fired).toEqual([500])
    stats.recordDepContextInjection(['/b.ts'], 50, 350)
    expect(fired).toEqual([500])
    stats.recordDepContextInjection(['/c.ts'], 50, 1200)
    expect(fired).toEqual([500, 2_000])
  })

  it('getTopFiles returns sorted mention counts', () => {
    const stats = new SessionStats('test-session')
    stats.recordDepContextInjection(['/a.ts'], 10, 100)
    stats.recordDepContextInjection(['/b.ts'], 10, 100)
    stats.recordDepContextInjection(['/a.ts'], 10, 100)

    const top = stats.getTopFiles(2)
    expect(top[0].file).toBe('/a.ts')
    expect(top[0].mentions).toBe(2)
  })
})
