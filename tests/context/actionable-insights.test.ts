// tests/context/actionable-insights.test.ts
import { describe, it, expect } from 'vitest'
import { ActionableInsightsGenerator } from '../../context/actionable-insights.js'
import type { GraphifyAnalysis } from '../../context/graph-types.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

describe('ActionableInsightsGenerator', () => {
  const generator = new ActionableInsightsGenerator()

  const mockGraphAnalysis = {
    godNodes: [
      { nodeId: 'Client', label: 'Client', inDegree: 26, outDegree: 5,
        betweenness: 0, pageRank: 0.15, community: 'core', criticality: 'CRITICAL' },
      { nodeId: 'AsyncClient', label: 'AsyncClient', inDegree: 25, outDegree: 3,
        betweenness: 0, pageRank: 0.12, community: 'core', criticality: 'CRITICAL' }
    ],
    communities: [
      { id: 'auth', label: 'Auth & Security', nodes: ['authenticate', 'User'],
        size: 9, density: 0.8, cohesion: 0.9, internalDensity: 0.9, externalDensity: 0.1,
        interfaceNodes: [], bottlenecks: [], metrics: { cohesion: 0.9 } },
      { id: 'transport', label: 'Transport Layer', nodes: ['Client', 'AsyncClient'],
        size: 8, density: 0.7, cohesion: 0.8, internalDensity: 0.8, externalDensity: 0.2,
        interfaceNodes: [], bottlenecks: [], metrics: { cohesion: 0.8 } }
    ],
    surprises: [
      { sourceNodeId: 'Timeout', targetNodeId: 'URL', reason: 'cross-community connection',
        confidence: 0.8, sourceCommunity: 'transport', targetCommunity: 'utils' }
    ],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: { totalNodes: 144, totalEdges: 330, godNodeCount: 12, communityCount: 6,
      averageDegree: 4.6, maxDegree: 26, graphDensity: 0.016, avgClusteringCoeff: 0.3,
      cycleCount: 2, bottleneckCount: 1 },
    computedAt: Date.now(),
    version: '1.0.0'
  } as GraphifyAnalysis

  it('should generate workflow guidance', () => {
    const guidance = generator.generateWorkflowGuidance()

    expect(guidance).toContain('🎯 WORKFLOW OPTIMIZATION')
    expect(guidance).toContain('hashline_edit')
    expect(guidance).toContain('lsp_go_to_definition')
  })

  it('should generate risk warnings for god nodes', () => {
    const warnings = generator.generateRiskWarnings(mockGraphAnalysis.godNodes)

    expect(warnings).toContain('⚠️ HIGH-IMPACT SYMBOLS')
    expect(warnings).toContain('Client')
    expect(warnings).toContain('26 dependencies')
    expect(warnings).toContain('CRITICAL')
  })

  it('should generate architectural guidance', () => {
    const guidance = generator.generateArchitecturalGuidance(mockGraphAnalysis.communities)

    expect(guidance).toContain('🏗️ ARCHITECTURAL GUIDANCE')
    expect(guidance).toContain('Auth & Security')
    expect(guidance).toContain('safe to refactor')
  })

  it('should generate complete actionable insights', () => {
    const insights: ContextInsights = {
      editingIntent: { detected: true, targetSymbols: ['Client'], targetFiles: [],
        hasHashAnnotations: true, affectedGodNodes: ['Client'] },
      navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' },
      suboptimalPatterns: [],
      conversationContext: { recentMessages: 5, codebaseRelevant: true,
        mentionedCommunities: ['auth'], mentionedFiles: [] }
    }

    const result = generator.generate(insights, mockGraphAnalysis)

    expect(result).toContain('🎯 WORKFLOW OPTIMIZATION')
    expect(result).toContain('⚠️ HIGH-IMPACT SYMBOLS')
    expect(result).toContain('🏗️ ARCHITECTURAL GUIDANCE')
  })
})
