import { describe, it, expect } from 'vitest'
import type {
  ContextInsights,
  ConversationContext,
  EditingContext,
  EnhancedContextLayer,
  GuidanceMetrics,
  NavigationContext,
  OptimizationSuggestion,
} from '../../shared/intelligence-types.js'

describe('Intelligence Types', () => {
  describe('ContextInsights', () => {
    it('accepts a typical editing-focused payload', () => {
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
          recentMessages: 5,
          codebaseRelevant: true,
          mentionedCommunities: [],
          mentionedFiles: [],
        },
      }

      expect(insights.editingIntent.detected).toBe(true)
      expect(insights.editingIntent.targetSymbols).toContain('authenticate')
    })

    it('accepts non-empty suboptimalPatterns with optional toolSuggestion', () => {
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
            pattern: 'manual_navigation',
            recommendation: 'Use lsp_go_to_definition',
            confidence: 0.8,
            context: 'LSP available',
            toolSuggestion: 'lsp_go_to_definition',
          },
        ],
        conversationContext: {
          recentMessages: 3,
          codebaseRelevant: true,
          mentionedCommunities: ['api'],
          mentionedFiles: [],
        },
      }

      expect(insights.suboptimalPatterns).toHaveLength(1)
      expect(insights.suboptimalPatterns[0].toolSuggestion).toBe('lsp_go_to_definition')
    })
  })

  describe('EditingContext', () => {
    it('captures active edit intent with symbols, files, hashlines, and god nodes', () => {
      const context: EditingContext = {
        detected: true,
        targetSymbols: ['authenticate', 'Client'],
        targetFiles: ['src/auth.ts'],
        hasHashAnnotations: true,
        affectedGodNodes: ['Client'],
      }

      expect(context.detected).toBe(true)
      expect(context.targetSymbols).toHaveLength(2)
      expect(context.targetFiles).toContain('src/auth.ts')
      expect(context.hasHashAnnotations).toBe(true)
      expect(context.affectedGodNodes).toContain('Client')
    })

    it('allows inactive state with empty collections', () => {
      const inactive: EditingContext = {
        detected: false,
        targetSymbols: [],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      }

      expect(inactive.detected).toBe(false)
      expect(inactive.targetSymbols).toHaveLength(0)
    })
  })

  describe('NavigationContext', () => {
    it.each([
      ['definition', ['Client']] as const,
      ['references', ['authenticate', 'login']] as const,
      ['file_location', []] as const,
    ] as const)('supports requestType "%s"', (requestType, requestedSymbols) => {
      const navigation: NavigationContext = {
        detected: true,
        requestedSymbols: [...requestedSymbols],
        requestType,
      }

      expect(navigation.detected).toBe(true)
      expect(navigation.requestType).toBe(requestType)
      expect(navigation.requestedSymbols).toEqual(requestedSymbols)
    })

    it('supports idle navigation (none)', () => {
      const navigation: NavigationContext = {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      }

      expect(navigation.detected).toBe(false)
      expect(navigation.requestType).toBe('none')
    })
  })

  describe('ConversationContext', () => {
    it('captures communities, files, and relevance flags', () => {
      const convo: ConversationContext = {
        recentMessages: 12,
        codebaseRelevant: false,
        mentionedCommunities: ['auth', 'transport'],
        mentionedFiles: ['src/auth.ts', 'src/client.ts'],
      }

      expect(convo.recentMessages).toBe(12)
      expect(convo.codebaseRelevant).toBe(false)
      expect(convo.mentionedCommunities).toContain('auth')
      expect(convo.mentionedFiles).toHaveLength(2)
    })

    it('allows zero messages and empty mentions', () => {
      const minimal: ConversationContext = {
        recentMessages: 0,
        codebaseRelevant: true,
        mentionedCommunities: [],
        mentionedFiles: [],
      }

      expect(minimal.recentMessages).toBe(0)
      expect(minimal.mentionedCommunities).toHaveLength(0)
    })
  })

  describe('OptimizationSuggestion', () => {
    it('works with required fields only (no optional tool)', () => {
      const suggestion: OptimizationSuggestion = {
        type: 'tool_usage',
        pattern: 'basic_file_edit',
        recommendation: 'Use hashline_edit instead of StrReplace',
        confidence: 0.9,
        context: 'hash-annotated content available',
      }

      expect(suggestion.type).toBe('tool_usage')
      expect(suggestion.confidence).toBe(0.9)
      expect(suggestion.toolSuggestion).toBeUndefined()
    })

    it('supports context_awareness variant', () => {
      const suggestion: OptimizationSuggestion = {
        type: 'context_awareness',
        pattern: 'missing_impact_analysis',
        recommendation: 'Assess blast radius before editing high-centrality symbols',
        confidence: 0.71,
        context: 'God-node language without impact discussion',
      }

      expect(suggestion.type).toBe('context_awareness')
      expect(suggestion.toolSuggestion).toBeUndefined()
    })

    it('supports workflow_optimization with optional toolSuggestion', () => {
      const suggestion: OptimizationSuggestion = {
        type: 'workflow_optimization',
        pattern: 'batch_edits',
        recommendation: 'Preview edits with hashline dry_run before apply',
        confidence: 0.62,
        context: 'Multi-file change in progress',
        toolSuggestion: 'hashline_edit',
      }

      expect(suggestion.toolSuggestion).toBe('hashline_edit')
      expect(suggestion.confidence).toBeLessThanOrEqual(1)
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0)
    })

    it('allows boundary confidence values 0 and 1', () => {
      const low: OptimizationSuggestion = {
        type: 'tool_usage',
        pattern: 'x',
        recommendation: 'y',
        confidence: 0,
        context: 'z',
      }
      const high: OptimizationSuggestion = {
        type: 'workflow_optimization',
        pattern: 'x',
        recommendation: 'y',
        confidence: 1,
        context: 'z',
      }

      expect(low.confidence).toBe(0)
      expect(high.confidence).toBe(1)
    })
  })

  describe('EnhancedContextLayer', () => {
    it.each([
      ['actionable_insights', 10, 0.95] as const,
      ['smart_dep_context', 5, 0.4] as const,
      ['smart_repo_map', 1, 0.72] as const,
    ] as const)('supports type %s with priority and relevance', (type, priority, relevanceScore) => {
      const layer: EnhancedContextLayer = {
        type,
        content: `<${type}>body</${type}>`,
        priority,
        relevanceScore,
      }

      expect(layer.type).toBe(type)
      expect(layer.priority).toBe(priority)
      expect(layer.relevanceScore).toBe(relevanceScore)
    })

    it('allows relevanceScore boundaries 0 and 1', () => {
      const min: EnhancedContextLayer = {
        type: 'actionable_insights',
        content: '',
        priority: 0,
        relevanceScore: 0,
      }
      const max: EnhancedContextLayer = {
        type: 'smart_repo_map',
        content: 'x',
        priority: 0,
        relevanceScore: 1,
      }

      expect(min.relevanceScore).toBe(0)
      expect(max.relevanceScore).toBe(1)
    })
  })

  describe('GuidanceMetrics', () => {
    it('carries non-negative counters', () => {
      const metrics: GuidanceMetrics = {
        suggestionsOffered: 100,
        suggestionsFollowed: 42,
        patternDetections: 17,
        toolUsageImprovements: 9,
      }

      expect(metrics.suggestionsOffered).toBe(100)
      expect(metrics.suggestionsFollowed).toBe(42)
      expect(metrics.patternDetections).toBe(17)
      expect(metrics.toolUsageImprovements).toBe(9)
    })

    it('allows all-zero metrics', () => {
      const fresh: GuidanceMetrics = {
        suggestionsOffered: 0,
        suggestionsFollowed: 0,
        patternDetections: 0,
        toolUsageImprovements: 0,
      }

      expect(Object.values(fresh).every((v) => v === 0)).toBe(true)
    })
  })
})
