// tests/shared/intelligence-types.test.ts
import { describe, it, expect } from 'vitest'
import type { 
  ContextInsights, 
  EditingContext, 
  OptimizationSuggestion,
  EnhancedContextLayer 
} from '../../shared/intelligence-types.js'

describe('Intelligence Types', () => {
  it('should define ContextInsights interface', () => {
    const insights: ContextInsights = {
      editingIntent: { detected: true, targetSymbols: ['authenticate'], targetFiles: [], hasHashAnnotations: false, affectedGodNodes: [] },
      navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' },
      suboptimalPatterns: [],
      conversationContext: { recentMessages: 5, codebaseRelevant: true, mentionedCommunities: [], mentionedFiles: [] }
    }
    
    expect(insights.editingIntent.detected).toBe(true)
    expect(insights.editingIntent.targetSymbols).toContain('authenticate')
  })

  it('should define OptimizationSuggestion interface', () => {
    const suggestion: OptimizationSuggestion = {
      type: 'tool_usage',
      pattern: 'basic_file_edit',
      recommendation: 'Use hashline_edit instead of StrReplace',
      confidence: 0.9,
      context: 'hash-annotated content available'
    }
    
    expect(suggestion.type).toBe('tool_usage')
    expect(suggestion.confidence).toBe(0.9)
  })
})
