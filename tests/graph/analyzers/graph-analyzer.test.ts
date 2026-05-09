/**
 * Tests for generic GraphAnalyzer (cached analysis on abstract Graph shape).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphAnalyzer } from '../../../graph/analyzers/graph-analyzer.js'
import type { AnalysisCache } from '../../../graph/cache/analysis-cache.js'

describe('GraphAnalyzer', () => {
  let analyzer: GraphAnalyzer
  let mockCache: AnalysisCache

  beforeEach(() => {
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      clear: vi.fn(),
    } as AnalysisCache

    analyzer = new GraphAnalyzer(mockCache)
  })

  it('should analyze graph and return results', async () => {
    const mockGraph = {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b' }],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    const result = await analyzer.analyze(mockGraph)

    expect(result).toBeDefined()
    expect(result.godNodes).toBeDefined()
    expect(result.communities).toBeDefined()
    expect(mockCache.set).toHaveBeenCalled()
  })

  it('should return cached results when available', async () => {
    const mockGraph = {
      nodes: [{ id: 'a' }],
      edges: [],
    }
    const cachedResult = { godNodes: [], communities: [], metrics: {}, surprisingConnections: [] }

    vi.mocked(mockCache.get).mockReturnValue(cachedResult)

    const result = await analyzer.analyze(mockGraph)

    expect(result).toBe(cachedResult)
    expect(mockCache.set).not.toHaveBeenCalled()
  })

  it('should identify god nodes correctly', async () => {
    const mockGraph = {
      nodes: [
        { id: 'a', type: 'function' },
        { id: 'b', type: 'function' },
        { id: 'c', type: 'function' },
      ],
      edges: [
        { from: 'a', to: 'b', type: 'calls' },
        { from: 'a', to: 'c', type: 'calls' },
        { from: 'b', to: 'c', type: 'calls' },
      ],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    const result = await analyzer.analyze(mockGraph)

    expect(result.godNodes).toHaveLength(1)
    expect(result.godNodes[0].id).toBe('a')
    expect(result.godNodes[0].connectivity).toBe(2)
  })

  it('should detect communities correctly', async () => {
    const mockGraph = {
      nodes: [
        { id: 'a', type: 'function' },
        { id: 'b', type: 'function' },
        { id: 'c', type: 'function' },
        { id: 'd', type: 'function' },
      ],
      edges: [
        { from: 'a', to: 'b', type: 'calls' },
        { from: 'c', to: 'd', type: 'calls' },
      ],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    const result = await analyzer.analyze(mockGraph)

    expect(result.communities).toHaveLength(2)
    expect(result.communities[0].nodes).toHaveLength(2)
    expect(result.communities[1].nodes).toHaveLength(2)
  })

  it('should compute metrics correctly', async () => {
    const mockGraph = {
      nodes: [
        { id: 'a', type: 'function' },
        { id: 'b', type: 'function' },
      ],
      edges: [
        { from: 'a', to: 'b', type: 'calls' },
      ],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    const result = await analyzer.analyze(mockGraph)

    expect(result.metrics.nodeCount).toBe(2)
    expect(result.metrics.edgeCount).toBe(1)
    expect(result.metrics.density).toBe(1)
  })

  it('should generate consistent cache keys', async () => {
    const graph1 = {
      nodes: [{ id: 'a', type: 'function' }],
      edges: [],
    }

    const graph2 = {
      nodes: [{ id: 'a', type: 'function' }],
      edges: [],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    await analyzer.analyze(graph1)
    await analyzer.analyze(graph2)

    expect(mockCache.set).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(mockCache.set).mock.calls[0][0]
    const secondCall = vi.mocked(mockCache.set).mock.calls[1][0]
    expect(firstCall).toBe(secondCall)
  })

  it('should handle empty graphs gracefully', async () => {
    const emptyGraph = {
      nodes: [],
      edges: [],
    }

    vi.mocked(mockCache.get).mockReturnValue(null)

    const result = await analyzer.analyze(emptyGraph)

    expect(result.godNodes).toHaveLength(0)
    expect(result.communities).toHaveLength(0)
    expect(result.metrics.nodeCount).toBe(0)
    expect(result.metrics.edgeCount).toBe(0)
    expect(result.metrics.density).toBe(0)
  })
})
