// tests/context/intelligence-engine.test.ts
import { describe, it, expect } from 'vitest'
import { ContextIntelligenceEngine } from '../../context/intelligence-engine.js'
import type { AgentMessage } from '../../shared/agent-message.js'
import type {
  GraphifyAnalysis,
  CommunityAnalysis,
  GodNode,
} from '../../context/graph-types.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

describe('ContextIntelligenceEngine', () => {
  const engine = new ContextIntelligenceEngine()

  const godClient: GodNode = {
    nodeId: 'Client',
    label: 'Client',
    inDegree: 26,
    outDegree: 5,
    betweenness: 0,
    pageRank: 0.15,
    community: 'core',
    criticality: 'CRITICAL',
  }

  const communityAuth: CommunityAnalysis = {
    id: 'auth',
    label: 'Authentication',
    nodes: ['authenticate', 'User'],
    internalDensity: 0.8,
    externalDensity: 0.25,
    interfaceNodes: [],
    bottlenecks: [],
    metrics: { cohesion: 0.91 },
  }

  const mockGraphAnalysis: GraphifyAnalysis = {
    godNodes: [godClient],
    communities: [communityAuth],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: {
      entries: new Map(),
      query: () => [],
      get: () => undefined,
      find: () => [],
    },
    metrics: {
      totalNodes: 100,
      totalEdges: 200,
      godNodeCount: 3,
      communityCount: 4,
      averageDegree: 4,
      maxDegree: 26,
      graphDensity: 0.02,
      avgClusteringCoeff: 0.3,
      cycleCount: 2,
      bottleneckCount: 1,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }

  it('should analyze conversation context', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'edit the authenticate function' },
      { role: 'assistant', content: 'I need to modify the Client class' },
    ]

    const insights = engine.analyzeConversationContext(messages)

    expect(insights.editingIntent.detected).toBe(true)
    expect(insights.editingIntent.targetSymbols).toContain('authenticate')
    expect(insights.conversationContext.codebaseRelevant).toBe(true)
  })

  it('should populate affectedGodNodes when graph analysis is supplied', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'modify the Client class constructor' },
    ]

    const insights = engine.analyzeConversationContext(
      messages,
      mockGraphAnalysis,
    )

    expect(insights.editingIntent.affectedGodNodes).toContain('Client')
  })

  it('should generate actionable guidance from insights', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: true,
        targetSymbols: ['Client'],
        targetFiles: [],
        hasHashAnnotations: true,
        affectedGodNodes: ['Client'],
      },
      navigationRequests: {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 3,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const guidance = engine.generateActionableGuidance(insights, mockGraphAnalysis)

    expect(guidance).toContain('HIGH-IMPACT SYMBOLS')
    expect(guidance).toContain('Client')
    expect(guidance).toContain('hashline_edit')
  })

  it('should detect when agent affects god nodes', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'modify the Client class constructor' },
    ]

    const insights = engine.analyzeConversationContext(messages)
    const detectedGodNodes = engine.detectAffectedGodNodes(
      insights.editingIntent,
      mockGraphAnalysis,
    )

    expect(detectedGodNodes).toContain('Client')
  })

  it('should not substring-match short transcript symbols to god nodes', () => {
    const editing = {
      detected: true as const,
      targetSymbols: ['xyz'],
      targetFiles: [] as string[],
      hasHashAnnotations: false,
      affectedGodNodes: [] as string[],
    }

    expect(
      engine.detectAffectedGodNodes(editing, mockGraphAnalysis),
    ).not.toContain('Client')
  })
})

describe('ContextIntelligenceEngine comprehensive tests', () => {
  const engine = new ContextIntelligenceEngine()

  const godClient: GodNode = {
    nodeId: 'Client',
    label: 'Client',
    inDegree: 26,
    outDegree: 5,
    betweenness: 0,
    pageRank: 0.15,
    community: 'core',
    criticality: 'CRITICAL',
  }

  const communityAuth: CommunityAnalysis = {
    id: 'auth',
    label: 'Authentication',
    nodes: ['authenticate', 'User'],
    internalDensity: 0.82,
    externalDensity: 0.22,
    interfaceNodes: ['authenticate'],
    bottlenecks: [],
    metrics: { cohesion: 0.91 },
  }

  const mockGraphAnalysis: GraphifyAnalysis = {
    godNodes: [godClient],
    communities: [communityAuth],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: {
      entries: new Map(),
      query: () => [],
      get: () => undefined,
      find: () => [],
    },
    metrics: {
      totalNodes: 100,
      totalEdges: 200,
      godNodeCount: 1,
      communityCount: 1,
      averageDegree: 4,
      maxDegree: 26,
      graphDensity: 0.02,
      avgClusteringCoeff: 0.3,
      cycleCount: 2,
      bottleneckCount: 1,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }

  it('should handle guidance generation without graph analysis', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: true,
        targetSymbols: ['authenticate'],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      },
      navigationRequests: {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      },
      suboptimalPatterns: [
        {
          type: 'tool_usage',
          pattern: 'basic_edit',
          recommendation: 'Use hashline_edit',
          confidence: 0.8,
          context: 'test',
        },
      ],
      conversationContext: {
        recentMessages: 2,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const guidance = engine.generateActionableGuidance(insights, null)

    expect(guidance).toContain('WORKFLOW OPTIMIZATION')
    expect(guidance).toContain('OPTIMIZATION SUGGESTIONS')
    expect(guidance).toContain('Use hashline_edit')
  })

  it('should include optimization suggestions even with graph analysis', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: true,
        targetSymbols: ['Client'],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      },
      navigationRequests: {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      },
      suboptimalPatterns: [
        {
          type: 'tool_usage',
          pattern: 'basic_edit',
          recommendation: 'Prefer hashline_edit for verified edits',
          confidence: 0.85,
          context: 'strreplace detected',
          toolSuggestion: 'hashline_edit',
        },
      ],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const guidance = engine.generateActionableGuidance(insights, mockGraphAnalysis)

    expect(guidance).toContain('OPTIMIZATION SUGGESTIONS')
    expect(guidance).toContain('Prefer hashline_edit for verified edits')
    expect(guidance).toContain('HIGH-IMPACT SYMBOLS')
  })

  it('should generate navigation-specific guidance for references vs definition', () => {
    const baseEmptyEdit = {
      detected: false as const,
      targetSymbols: [] as string[],
      targetFiles: [] as string[],
      hasHashAnnotations: false,
      affectedGodNodes: [] as string[],
    }

    const refInsights: ContextInsights = {
      editingIntent: { ...baseEmptyEdit },
      navigationRequests: {
        detected: true,
        requestedSymbols: ['Session'],
        requestType: 'references',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const refGuidance = engine.generateActionableGuidance(
      refInsights,
      mockGraphAnalysis,
    )
    expect(refGuidance).toMatch(
      /Navigation request detected: Use `lsp_find_references`/,
    )

    const defInsights: ContextInsights = {
      editingIntent: { ...baseEmptyEdit },
      navigationRequests: {
        detected: true,
        requestedSymbols: ['Session'],
        requestType: 'definition',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const defGuidance = engine.generateActionableGuidance(
      defInsights,
      mockGraphAnalysis,
    )
    expect(defGuidance).toMatch(
      /Navigation request detected: Use `lsp_go_to_definition`/,
    )
  })

  it('should suggest lsp_go_to_definition for file_location navigation', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: false,
        targetSymbols: [],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      },
      navigationRequests: {
        detected: true,
        requestedSymbols: ['OAuth'],
        requestType: 'file_location',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const guidance = engine.generateActionableGuidance(insights, mockGraphAnalysis)

    expect(guidance).toContain('lsp_go_to_definition')
  })

  it('should emit architectural guidance when communities are mentioned', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: false,
        targetSymbols: [],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      },
      navigationRequests: {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 2,
        codebaseRelevant: true,
        mentionedCommunities: ['auth'],
        mentionedFiles: [],
      },
    }

    const guidance = engine.generateActionableGuidance(insights, mockGraphAnalysis)

    expect(guidance).toContain('ARCHITECTURAL GUIDANCE')
    expect(guidance).toContain('Authentication')
    expect(guidance).toContain('safe to refactor')
  })

  it('should handle edge cases gracefully', () => {
    const empty = engine.analyzeConversationContext([])

    expect(empty.editingIntent.detected).toBe(false)
    expect(empty.navigationRequests.detected).toBe(false)
    expect(empty.suboptimalPatterns).toEqual([])
    expect(empty.conversationContext.recentMessages).toBe(0)
    expect(empty.conversationContext.codebaseRelevant).toBe(false)

    const chitChat = engine.analyzeConversationContext([
      { role: 'user', content: 'hello there' },
    ])
    expect(chitChat.editingIntent.detected).toBe(false)
    expect(chitChat.conversationContext.codebaseRelevant).toBe(false)

    const quiet = engine.generateActionableGuidance(empty, null)
    expect(quiet).toContain('WORKFLOW OPTIMIZATION')
    expect(quiet).not.toContain('OPTIMIZATION SUGGESTIONS')
  })
})
