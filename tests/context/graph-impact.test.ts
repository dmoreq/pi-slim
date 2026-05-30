import { describe, expect, it } from 'vitest'
import { computeDependentFanout } from '../../context/graph-impact'
import type { GraphAnalysis } from '../../context/graph-types'

describe('computeDependentFanout', () => {
  it('counts incoming dependents via BFS (not out-edges)', () => {
    const analysis = {
      graph: {
        nodes: [
          { id: 'auth', type: 'function', label: 'auth' },
          { id: 'api', type: 'function', label: 'api' },
          { id: 'ui', type: 'function', label: 'ui' },
        ],
        edges: [
          { source: 'api', target: 'auth', type: 'calls' },
          { source: 'ui', target: 'auth', type: 'calls' },
        ],
      },
      godNodes: [],
      communities: [],
      surprises: [],
      bottlenecks: [],
      anomalies: [],
      metrics: {
        totalNodes: 3,
        totalEdges: 2,
        communityCount: 0,
        cycleCount: 0,
        godNodeCount: 0,
        bottleneckCount: 0,
        surpriseCount: 0,
        density: 0,
        avgDegree: 0,
      },
    } as GraphAnalysis

    const { dependentCount, affectedCommunities } = computeDependentFanout('auth', analysis)
    expect(dependentCount).toBe(2)
    expect(affectedCommunities).toBeGreaterThanOrEqual(0)
  })
})
