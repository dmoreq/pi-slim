import { describe, expect, it } from 'vitest'

import { produceDefaults } from '../context/schema.js'
import { SessionStats } from '../metrics/tracker.js'

describe('periodic savings reminder conditions', () => {
  it('is due at turn 5 with savings when notifyPeriodic is enabled', () => {
    const config = produceDefaults()
    config.metrics.notifyPeriodic = true
    const stats = new SessionStats('periodic-test')

    for (let i = 0; i < 5; i++) {
      stats.recordDepContextInjection([`/f${i}.ts`], 100, 700)
    }

    const due =
      config.metrics.notifyPeriodic &&
      stats.totalTokensSaved > 0 &&
      stats.depContextTriggers > 0 &&
      stats.depContextTriggers % 5 === 0

    expect(due).toBe(true)
    expect(stats.depContextTriggers).toBe(5)
  })

  it('is not due before turn 5', () => {
    const config = produceDefaults()
    config.metrics.notifyPeriodic = true
    const stats = new SessionStats('periodic-test')

    for (let i = 0; i < 4; i++) {
      stats.recordDepContextInjection([`/f${i}.ts`], 100, 700)
    }

    const due =
      config.metrics.notifyPeriodic &&
      stats.totalTokensSaved > 0 &&
      stats.depContextTriggers > 0 &&
      stats.depContextTriggers % 5 === 0

    expect(due).toBe(false)
  })
})
