import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RetrievalEngine } from '../../context/retrieval.js'
import type { GraphAnalysis, GodNode } from '../../context/graph-types.js'
import type { RepoIndex } from '../../shared/types.js'

const ROOT = '/proj'
const HUB = join(ROOT, 'src/hub.ts')
const UTIL = join(ROOT, 'src/util.ts')

function makeIndex(): RepoIndex {
  return {
    skeletons: new Map([
      [HUB, 'export class Hub {}'],
      [UTIL, 'export function util() {}'],
    ]),
    deps: new Map(),
    reverseDeps: new Map(),
    symbolIndex: new Map([
      ['Hub', [HUB]],
      ['util', [UTIL]],
    ]),
  }
}

const god: GodNode = {
  nodeId: 'file:src/hub.ts:Hub',
  label: 'Hub',
  criticality: 'CRITICAL',
  inDegree: 5,
  outDegree: 0,
  betweenness: 0.1,
  pageRank: 0.2,
  community: 'core',
}

const graph = {
  godNodes: [god],
  communities: [{ id: 'core', label: 'Core', nodes: ['file:src/hub.ts'], cohesion: 0.5 }],
  surprises: [],
  bottlenecks: [],
  anomalies: [],
  graph: { nodes: [], edges: [] },
  metrics: {
    totalNodes: 2,
    totalEdges: 0,
    communityCount: 1,
    cycleCount: 0,
    godNodeCount: 1,
    bottleneckCount: 0,
    surpriseCount: 0,
    density: 0,
    avgDegree: 0,
  },
} as GraphAnalysis

describe('RetrievalEngine graph boosts', () => {
  it('adds graph:god-node signal for god file matches', () => {
    const engine = new RetrievalEngine(makeIndex())
    const scored = engine.retrieveTopK('Hub', 5, new Set(), {
      graph,
      projectRoot: ROOT,
      boostGodNodes: true,
      boostActiveCommunity: false,
    })
    const hub = scored.find(s => s.file === HUB)
    expect(hub?.signals.some(sig => sig.startsWith('graph:'))).toBe(true)
  })
})
