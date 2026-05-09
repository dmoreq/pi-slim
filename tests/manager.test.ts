import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { GraphifyAnalysis } from '../context/graph-types.js'
import { ContextIntelligenceEngine } from '../context/intelligence-engine.js'
import { SessionManager } from '../manager.js'

describe('SessionManager Intelligence Integration', () => {
  let manager: SessionManager
  let mockGraphService: {
    analysis: GraphifyAnalysis | null
    loadGraphifyAnalysis: ReturnType<typeof vi.fn>
    updateGraph: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockGraphService = {
      analysis: null,
      loadGraphifyAnalysis: vi.fn().mockResolvedValue(null),
      updateGraph: vi.fn().mockResolvedValue(undefined),
    }
    manager = new SessionManager('/test/workspace')
    ;(manager as unknown as { graphService: typeof mockGraphService }).graphService = mockGraphService
  })

  it('should initialize intelligence engine on creation', () => {
    expect(
      (manager as unknown as { intelligenceEngine: ContextIntelligenceEngine })
        .intelligenceEngine,
    ).toBeInstanceOf(ContextIntelligenceEngine)
  })

  it('should analyze conversation context with messages', async () => {
    const messages = [
      { role: 'user', content: 'edit the authenticate function' },
      { role: 'assistant', content: 'I need to modify the Client class' },
    ]

    manager.addMessages(messages)
    const insights = await manager.analyzeCurrentContext()

    expect(insights.editingIntent.detected).toBe(true)
    expect(insights.editingIntent.targetSymbols).toContain('authenticate')
  })

  it('should generate actionable guidance when available', async () => {
    const mockAnalysis: Partial<GraphifyAnalysis> & {
      godNodes: GraphifyAnalysis['godNodes']
      communities: GraphifyAnalysis['communities']
    } = {
      godNodes: [
        {
          nodeId: 'Client',
          label: 'Client',
          inDegree: 26,
          outDegree: 5,
          betweenness: 0,
          pageRank: 0,
          community: '',
          criticality: 'CRITICAL',
        },
      ],
      communities: [],
    }

    mockGraphService.loadGraphifyAnalysis.mockResolvedValue(mockAnalysis as GraphifyAnalysis)

    const messages = [{ role: 'user', content: 'modify the Client class constructor' }]

    manager.addMessages(messages)
    const guidance = await manager.generateIntelligentGuidance()

    expect(guidance).toContain('HIGH-IMPACT SYMBOLS')
    expect(guidance).toContain('Client')
  })

  it('should inject intelligence into context responses', async () => {
    const messages = [{ role: 'user', content: 'edit the authenticate function' }]

    manager.addMessages(messages)
    const context = await manager.getEnhancedContextResponse()

    expect(context).toContain('WORKFLOW OPTIMIZATION')
    expect(context).toContain('hashline_edit')
  })
})
