// tests/context/smart-dep-context.test.ts
import { describe, expect, it } from 'vitest'
import type { GraphAnalysis } from '../../context/graph-types.js'
import { SmartDependencyContextGenerator } from '../../context/smart-dep-context.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

describe('SmartDependencyContextGenerator', () => {
  const generator = new SmartDependencyContextGenerator()

  const mockGraphAnalysis: GraphAnalysis = {
    godNodes: [
      {
        nodeId: 'Client',
        label: 'Client',
        inDegree: 26,
        outDegree: 5,
        betweenness: 0,
        pageRank: 0.15,
        community: 'core',
        criticality: 'CRITICAL',
      },
    ],
    communities: [
      {
        id: 'auth',
        label: 'Authentication',
        nodes: ['authenticate', 'User'],
        internalDensity: 0.9,
        externalDensity: 0.1,
        interfaceNodes: [],
        bottlenecks: [],
        metrics: { cohesion: 0.9 },
      },
    ],
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

  it('should prioritize god nodes in dependency context', () => {
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

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🎯 HIGH-PRIORITY SYMBOLS')
    expect(context).toContain('Client (CRITICAL)')
    expect(context).toContain('hashline_edit')
  })

  it('should generate tool recommendations based on patterns', () => {
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
        requestedSymbols: ['User'],
        requestType: 'references',
      },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 2,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🔧 RECOMMENDED TOOLS')
    expect(context).toContain('lsp_find_references')
  })

  it('should include community context when relevant', () => {
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
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 2,
        codebaseRelevant: true,
        mentionedCommunities: ['auth'],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🏗️ ARCHITECTURAL CONTEXT')
    expect(context).toContain('Authentication')
  })

  it('should resolve community linkage case-insensitively', () => {
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
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: ['AUTH'],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🏗️ ARCHITECTURAL CONTEXT')
    expect(context).toContain('Authentication')
  })

  it('should surface top god nodes even without specific symbol mentions', () => {
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
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🎯 HIGH-PRIORITY SYMBOLS')
    expect(context).toContain('Client (CRITICAL)')
  })

  it('should resolve architecture symbols against community nodes case-insensitively', () => {
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
        requestedSymbols: ['USER'],
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

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('🏗️ ARCHITECTURAL CONTEXT')
    expect(context).toContain('Authentication')
  })

  it('should handle null graph analysis gracefully', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: true,
        targetSymbols: ['authenticate'],
        targetFiles: [],
        hasHashAnnotations: true,
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
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, null)

    expect(context).toContain('🔧 RECOMMENDED TOOLS')
    expect(context).toContain('hashline_edit')
    expect(context).not.toContain('🎯 HIGH-PRIORITY SYMBOLS')
  })

  it('should include suboptimal pattern suggestions', () => {
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
      suboptimalPatterns: [
        {
          type: 'tool_usage',
          pattern: 'basic_edit',
          recommendation: 'Use hashline_edit',
          confidence: 0.8,
          context: 'available',
          toolSuggestion: 'hashline_edit',
        },
      ],
      conversationContext: {
        recentMessages: 2,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

    expect(context).toContain('Use hashline_edit')
    expect(context).toContain('hashline_edit')
  })

  describe('SmartDependencyContextGenerator additional coverage', () => {
    it('should provide editing-based tool recommendations', () => {
      const insights: ContextInsights = {
        editingIntent: {
          detected: true,
          targetSymbols: ['Client'],
          targetFiles: [],
          hasHashAnnotations: false,
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

      const context = generator.generateEnhancedDependencyContext(insights, mockGraphAnalysis)

      expect(context).toContain('🔧 RECOMMENDED TOOLS')
      expect(context).toContain('lsp_find_references')
    })

    it('should handle definition and file_location navigation requests', () => {
      const definitionInsights: ContextInsights = {
        editingIntent: {
          detected: false,
          targetSymbols: [],
          targetFiles: [],
          hasHashAnnotations: false,
          affectedGodNodes: [],
        },
        navigationRequests: {
          detected: true,
          requestedSymbols: ['User'],
          requestType: 'definition',
        },
        suboptimalPatterns: [],
        conversationContext: {
          recentMessages: 2,
          codebaseRelevant: true,
          mentionedCommunities: [],
          mentionedFiles: [],
        },
      }

      const context = generator.generateEnhancedDependencyContext(definitionInsights, mockGraphAnalysis)
      expect(context).toContain('lsp_go_to_definition')

      const fileLocationInsights: ContextInsights = {
        ...definitionInsights,
        navigationRequests: {
          detected: true,
          requestedSymbols: ['User'],
          requestType: 'file_location',
        },
      }

      const fileContext = generator.generateEnhancedDependencyContext(fileLocationInsights, mockGraphAnalysis)
      expect(fileContext).toContain('lsp_go_to_definition')
    })

    it('should prioritize multiple god nodes by criticality then inDegree', () => {
      const multiGodMockAnalysis: GraphAnalysis = {
        ...mockGraphAnalysis,
        godNodes: [
          {
            nodeId: 'LowPriority',
            label: 'LowPriority',
            inDegree: 30,
            outDegree: 5,
            betweenness: 0,
            pageRank: 0.1,
            community: 'utils',
            criticality: 'NORMAL',
          },
          {
            nodeId: 'HighPriority',
            label: 'HighPriority',
            inDegree: 15,
            outDegree: 3,
            betweenness: 0,
            pageRank: 0.2,
            community: 'core',
            criticality: 'CRITICAL',
          },
          {
            nodeId: 'Client',
            label: 'Client',
            inDegree: 26,
            outDegree: 5,
            betweenness: 0,
            pageRank: 0.15,
            community: 'core',
            criticality: 'CRITICAL',
          },
        ],
      }

      const insights: ContextInsights = {
        editingIntent: {
          detected: true,
          targetSymbols: ['LowPriority', 'HighPriority', 'Client'],
          targetFiles: [],
          hasHashAnnotations: false,
          affectedGodNodes: ['LowPriority', 'HighPriority', 'Client'],
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

      const context = generator.generateEnhancedDependencyContext(insights, multiGodMockAnalysis)

      const lines = context.split('\n')
      const symbolLines = lines.filter(line => line.includes('(CRITICAL)') || line.includes('(NORMAL)'))

      expect(symbolLines[0]).toContain('Client')
      expect(symbolLines[1]).toContain('HighPriority')
      expect(symbolLines[2]).toContain('LowPriority')
    })
  })
})
