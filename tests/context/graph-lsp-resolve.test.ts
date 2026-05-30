import { describe, expect, it } from 'vitest'
import { resolveGraphLookup } from '../../context/graph-lsp-resolve.js'
import type { GraphAnalysis } from '../../context/graph-types.js'

const analysis: GraphAnalysis = {
  graph: {
    nodes: [
      { id: 'file:src/auth.ts', type: 'module', label: 'auth.ts' },
      { id: 'file:src/auth.ts:authenticate', type: 'function', label: 'authenticate' },
      { id: 'file:src/other.ts:authenticate', type: 'function', label: 'authenticate' },
    ],
    edges: [],
  },
  godNodes: [
    {
      nodeId: 'file:src/auth.ts:authenticate',
      label: 'authenticate',
      inDegree: 2,
      outDegree: 0,
      betweenness: 0,
      pageRank: 0.5,
      community: 'auth',
      criticality: 'CRITICAL',
    },
  ],
  communities: [],
}

describe('resolveGraphLookup', () => {
  it('prefers file:path:symbol node id', () => {
    const r = resolveGraphLookup('src/auth.ts', 'authenticate', analysis)
    expect(r.nodeId).toBe('file:src/auth.ts:authenticate')
    expect(r.lookupKey).toBe('file:src/auth.ts:authenticate')
  })

  it('falls back to file node when symbol empty', () => {
    const r = resolveGraphLookup('src/auth.ts', '', analysis)
    expect(r.lookupKey).toContain('auth.ts')
  })
})
