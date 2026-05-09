import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { GraphifyAnalysis } from '../context/graph-types.js'
import { ContextIntelligenceEngine } from '../context/intelligence-engine.js'
import type { ExtensionContext } from '../manager.js'
import { SessionManager } from '../manager.js'

function ctxStub(): ExtensionContext {
  return {
    cwd: '/test',
    ui: { notify: () => {}, setStatus: () => {} },
    hasUI: false,
    getSystemPrompt: () => '',
    sessionManager: { getSessionId: () => 'test-session' },
  }
}

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

describe('SessionManager Intelligence Integration - Error Handling', () => {
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

  it('should handle graph resolution failures gracefully', async () => {
    mockGraphService.loadGraphifyAnalysis.mockRejectedValue(new Error('Graph load failed'))

    const messages = [{ role: 'user', content: 'edit function' }]
    manager.addMessages(messages)

    const insights = await manager.analyzeCurrentContext()
    expect(insights.editingIntent.detected).toBe(true)
  })

  it('should handle handleContext message sync', async () => {
    const event = {
      type: 'context' as const,
      messages: [
        { role: 'user', content: 'initial message' },
        { role: 'assistant', content: 'response' },
      ],
    }

    await manager.handleContext(event, ctxStub())

    const insights = await manager.analyzeCurrentContext()
    expect(insights.conversationContext.recentMessages).toBeGreaterThan(0)
    expect(insights.conversationContext.recentMessages).toBe(2)
  })

  it('should limit message buffer growth', () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({
      role: 'user' as const,
      content: `message ${i}`,
    }))

    manager.addMessages(messages)

    expect(
      (manager as unknown as { conversationMessages: unknown[] }).conversationMessages.length,
    ).toBe(100)
  })

  it('analyzeCurrentContext falls back when primary analysis throws', async () => {
    const original = ContextIntelligenceEngine.prototype.analyzeConversationContext
    const spy = vi
      .spyOn(ContextIntelligenceEngine.prototype, 'analyzeConversationContext')
      .mockImplementationOnce(() => {
        throw new Error('simulate analysis failure')
      })
      .mockImplementation(function (this: ContextIntelligenceEngine, messages, ga) {
        return original.call(this, messages, ga)
      })

    manager.addMessages([{ role: 'user', content: 'edit something' }])

    const insights = await manager.analyzeCurrentContext()
    expect(insights.editingIntent.detected).toBe(true)
    spy.mockRestore()
  })

  it('generateIntelligentGuidance survives graph loader rejection', async () => {
    mockGraphService.loadGraphifyAnalysis.mockRejectedValue(new Error('Graph load failed'))
    mockGraphService.analysis = null
    manager.addMessages([{ role: 'user', content: 'edit the authenticate function' }])

    const guidance = await manager.generateIntelligentGuidance()
    expect(guidance.length).toBeGreaterThan(0)
    expect(guidance).toContain('WORKFLOW OPTIMIZATION')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
