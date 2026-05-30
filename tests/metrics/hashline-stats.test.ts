import { describe, expect, it } from 'vitest'
import { SessionStats } from '../../metrics/tracker.js'

describe('SessionStats hashline metrics', () => {
  it('records hashline edit and steer counts', () => {
    const stats = new SessionStats('s1')
    stats.recordHashlineEdit(true)
    stats.recordHashlineEdit(false)
    stats.recordBuiltinEditSteered()
    stats.recordHashlineAnchorInjectTurn()

    const record = stats.toRecord()
    expect(record.hashlineEdits).toBe(2)
    expect(record.hashlineDryRuns).toBe(1)
    expect(record.hashlineApplyEdits).toBe(1)
    expect(record.builtinEditSteered).toBe(1)
    expect(record.hashlineAnchorInjectTurns).toBe(1)
  })
})
