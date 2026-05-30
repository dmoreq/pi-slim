import { describe, expect, it } from 'vitest'
import { mergeHashlineInjectionInsights } from '../../context/hashline-signals.js'
import type { ContextInsights } from '../../shared/intelligence-types.js'

function baseInsights(): ContextInsights {
  return {
    editingIntent: {
      detected: true,
      targetSymbols: [],
      targetFiles: [],
      hasHashAnnotations: false,
      affectedGodNodes: [],
    },
    navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' },
    suboptimalPatterns: [],
    conversationContext: { recentMessages: 1, relevanceScore: 0.5, priority: 1 },
  }
}

describe('mergeHashlineInjectionInsights', () => {
  it('sets hasHashAnnotations when dep-context contains anchors', () => {
    const merged = mergeHashlineInjectionInsights(baseInsights(), new Set(), '1tz|import x')
    expect(merged.editingIntent.hasHashAnnotations).toBe(true)
  })

  it('sets hasHashAnnotations when paths were injected', () => {
    const merged = mergeHashlineInjectionInsights(
      baseInsights(),
      new Set(['/proj/a.ts']),
      null
    )
    expect(merged.editingIntent.hasHashAnnotations).toBe(true)
  })
})
