/**
 * Tests for Degree Centrality Algorithm
 */

import { describe, expect, it } from 'vitest'
import {
  computeDegreeCentrality,
  getDegreeCentralityStats,
  identifyBottlenecksByDegree,
  identifyGodNodesByDegree,
  rankByInDegree,
} from '../../algorithms/centrality'
import type { CodeGraph } from '../../context/graph-types'

describe('DegreeCentrality', () => {
  // ── Basic Functionality ────────────────────────────────────────────────

  describe('computeDegreeCentrality', () => {
    it('computes degree for simple linear graph', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
        ],
      }

      const result = computeDegreeCentrality(graph)

      // Check 'a': 0 in, 1 out
      const a = result.find(r => r.nodeId === 'a')
      expect(a?.inDegree).toBe(0)
      expect(a?.outDegree).toBe(1)
      expect(a?.totalDegree).toBe(1)

      // Check 'b': 1 in, 1 out (middle node)
      const b = result.find(r => r.nodeId === 'b')
      expect(b?.inDegree).toBe(1)
      expect(b?.outDegree).toBe(1)
      expect(b?.totalDegree).toBe(2)

      // Check 'c': 1 in, 0 out
      const c = result.find(r => r.nodeId === 'c')
      expect(c?.inDegree).toBe(1)
      expect(c?.outDegree).toBe(0)
      expect(c?.totalDegree).toBe(1)
    })

    it('identifies hub node with multiple edges', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'hub', type: 'function', label: 'Hub' },
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'hub', type: 'calls' },
          { source: 'b', target: 'hub', type: 'calls' },
          { source: 'c', target: 'hub', type: 'calls' },
        ],
      }

      const result = computeDegreeCentrality(graph)
      const hub = result.find(r => r.nodeId === 'hub')

      expect(hub?.inDegree).toBe(3) // Highly depended on
      expect(hub?.outDegree).toBe(0)
    })

    it('normalizes scores correctly', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }],
      }

      const result = computeDegreeCentrality(graph)

      // Max degree is 1, so normalized should be 1.0
      const max = Math.max(...result.map(r => r.normalized))
      expect(max).toBe(1.0)

      // All scores should be 0-1
      result.forEach(r => {
        expect(r.normalized).toBeGreaterThanOrEqual(0)
        expect(r.normalized).toBeLessThanOrEqual(1)
      })
    })

    it('sorts by total degree descending', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
        ],
      }

      const result = computeDegreeCentrality(graph)

      // 'b' has highest degree (2), should be first
      expect(result[0].nodeId).toBe('b')
      expect(result[0].totalDegree).toBe(2)
    })

    it('handles isolated nodes', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [],
      }

      const result = computeDegreeCentrality(graph)

      result.forEach(r => {
        expect(r.inDegree).toBe(0)
        expect(r.outDegree).toBe(0)
        expect(r.totalDegree).toBe(0)
        expect(r.normalized).toBe(0)
      })
    })

    it('handles bidirectional edges', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'a', type: 'calls' },
        ],
      }

      const result = computeDegreeCentrality(graph)

      result.forEach(r => {
        expect(r.inDegree).toBe(1)
        expect(r.outDegree).toBe(1)
        expect(r.totalDegree).toBe(2)
      })
    })

    it('handles multiple edges between same nodes', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'a', target: 'b', type: 'imports' },
        ],
      }

      const result = computeDegreeCentrality(graph)
      const a = result.find(r => r.nodeId === 'a')

      // Multiple edges count separately
      expect(a?.outDegree).toBe(2)
    })
  })

  // ── God Node Identification ────────────────────────────────────────────

  describe('identifyGodNodesByDegree', () => {
    it('identifies nodes with high in-degree', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'auth', type: 'module', label: 'Auth' },
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' },
        ],
        edges: [
          { source: 'a', target: 'auth', type: 'calls' },
          { source: 'b', target: 'auth', type: 'calls' },
          { source: 'c', target: 'auth', type: 'calls' },
          { source: 'd', target: 'auth', type: 'calls' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)
      const godNodes = identifyGodNodesByDegree(degreeScores, 3)

      expect(godNodes).toContain('auth')
      expect(godNodes.length).toBe(1)
    })

    it('respects threshold', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' },
          { id: 'e', type: 'function', label: 'E' },
        ],
        edges: [
          { source: 'b', target: 'a', type: 'calls' },
          { source: 'c', target: 'a', type: 'calls' },
          { source: 'd', target: 'a', type: 'calls' },
          { source: 'e', target: 'c', type: 'calls' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)

      // With threshold 3, 'a' has in-degree 3
      const godNodes3 = identifyGodNodesByDegree(degreeScores, 3)
      expect(godNodes3).toContain('a')

      // With threshold 4, 'a' doesn't qualify
      const godNodes4 = identifyGodNodesByDegree(degreeScores, 4)
      expect(godNodes4).not.toContain('a')
    })
  })

  // ── Bottleneck Identification ──────────────────────────────────────────

  describe('identifyBottlenecksByDegree', () => {
    it('identifies nodes with high out-degree', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'index', type: 'module', label: 'Index' },
          { id: 'a', type: 'module', label: 'A' },
          { id: 'b', type: 'module', label: 'B' },
          { id: 'c', type: 'module', label: 'C' },
          { id: 'd', type: 'module', label: 'D' },
        ],
        edges: [
          { source: 'index', target: 'a', type: 'imports' },
          { source: 'index', target: 'b', type: 'imports' },
          { source: 'index', target: 'c', type: 'imports' },
          { source: 'index', target: 'd', type: 'imports' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)
      const bottlenecks = identifyBottlenecksByDegree(degreeScores, 3)

      expect(bottlenecks).toContain('index')
    })
  })

  // ── Ranking Tests ──────────────────────────────────────────────────────

  describe('rankByInDegree', () => {
    it('ranks nodes by in-degree', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'b', target: 'a', type: 'calls' },
          { source: 'c', target: 'a', type: 'calls' },
          { source: 'c', target: 'b', type: 'calls' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)
      const ranked = rankByInDegree(degreeScores)

      // 'a' has in-degree 2, 'b' has in-degree 1, 'c' has in-degree 0
      expect(ranked[0].nodeId).toBe('a')
      expect(ranked[1].nodeId).toBe('b')
      expect(ranked[2].nodeId).toBe('c')
    })

    it('respects limit', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'b', target: 'a', type: 'calls' },
          { source: 'c', target: 'a', type: 'calls' },
          { source: 'c', target: 'b', type: 'calls' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)
      const top2 = rankByInDegree(degreeScores, 2)

      expect(top2).toHaveLength(2)
      expect(top2[0].nodeId).toBe('a')
      expect(top2[1].nodeId).toBe('b')
    })
  })

  // ── Statistics Tests ───────────────────────────────────────────────────

  describe('getDegreeCentralityStats', () => {
    it('computes basic statistics', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
        ],
      }

      const degreeScores = computeDegreeCentrality(graph)
      const stats = getDegreeCentralityStats(degreeScores)

      expect(stats.maxInDegree).toBe(1)
      expect(stats.maxOutDegree).toBe(1)
      expect(stats.maxTotalDegree).toBe(2)
      expect(stats.avgInDegree).toBeGreaterThan(0)
      expect(stats.avgOutDegree).toBeGreaterThan(0)
    })

    it('handles empty scores', () => {
      const stats = getDegreeCentralityStats([])

      expect(stats.maxInDegree).toBe(0)
      expect(stats.maxOutDegree).toBe(0)
      expect(stats.avgInDegree).toBe(0)
    })
  })
})
