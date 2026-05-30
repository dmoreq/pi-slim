import { describe, expect, it } from 'vitest'
import { GraphSteerPlugin } from '../../plugins/graph-steer-plugin.js'
import type { GraphAnalysis, GodNode } from '../../context/graph-types.js'
import type { SessionState } from '../../manager.js'
import { produceDefaults } from '../../context/schema.js'

const god: GodNode = {
  nodeId: 'file:src/hub.ts:Hub',
  label: 'Hub',
  criticality: 'CRITICAL',
  inDegree: 8,
  outDegree: 0,
  betweenness: 0.1,
  pageRank: 0.2,
  community: 'core',
}

const graph = {
  godNodes: [god],
  communities: [],
  surprises: [],
  bottlenecks: [],
  anomalies: [],
  graph: { nodes: [], edges: [] },
  metrics: {
    totalNodes: 1,
    totalEdges: 0,
    communityCount: 0,
    cycleCount: 0,
    godNodeCount: 1,
    bottleneckCount: 0,
    surpriseCount: 0,
    density: 0,
    avgDegree: 0,
  },
} as GraphAnalysis

function makeState(): SessionState {
  const config = produceDefaults()
  return {
    index: { skeletons: new Map(), deps: new Map(), reverseDeps: new Map(), symbolIndex: new Map() },
    repoMap: '',
    injector: {} as SessionState['injector'],
    config,
    stats: { recordGraphSteer: () => {} } as SessionState['stats'],
    projectRoot: '/p',
    repoMapInjected: false,
    contextFilesInjected: false,
    providerGuidanceInjected: false,
    graphInsightsInjected: true,
    graphInsightGodLabels: [],
    intelligenceInjected: false,
    intelligenceWorkflowInjected: false,
    retrieval: undefined,
    contextFiles: [],
    providerGuidanceFiles: [],
    recentToolNames: [],
  }
}

describe('GraphSteerPlugin', () => {
  it('nudges hashline_edit on CRITICAL god without prior LSP', async () => {
    const state = makeState()
    const plugin = new GraphSteerPlugin(
      () => state,
      () => graph,
      () => ['Hub']
    )
    const result = await plugin.onToolCall!({ toolName: 'hashline_edit', input: { path: 'src/hub.ts' } }, {} as never)
    expect(result?.reason).toContain('lsp_find_references')
    expect(result?.allowed).toBe(true)
  })

  it('does not steer when LSP impact tool was used recently', async () => {
    const state = makeState()
    state.recentToolNames = ['lsp_hover']
    const plugin = new GraphSteerPlugin(
      () => state,
      () => graph,
      () => ['Hub']
    )
    const result = await plugin.onToolCall!({ toolName: 'hashline_edit', input: {} }, {} as never)
    expect(result).toBeUndefined()
  })
})
