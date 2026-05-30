import { describe, expect, it } from 'vitest'
import { formatGraphPulse } from '../../context/graph-pulse.js'
import type { GraphAnalysis, GodNode } from '../../context/graph-types.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

const god: GodNode = {
  nodeId: 'file:src/hub.ts:Hub',
  label: 'Hub',
  criticality: 'CRITICAL',
  inDegree: 10,
  outDegree: 1,
  betweenness: 0.5,
  pageRank: 0.8,
  community: 'core',
}

const analysis = {
  godNodes: [god],
  communities: [{ id: 'core', label: 'Core', nodes: ['file:src/hub.ts'], cohesion: 0.5 }],
  surprises: [],
  bottlenecks: [],
  anomalies: [],
  graph: { nodes: [], edges: [] },
  metrics: {
    totalNodes: 2,
    totalEdges: 1,
    communityCount: 1,
    cycleCount: 0,
    godNodeCount: 1,
    bottleneckCount: 0,
    surpriseCount: 0,
    density: 0,
    avgDegree: 0,
  },
} as GraphAnalysis

const baseInsights: ContextInsights = {
  editingIntent: { detected: true, targetSymbols: ['Hub'], affectedGodNodes: [], hasHashAnnotations: false },
  navigationRequests: { detected: false, requestedSymbols: [], requestType: 'unknown' },
  suboptimalPatterns: [],
  conversationContext: { isExploratory: false, isFocused: true, topicShifts: 0 },
  compilerErrors: [],
}

describe('formatGraphPulse', () => {
  it('returns compact block with god node when editing', () => {
    const text = formatGraphPulse({ analysis, insights: baseInsights })
    expect(text).toContain('Graph pulse')
    expect(text).toContain('Hub')
    expect(text).toContain('lsp_find_references')
  })

  it('includes cycle warning when provided', () => {
    const text = formatGraphPulse({
      analysis,
      insights: baseInsights,
      cycleWarning: 'Circular dependency involves in-focus file(s)',
    })
    expect(text).toContain('Cycle')
  })

  it('returns null when nothing to show', () => {
    const empty = {
      ...analysis,
      godNodes: [],
      communities: [],
    } as GraphAnalysis
    expect(formatGraphPulse({ analysis: empty, insights: baseInsights })).toBeNull()
  })
})
