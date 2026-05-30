import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cycleWarningForFiles } from '../../context/graph-cycle-warn.js'
import type { GraphAnalysis } from '../../context/graph-types.js'

const ROOT = '/proj'

describe('cycleWarningForFiles', () => {
  it('warns when in-focus file is in a cycle anomaly', () => {
    const analysis = {
      anomalies: [
        {
          type: 'circular_dependency',
          severity: 'high',
          description: 'Import cycle',
          nodes: ['file:src/a.ts', 'file:src/b.ts'],
        },
      ],
      metrics: { cycleCount: 1 },
    } as GraphAnalysis

    const warn = cycleWarningForFiles(analysis, [join(ROOT, 'src/a.ts')], ROOT)
    expect(warn).toContain('Circular dependency')
  })

  it('returns null when no anomalies', () => {
    expect(cycleWarningForFiles({ anomalies: [], metrics: { cycleCount: 0 } } as GraphAnalysis, [], ROOT)).toBeNull()
  })
})
