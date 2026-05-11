import { describe, it, expect } from 'vitest'
import { SessionStats } from '../../metrics/tracker.js'

// Validation helper: SessionRecord includes all new token fields
type HasNewFields = {
  graphInsightsTokens?: number
  intelligenceTokens?: number
  smartDepContextTokens?: number
}

describe('SessionStats – guidance token tracking', () => {
  it('recordGraphInsightsInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordGraphInsightsInjection(120)
    expect((stats as unknown as HasNewFields).graphInsightsTokens).toBe(120)
  })

  it('recordIntelligenceInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordIntelligenceInjection(80)
    stats.recordIntelligenceInjection(60)
    expect((stats as unknown as HasNewFields).intelligenceTokens).toBe(140)
  })

  it('recordSmartDepContextInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordSmartDepContextInjection(50)
    expect((stats as unknown as HasNewFields).smartDepContextTokens).toBe(50)
  })

  it('toRecord includes all new token fields', () => {
    const stats = new SessionStats('test-session')
    // Cast to access new methods
    const s = stats as unknown as {
      recordGraphInsightsInjection: (n: number) => void
      recordIntelligenceInjection: (n: number) => void
      recordSmartDepContextInjection: (n: number) => void
      toRecord: () => HasNewFields
    }
    s.recordGraphInsightsInjection(100)
    s.recordIntelligenceInjection(90)
    s.recordSmartDepContextInjection(70)
    const record = s.toRecord()
    expect(record.graphInsightsTokens).toBe(100)
    expect(record.intelligenceTokens).toBe(90)
    expect(record.smartDepContextTokens).toBe(70)
  })
})
