import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GodNode, GraphAnalysis } from '../context/graph-types.js'
import { ContextIntelligenceEngine } from '../context/intelligence-engine.js'
import type { ExtensionContext } from '../manager.js'
import { SessionManager, buildRepoMapSource, formatGraphInsightsSection } from '../manager.js'
import type { ContextInsights } from '../shared/intelligence-types.js'

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
    analysis: GraphAnalysis | null
    updateGraph: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockGraphService = {
      analysis: null,
      updateGraph: vi.fn().mockResolvedValue(undefined),
      graph: null,
    }
    manager = new SessionManager('/test/workspace')
    ;(manager as unknown as { graphService: typeof mockGraphService }).graphService = mockGraphService
  })

  it('should initialize intelligence engine on creation', () => {
    expect((manager as unknown as { intelligenceEngine: ContextIntelligenceEngine }).intelligenceEngine).toBeInstanceOf(
      ContextIntelligenceEngine
    )
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
    const mockAnalysis: Partial<GraphAnalysis> & {
      godNodes: GraphAnalysis['godNodes']
      communities: GraphAnalysis['communities']
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

    mockGraphService.analysis = mockAnalysis as GraphAnalysis

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
    analysis: GraphAnalysis | null
    updateGraph: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockGraphService = {
      analysis: null,
      updateGraph: vi.fn().mockResolvedValue(undefined),
      graph: null,
    }
    manager = new SessionManager('/test/workspace')
    ;(manager as unknown as { graphService: typeof mockGraphService }).graphService = mockGraphService
  })

  it('should handle graph resolution failures gracefully', async () => {
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

    expect((manager as unknown as { conversationMessages: unknown[] }).conversationMessages.length).toBe(100)
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
    mockGraphService.analysis = null
    manager.addMessages([{ role: 'user', content: 'edit the authenticate function' }])

    const guidance = await manager.generateIntelligentGuidance()
    expect(guidance.length).toBeGreaterThan(0)
    expect(guidance).toContain('WORKFLOW OPTIMIZATION')
  })
})

function makeAnalysis(overrides?: Partial<GraphAnalysis>): GraphAnalysis {
  return {
    godNodes: [],
    communities: [],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 5,
      totalEdges: 8,
      godNodeCount: 1,
      communityCount: 2,
      averageDegree: 3,
      maxDegree: 5,
      graphDensity: 0.4,
      avgClusteringCoeff: 0.3,
      cycleCount: 1,
      bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
    ...overrides,
  }
}

const mockInsights: ContextInsights = {
  editingIntent: {
    detected: false,
    targetSymbols: [],
    targetFiles: [],
    hasHashAnnotations: false,
    affectedGodNodes: [],
  },
  navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' as const },
  suboptimalPatterns: [],
  conversationContext: { recentMessages: 0, codebaseRelevant: false, mentionedCommunities: [], mentionedFiles: [] },
}

describe('buildRepoMapSource', () => {
  it('applies smart enhancement when graph is non-null', () => {
    const analysis = makeAnalysis()
    const source = buildRepoMapSource('# repo', mockInsights, analysis)
    const content = source.produce()
    expect(content).toBeDefined()
    expect(typeof content).toBe('string')
  })

  it('returns raw base map when graph is null', () => {
    const source = buildRepoMapSource('# raw-repo-map', mockInsights, null)
    expect(source.produce()).toBe('# raw-repo-map')
  })

  it('returns null when baseMap is empty', () => {
    const source = buildRepoMapSource('', mockInsights, null)
    expect(source.produce()).toBeNull()
  })

  it('registers with name=repo-map and priority=1', () => {
    const source = buildRepoMapSource('# map', mockInsights, null)
    expect(source.name).toBe('repo-map')
    expect(source.priority).toBe(1)
  })
})

describe('formatGraphInsightsSection', () => {
  it('includes node/edge/community counts', () => {
    const result = formatGraphInsightsSection(makeAnalysis())
    expect(result).toContain('5 nodes')
    expect(result).toContain('8 edges')
    expect(result).toContain('2 communities')
  })

  it('includes cycle count when cycles exist', () => {
    const result = formatGraphInsightsSection(makeAnalysis())
    expect(result).toContain('Circular Dependencies')
    expect(result).toContain('1')
  })

  it('includes god node labels when present', () => {
    const godNode: GodNode = {
      nodeId: 'svc',
      label: 'MyService',
      criticality: 'CRITICAL',
      inDegree: 12,
      outDegree: 3,
      betweenness: 0.7,
      pageRank: 0.9,
      community: 'core',
    }
    const result = formatGraphInsightsSection(makeAnalysis({ godNodes: [godNode] }))
    expect(result).toContain('MyService')
    expect(result).toContain('12 in')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
