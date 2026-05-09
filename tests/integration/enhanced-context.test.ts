// tests/integration/enhanced-context.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionManager } from '../../manager.js'
import type { ContextEvent } from '../../types.js'

describe('Enhanced Context Intelligence Integration', () => {
  let manager: SessionManager
  let mockGraphService: any

  beforeEach(async () => {
    mockGraphService = {
      analysis: {
        godNodes: [
          { nodeId: 'Client', label: 'Client', inDegree: 26, outDegree: 5,
            betweenness: 0, pageRank: 0.15, community: 'core', criticality: 'CRITICAL' }
        ],
        communities: [
          { id: 'auth', label: 'Authentication', nodes: ['authenticate', 'User'],
            size: 5, density: 0.8, cohesion: 0.9, internalDensity: 0.9, externalDensity: 0.1,
            interfaceNodes: [], bottlenecks: [], metrics: { cohesion: 0.9 } }
        ],
        surprises: [], bottlenecks: [], anomalies: [],
        wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
        metrics: { totalNodes: 100, totalEdges: 200, godNodeCount: 1, communityCount: 1,
          averageDegree: 4, maxDegree: 26, graphDensity: 0.02, avgClusteringCoeff: 0.3,
          cycleCount: 2, bottleneckCount: 1 },
        computedAt: Date.now(),
        version: '1.0.0'
      },
      loadGraphifyAnalysis: vi.fn().mockResolvedValue(null),
      updateGraph: vi.fn().mockResolvedValue(undefined)
    }

    manager = new SessionManager()
    manager['graphService'] = mockGraphService
    await manager.start()
  })

  it('should provide enhanced context with intelligence guidance', async () => {
    const event: ContextEvent = {
      messages: [
        { role: 'user', content: 'edit the Client class constructor' },
        { role: 'assistant', content: 'I need to modify the Client class' }
      ],
      files: [],
      symbols: []
    }

    const response = await manager.handleContext(event)

    expect(response).toBeDefined()
    expect(response?.content).toContain('HIGH-IMPACT SYMBOLS')
    expect(response?.content).toContain('Client')
    expect(response?.content).toContain('WORKFLOW OPTIMIZATION')
  })

  it('should integrate pattern detection with dependency context', async () => {
    const event: ContextEvent = {
      messages: [
        { role: 'user', content: 'where is the authenticate function defined?' }
      ],
      files: [],
      symbols: []
    }

    const response = await manager.handleContext(event)

    expect(response?.content).toContain('RECOMMENDED TOOLS')
    expect(response?.content).toContain('lsp_go_to_definition')
  })

  it('should maintain backward compatibility', async () => {
    const event: ContextEvent = {
      messages: [],
      files: [],
      symbols: []
    }

    const response = await manager.handleContext(event)

    // Should still work without intelligence when no conversation context
    expect(response).toBeDefined()
  })
})
