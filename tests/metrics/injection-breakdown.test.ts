import { describe, expect, it } from 'vitest'
import { buildInjectionBreakdown } from '../../metrics/injection-breakdown.js'

describe('buildInjectionBreakdown', () => {
  it('computes percentages for non-zero slices', () => {
    const breakdown = buildInjectionBreakdown([
      { label: 'repo-map', tokens: 100 },
      { label: 'dep-context', tokens: 300 },
    ])
    expect(breakdown).toHaveLength(2)
    expect(breakdown[0].percent).toBe(25)
    expect(breakdown[1].percent).toBe(75)
  })

  it('returns zero percent when total is zero', () => {
    const breakdown = buildInjectionBreakdown([{ label: 'a', tokens: 0 }])
    expect(breakdown[0].percent).toBe(0)
  })
})
