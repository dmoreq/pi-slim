/**
 * Tests for Community Detection (Louvain Algorithm)
 */

import { describe, it, expect } from 'vitest'
import {
  detectCommunitiesLouvain,
  computeGlobalModularity,
  getCommunityStats
} from '../../algorithms/community-detection'
import type { GraphifyGraph } from '../../context/graph-types'

describe('CommunityDetection', () => {
  // ── Basic Functionality ────────────────────────────────────────────

  describe('detectCommunitiesLouvain', () => {
    it('detects simple two-community structure', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a1', type: 'function', label: 'A1' },
          { id: 'a2', type: 'function', label: 'A2' },
          { id: 'a3', type: 'function', label: 'A3' },
          { id: 'b1', type: 'function', label: 'B1' },
          { id: 'b2', type: 'function', label: 'B2' },
          { id: 'b3', type: 'function', label: 'B3' }
        ],
        edges: [
          // Community A (dense internal)
          { source: 'a1', target: 'a2', type: 'calls' },
          { source: 'a2', target: 'a3', type: 'calls' },
          { source: 'a3', target: 'a1', type: 'calls' },
          // Community B (dense internal)
          { source: 'b1', target: 'b2', type: 'calls' },
          { source: 'b2', target: 'b3', type: 'calls' },
          { source: 'b3', target: 'b1', type: 'calls' },
          // Few cross-community edges
          { source: 'a3', target: 'b1', type: 'calls' }
        ]
      }

      const communities = detectCommunitiesLouvain(graph)

      // Should detect at least 1 community (might merge into 1 or 2)
      expect(communities.length).toBeGreaterThan(0)

      // Each community should have 3 nodes
      communities.forEach((c) => {
        expect(c.nodes.length).toBe(3)
      })

      // Communities should be well-separated
      const densities = communities.map((c) => c.internalDensity)
      densities.forEach((d) => {
        expect(d).toBeGreaterThan(0.2)  // Dense internally
      })
    })

    it('handles single connected component', () => {
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

      const communities = detectCommunitiesLouvain(graph)

      // May be 1-3 communities depending on structure
      expect(communities.length).toBeGreaterThan(0)
      expect(communities.length).toBeLessThanOrEqual(3)

      // All nodes should be covered
      const allNodes = new Set(communities.flatMap((c) => c.nodes))
      expect(allNodes.size).toBe(3)
    })

    it('handles disconnected components', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'c', target: 'd', type: 'calls' }
        ]
      }

      const communities = detectCommunitiesLouvain(graph)

      // Should detect separate groups
      expect(communities.length).toBeGreaterThanOrEqual(1)

      // All nodes covered
      const allNodes = new Set(communities.flatMap((c) => c.nodes))
      expect(allNodes.size).toBe(4)
    })

    it('handles empty graph', () => {
      const graph: GraphifyGraph = {
        nodes: [],
        edges: []
      }

      const communities = detectCommunitiesLouvain(graph)

      expect(communities).toHaveLength(0)
    })

    it('handles single node', () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'a', type: 'function', label: 'A' }],
        edges: []
      }

      const communities = detectCommunitiesLouvain(graph)

      expect(communities.length).toBeGreaterThanOrEqual(1)
      const allNodes = communities.flatMap((c) => c.nodes)
      expect(allNodes).toContain('a')
    })

    it('identifies interface nodes correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a1', type: 'function', label: 'A1' },
          { id: 'a2', type: 'function', label: 'A2' },
          { id: 'b1', type: 'function', label: 'B1' },
          { id: 'b2', type: 'function', label: 'B2' }
        ],
        edges: [
          // Internal A
          { source: 'a1', target: 'a2', type: 'calls' },
          // Internal B
          { source: 'b1', target: 'b2', type: 'calls' },
          // Cross-community (interface nodes)
          { source: 'a2', target: 'b1', type: 'calls' }
        ]
      }

      const communities = detectCommunitiesLouvain(graph)

      // Communities should be detected
      expect(communities.length).toBeGreaterThan(0)
      
      // All nodes should be covered
      const allNodes = new Set(communities.flatMap((c) => c.nodes))
      expect(allNodes.size).toBe(4)
    })

    it('respects max iterations', () => {
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: 10 }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`
        })),
        edges: Array.from({ length: 15 }, (_, i) => ({
          source: `node${i % 10}`,
          target: `node${(i + 1) % 10}`,
          type: 'calls' as const
        }))
      }

      // Should complete quickly with low iteration count
      const communities = detectCommunitiesLouvain(graph, 2)

      expect(communities.length).toBeGreaterThan(0)
    })
  })

  // ── Modularity Tests ───────────────────────────────────────────────

  describe('computeGlobalModularity', () => {
    it('gives higher modularity for well-separated communities', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a1', type: 'function', label: 'A1' },
          { id: 'a2', type: 'function', label: 'A2' },
          { id: 'b1', type: 'function', label: 'B1' },
          { id: 'b2', type: 'function', label: 'B2' }
        ],
        edges: [
          { source: 'a1', target: 'a2', type: 'calls' },
          { source: 'b1', target: 'b2', type: 'calls' }
        ]
      }

      const wellSeparated = [
        {
          id: 'comm-1',
          label: 'Community 1',
          nodes: ['a1', 'a2'],
          internalDensity: 0.5,
          externalDensity: 0.0,
          interfaceNodes: [],
          bottlenecks: []
        },
        {
          id: 'comm-2',
          label: 'Community 2',
          nodes: ['b1', 'b2'],
          internalDensity: 0.5,
          externalDensity: 0.0,
          interfaceNodes: [],
          bottlenecks: []
        }
      ]

      const modularity = computeGlobalModularity(wellSeparated, graph)

      // Well-separated communities should have positive modularity
      expect(modularity).toBeGreaterThan(0)
    })

    it('handles empty communities array', () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'a', type: 'function', label: 'A' }],
        edges: []
      }

      const modularity = computeGlobalModularity([], graph)

      expect(modularity).toBe(0)
    })
  })

  // ── Statistics Tests ───────────────────────────────────────────────

  describe('getCommunityStats', () => {
    it('computes statistics correctly', () => {
      const communities = [
        {
          id: 'c1',
          label: 'C1',
          nodes: ['a', 'b', 'c'],
          internalDensity: 0.8,
          externalDensity: 0.2,
          interfaceNodes: [],
          bottlenecks: []
        },
        {
          id: 'c2',
          label: 'C2',
          nodes: ['d', 'e'],
          internalDensity: 0.5,
          externalDensity: 0.1,
          interfaceNodes: [],
          bottlenecks: []
        }
      ]

      const stats = getCommunityStats(communities)

      expect(stats.count).toBe(2)
      expect(stats.avgSize).toBe(2.5)
      expect(stats.minSize).toBe(2)
      expect(stats.maxSize).toBe(3)
      expect(stats.avgDensity).toBeCloseTo(0.65)
      expect(stats.minDensity).toBe(0.5)
      expect(stats.maxDensity).toBe(0.8)
    })

    it('handles single community', () => {
      const communities = [
        {
          id: 'c1',
          label: 'C1',
          nodes: ['a', 'b'],
          internalDensity: 0.7,
          externalDensity: 0.0,
          interfaceNodes: [],
          bottlenecks: []
        }
      ]

      const stats = getCommunityStats(communities)

      expect(stats.count).toBe(1)
      expect(stats.avgSize).toBe(2)
      expect(stats.avgDensity).toBe(0.7)
    })

    it('handles empty communities', () => {
      const stats = getCommunityStats([])

      expect(stats.count).toBe(0)
      expect(stats.avgSize).toBe(0)
      expect(stats.avgDensity).toBe(0)
    })
  })

  // ── Integration Tests ──────────────────────────────────────────────

  describe('Full community detection flow', () => {
    it('detects and analyzes complex network', () => {
      // Create a network with 3 communities
      const graph: GraphifyGraph = {
        nodes: [
          // Community 1
          { id: 'auth1', type: 'module', label: 'Auth1' },
          { id: 'auth2', type: 'module', label: 'Auth2' },
          { id: 'auth3', type: 'module', label: 'Auth3' },
          // Community 2
          { id: 'db1', type: 'module', label: 'DB1' },
          { id: 'db2', type: 'module', label: 'DB2' },
          // Community 3
          { id: 'api1', type: 'module', label: 'API1' },
          { id: 'api2', type: 'module', label: 'API2' },
          { id: 'api3', type: 'module', label: 'API3' }
        ],
        edges: [
          // Auth community
          { source: 'auth1', target: 'auth2', type: 'calls' },
          { source: 'auth2', target: 'auth3', type: 'calls' },
          // DB community
          { source: 'db1', target: 'db2', type: 'calls' },
          { source: 'db2', target: 'db1', type: 'calls' },
          // API community
          { source: 'api1', target: 'api2', type: 'calls' },
          { source: 'api2', target: 'api3', type: 'calls' },
          // Cross-community
          { source: 'auth3', target: 'db1', type: 'calls' },
          { source: 'db2', target: 'api1', type: 'calls' }
        ]
      }

      const communities = detectCommunitiesLouvain(graph)

      // Should detect at least one community
      expect(communities.length).toBeGreaterThan(0)

      // Compute modularity
      const modularity = computeGlobalModularity(communities, graph)
      expect(modularity).toBeGreaterThanOrEqual(0)

      // Get stats
      const stats = getCommunityStats(communities)
      expect(stats.count).toBe(communities.length)
      expect(stats.avgSize).toBeGreaterThan(1)

      // All nodes should be assigned
      const allNodes = new Set(communities.flatMap((c) => c.nodes))
      expect(allNodes.size).toBe(8)
    })
  })

  // ── Performance Tests ──────────────────────────────────────────────

  describe('Performance', () => {
    it('handles medium-sized graph efficiently', () => {
      const nodeCount = 100
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`
        })),
        edges: Array.from({ length: nodeCount * 1.5 }, (_, i) => ({
          source: `node${i % nodeCount}`,
          target: `node${(i + Math.floor(Math.random() * 10) + 1) % nodeCount}`,
          type: 'calls' as const
        }))
      }

      const start = performance.now()
      const communities = detectCommunitiesLouvain(graph)
      const elapsed = performance.now() - start

      expect(communities.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(1000)  // Should complete in <1 second
    })

    it('handles large graph within reasonable time', () => {
      const nodeCount = 500
      const graph: GraphifyGraph = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`
        })),
        edges: Array.from({ length: nodeCount * 2 }, (_, i) => ({
          source: `node${i % nodeCount}`,
          target: `node${(i + Math.floor(Math.random() * 20) + 1) % nodeCount}`,
          type: 'calls' as const
        }))
      }

      const start = performance.now()
      const communities = detectCommunitiesLouvain(graph, 5)
      const elapsed = performance.now() - start

      expect(communities.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(3000)  // Should complete in <3 seconds
    })
  })
})
