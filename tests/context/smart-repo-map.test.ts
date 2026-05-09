// tests/context/smart-repo-map.test.ts
import { describe, it, expect } from 'vitest'
import { SmartRepositoryMapGenerator } from '../../context/smart-repo-map.js'
import type { GraphifyAnalysis } from '../../context/graph-types.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

describe('SmartRepositoryMapGenerator', () => {
  const gen = new SmartRepositoryMapGenerator()

  const baseMap = '<repo-map>\n## src\n- auth/\n- core/\n</repo-map>'

  const mockAnalysis: GraphifyAnalysis = {
    godNodes: [
      {
        nodeId: 'Client',
        label: 'Client',
        inDegree: 26,
        outDegree: 5,
        betweenness: 0.2,
        pageRank: 0.12,
        community: 'core',
        criticality: 'CRITICAL',
      },
    ],
    communities: [
      {
        id: 'auth',
        label: 'Authentication',
        nodes: ['authenticate', 'User', 'Session', 'Token', 'Login'],
        internalDensity: 0.85,
        externalDensity: 0.12,
        interfaceNodes: ['authenticate'],
        bottlenecks: [],
        metrics: { cohesion: 0.9 },
      },
      {
        id: 'core',
        label: 'Core platform',
        nodes: ['Client', 'Server'],
        internalDensity: 0.7,
        externalDensity: 0.3,
        interfaceNodes: [],
        bottlenecks: ['Client'],
        metrics: { cohesion: 0.75 },
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
      totalNodes: 50,
      totalEdges: 120,
      godNodeCount: 1,
      communityCount: 2,
      averageDegree: 4,
      maxDegree: 26,
      graphDensity: 0.05,
      avgClusteringCoeff: 0.4,
      cycleCount: 0,
      bottleneckCount: 1,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }

  it('should prepend graph-prioritized navigation when communities are mentioned', () => {
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

    const out = gen.generatePrioritizedRepoMap(baseMap, insights, mockAnalysis)

    expect(out).toContain('📍 GRAPH-PRIORITIZED NAVIGATION')
    expect(out).toContain('Authentication')
    expect(out).toContain(baseMap)
  })

  it('should highlight high-impact symbols aligned with editing intent', () => {
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
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const out = gen.generatePrioritizedRepoMap(baseMap, insights, mockAnalysis)

    expect(out).toContain('🎯 FOCUS AREAS (graph impact)')
    expect(out).toContain('Client')
    expect(out).toContain('CRITICAL')
  })

  it('should return the base map unchanged when graph analysis is absent', () => {
    const insights: ContextInsights = {
      editingIntent: {
        detected: true,
        targetSymbols: ['Client'],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      },
      navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' },
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: ['auth'],
        mentionedFiles: [],
      },
    }

    expect(gen.generatePrioritizedRepoMap(baseMap, insights, null)).toBe(baseMap)
  })

  it('should prioritize communities for references, definition, and file_location navigation', () => {
    const navigationTypes = ['references', 'definition', 'file_location'] as const

    for (const requestType of navigationTypes) {
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
          requestType,
        },
        suboptimalPatterns: [],
        conversationContext: {
          recentMessages: 1,
          codebaseRelevant: true,
          mentionedCommunities: [],
          mentionedFiles: [],
        },
      }

      const out = gen.generatePrioritizedRepoMap(baseMap, insights, mockAnalysis)

      expect(out, `requestType=${requestType}`).toContain('📍 GRAPH-PRIORITIZED NAVIGATION')
      expect(out, `requestType=${requestType}`).toContain('Authentication')
      expect(out, `requestType=${requestType}`).toContain(baseMap)
    }
  })

  it('should match mentioned community ids case-insensitively', () => {
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

    const out = gen.generatePrioritizedRepoMap(baseMap, insights, mockAnalysis)

    expect(out).toContain('📍 GRAPH-PRIORITIZED NAVIGATION')
    expect(out).toContain('Authentication')
  })

  it('should align god matching with dependency context (substring when symbol length ≥ 4)', () => {
    const analysis: GraphifyAnalysis = {
      ...mockAnalysis,
      godNodes: [
        ...mockAnalysis.godNodes,
        {
          nodeId: 'net:HttpClient',
          label: 'HttpClient',
          inDegree: 12,
          outDegree: 2,
          betweenness: 0.1,
          pageRank: 0.05,
          community: 'core',
          criticality: 'IMPORTANT',
        },
      ],
    }

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
      suboptimalPatterns: [],
      conversationContext: {
        recentMessages: 1,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      },
    }

    const out = gen.generatePrioritizedRepoMap(baseMap, insights, analysis)

    expect(out).toContain('HttpClient')
    expect(out).toContain('Client')
  })
})
