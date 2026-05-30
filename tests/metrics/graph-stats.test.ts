import { describe, expect, it } from 'vitest'
import { SessionStats } from '../../metrics/tracker.js'

describe('SessionStats graph metrics', () => {
  it('records graph pulse, steer, and retrieval boost', () => {
    const stats = new SessionStats('graph-1')
    stats.recordGraphPulseInjection(42)
    stats.recordGraphSteer()
    stats.recordGraphBoostedRetrieval(3)
    stats.setActiveCommunityId('auth')

    const record = stats.toRecord()
    expect(record.graphPulseTokens).toBe(42)
    expect(record.graphSteerCount).toBe(1)
    expect(record.graphBoostedRetrievalCount).toBe(3)
    expect(record.activeCommunityId).toBe('auth')
  })
})
