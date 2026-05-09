/**
 * Tests for PageRank Algorithm
 */

import { describe, it, expect } from 'vitest'
import {
  computePageRank,
  identifyGodNodesByPageRank,
  rankByPageRank,
  getPageRankStats,
  combineImportanceScores
} from '../../algorithms/pagerank'
import { computeDegreeCentrality } from '../../algorithms/centrality'
import type { GraphifyGraph } from '../../context/graph-types'

describe('PageRank', () => {
  // ── Basic Functionality ────────────────────────────────────────────────

  describe('computePageRank', () => {
    it('computes PageRank for simple linear graph', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const result = computePageRank(graph)

      // Should have scores for all nodes
      expect(result).toHaveLength(3)

      // All scores should be 0-1
      result.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      })

      // In a linear graph a->b->c, 'b' is important as it's in the middle
      // It gets contributions from 'a' and redistributes to 'c'
      const b = result.find((r) => r.nodeId === 'b')
      const a = result.find((r) => r.nodeId === 'a')
      const c = result.find((r) => r.nodeId === 'c')

      // 'b' should rank higher than 'a' (b gets incoming from a)
      expect(b?.score).toBeGreaterThan((a?.score ?? 0))
    })

    it('identifies hub node with multiple incoming edges', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'hub', type: 'function', label: 'Hub' },
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'hub', type: 'calls' },
          { source: 'b', target: 'hub', type: 'calls' },
          { source: 'c', target: 'hub', type: 'calls' }
        ]
      }

      const result = computePageRank(graph)
      const hub = result.find((r) => r.nodeId === 'hub')

      // Hub should have higher rank (depended on by many)
      expect(hub?.score).toBeGreaterThan(0.15)
      expect(result[0].nodeId).toBe('hub')
    })

    it('ranks sorted by score descending', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const result = computePageRank(graph)

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score)
      }
    })

    it('normalizes scores correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }]
      }

      const result = computePageRank(graph)

      // All scores should be between 0 and 1
      result.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      })
    })

    it('handles empty graph', () => {
      const graph: GraphifyGraph = {
        nodes: [],
        edges: []
      }

      const result = computePageRank(graph)

      expect(result).toHaveLength(0)
    })

    it('handles isolated nodes', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' }
        ],
        edges: []
      }

      const result = computePageRank(graph)

      expect(result).toHaveLength(2)
      // Without edges, scores should be roughly equal
      expect(
        Math.abs((result[0].score ?? 0) - (result[1].score ?? 0))
      ).toBeLessThan(0.1)
    })

    it('converges with different damping factors', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const result085 = computePageRank(graph, 0.85)
      const result070 = computePageRank(graph, 0.70)

      // Both should have valid scores
      expect(result085).toHaveLength(3)
      expect(result070).toHaveLength(3)

      // Raw scores should differ due to different damping
      expect(result085[0].rawScore).not.toEqual(result070[0].rawScore)
    })

    it('converges within max iterations', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }]
      }

      // Should complete without timeout
      const result = computePageRank(graph, 0.85, 10)

      expect(result).toHaveLength(2)
      expect(result[0].score).toBeGreaterThan(0)
    })
  })

  // ── God Node Identification ────────────────────────────────────────────

  describe('identifyGodNodesByPageRank', () => {
    it('identifies nodes above threshold', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'important', type: 'function', label: 'Important' },
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' }
        ],
        edges: [
          { source: 'a', target: 'important', type: 'calls' },
          { source: 'b', target: 'important', type: 'calls' }
        ]
      }

      const pageRankScores = computePageRank(graph)
      const godNodes = identifyGodNodesByPageRank(pageRankScores, 0.2)

      expect(godNodes.length).toBeGreaterThan(0)
      expect(godNodes).toContain('important')
    })

    it('respects threshold', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }]
      }

      const pageRankScores = computePageRank(graph)

      // Very high threshold should filter nodes
      const godNodes = identifyGodNodesByPageRank(pageRankScores, 0.95)

      expect(godNodes.length).toBeLessThanOrEqual(1)
    })
  })

  // ── Ranking Tests ──────────────────────────────────────────────────────

  describe('rankByPageRank', () => {
    it('returns all scores by default', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const pageRankScores = computePageRank(graph)
      const ranked = rankByPageRank(pageRankScores)

      expect(ranked).toHaveLength(3)
    })

    it('respects limit', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const pageRankScores = computePageRank(graph)
      const top2 = rankByPageRank(pageRankScores, 2)

      expect(top2).toHaveLength(2)
    })
  })

  // ── Statistics Tests ───────────────────────────────────────────────────

  describe('getPageRankStats', () => {
    it('computes statistics correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const pageRankScores = computePageRank(graph)
      const stats = getPageRankStats(pageRankScores)

      expect(stats.maxScore).toBeGreaterThan(0)
      expect(stats.minScore).toBeGreaterThanOrEqual(0)
      expect(stats.avgScore).toBeGreaterThan(0)
      expect(stats.medianScore).toBeGreaterThan(0)
      expect(stats.stdDev).toBeGreaterThanOrEqual(0)
      expect(stats.percentile95).toBeGreaterThan(0)
    })

    it('handles empty scores', () => {
      const stats = getPageRankStats([])

      expect(stats.maxScore).toBe(0)
      expect(stats.minScore).toBe(0)
      expect(stats.avgScore).toBe(0)
    })

    it('percentile95 is reasonable', () => {
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: 20 }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`
        })),
        edges: Array.from({ length: 19 }, (_, i) => ({
          source: `node${i}`,
          target: `node${i + 1}`,
          type: 'calls' as const
        }))
      }

      const pageRankScores = computePageRank(graph)
      const stats = getPageRankStats(pageRankScores)

      expect(stats.percentile95).toBeLessThanOrEqual(stats.maxScore)
      expect(stats.percentile95).toBeGreaterThanOrEqual(stats.minScore)
    })
  })

  // ── Combination Tests ──────────────────────────────────────────────────

  describe('combineImportanceScores', () => {
    it('combines degree and PageRank scores', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' }
        ]
      }

      const degreeScores = computeDegreeCentrality(graph)
      const pageRankScores = computePageRank(graph)

      // Convert to maps
      const degreeMap = new Map(
        degreeScores.map((d) => [d.nodeId, d.normalized])
      )
      const pageRankMap = new Map(
        pageRankScores.map((p) => [p.nodeId, p.score])
      )

      const combined = combineImportanceScores(degreeMap, pageRankMap)

      expect(combined.size).toBe(3)

      // All combined scores should be 0-1
      for (const score of combined.values()) {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }
    })

    it('respects weight parameters', () => {
      const degreeMap = new Map([
        ['a', 0.8],
        ['b', 0.2]
      ])

      const pageRankMap = new Map([
        ['a', 0.2],
        ['b', 0.8]
      ])

      // With degree weight 1.0, pagerank weight 0
      const degreeOnly = combineImportanceScores(degreeMap, pageRankMap, 1.0, 0)

      // 'a' should rank higher (degree 0.8 > pagerank 0.2)
      expect((degreeOnly.get('a') ?? 0) > (degreeOnly.get('b') ?? 0)).toBe(true)

      // With pagerank weight 1.0, degree weight 0
      const pageRankOnly = combineImportanceScores(
        degreeMap,
        pageRankMap,
        0,
        1.0
      )

      // 'b' should rank higher (pagerank 0.8 > degree 0.2)
      expect((pageRankOnly.get('b') ?? 0) > (pageRankOnly.get('a') ?? 0)).toBe(
        true
      )
    })
  })

  // ── Performance Tests ──────────────────────────────────────────────────

  describe('Performance', () => {
    it('handles medium-sized graph efficiently', () => {
      const n = 100
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Function ${i}`
        })),
        edges: Array.from({ length: n - 1 }, (_, i) => ({
          source: `node${i}`,
          target: `node${i + 1}`,
          type: 'calls' as const
        }))
      }

      const start = performance.now()
      const result = computePageRank(graph)
      const elapsed = performance.now() - start

      expect(result).toHaveLength(n)
      expect(elapsed).toBeLessThan(200) // Should complete in <200ms
    })

    it('handles large-sized graph within reasonable time', () => {
      const n = 500
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Function ${i}`
        })),
        edges: Array.from({ length: n - 1 }, (_, i) => ({
          source: `node${i}`,
          target: `node${(i + Math.floor(Math.random() * 10) + 1) % n}`,
          type: 'calls' as const
        }))
      }

      const start = performance.now()
      const result = computePageRank(graph)
      const elapsed = performance.now() - start

      expect(result).toHaveLength(n)
      expect(elapsed).toBeLessThan(1000) // Should complete in <1s
    })
  })
})
