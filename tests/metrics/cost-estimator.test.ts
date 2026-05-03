import { describe, it, expect } from 'vitest'
import { buildCostEstimate } from '../../src/metrics/cost-estimator.js'

describe('buildCostEstimate', () => {
  it('computes correct savings ratio', () => {
    const result = buildCostEstimate([
      { skeletonTokens: 10, fullTokens: 100 },
      { skeletonTokens: 20, fullTokens: 200 },
    ], 2)
    expect(result.skeletonTokens).toBe(30)
    expect(result.fullFileTokens).toBe(300)
    expect(result.savingsRatio).toBeCloseTo(0.9, 2) // 90% saved
    expect(result.avoidedReads).toBe(2)
  })

  it('returns 0 savings when skeleton equals full', () => {
    const result = buildCostEstimate([
      { skeletonTokens: 50, fullTokens: 50 },
    ], 0)
    expect(result.savingsRatio).toBe(0)
  })

  it('handles empty input', () => {
    const result = buildCostEstimate([], 0)
    expect(result.skeletonTokens).toBe(0)
    expect(result.savingsRatio).toBe(0)
  })
})
