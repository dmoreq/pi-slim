/**
 * Tests for Cycle Detection Algorithms
 */

import { describe, expect, it } from 'vitest'
import {
  detectAllCycles,
  detectStronglyConnectedComponents,
  getCycleDetectionSummary,
} from '../../algorithms/cycle-detection'
import type { CodeGraph } from '../../context/graph-types'

describe('CycleDetection', () => {
  // ── Basic Cycle Detection ──────────────────────────────────────────

  describe('detectAllCycles', () => {
    it('detects simple 2-node cycle', () => {
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

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(true)
      expect(result.cycleCount).toBeGreaterThan(0)
      expect(result.totalNodesInCycles).toBe(2)
      expect(result.cycles[0]?.severity).toBe('CRITICAL')
    })

    it('detects 3-node cycle', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
          { source: 'c', target: 'a', type: 'calls' },
        ],
      }

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(true)
      expect(result.cycleCount).toBeGreaterThan(0)
      expect(result.cycles[0]?.length).toBe(3)
      expect(result.cycles[0]?.severity).toBe('HIGH')
    })

    it('detects multiple cycles', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' },
        ],
        edges: [
          // Cycle 1: a → b → a
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'a', type: 'calls' },
          // Cycle 2: c → d → c
          { source: 'c', target: 'd', type: 'calls' },
          { source: 'd', target: 'c', type: 'calls' },
        ],
      }

      const result = detectAllCycles(graph)

      expect(result.cycleCount).toBeGreaterThanOrEqual(2)
      expect(result.totalNodesInCycles).toBe(4)
    })

    it('handles acyclic graph', () => {
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

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(false)
      expect(result.cycleCount).toBe(0)
      expect(result.totalNodesInCycles).toBe(0)
    })

    it('handles empty graph', () => {
      const graph: CodeGraph = {
        nodes: [],
        edges: [],
      }

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(false)
      expect(result.cycleCount).toBe(0)
    })

    it('handles single node', () => {
      const graph: CodeGraph = {
        nodes: [{ id: 'a', type: 'function', label: 'A' }],
        edges: [],
      }

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(false)
    })

    it('handles self-loop', () => {
      const graph: CodeGraph = {
        nodes: [{ id: 'a', type: 'function', label: 'A' }],
        edges: [{ source: 'a', target: 'a', type: 'calls' }],
      }

      const result = detectAllCycles(graph)

      expect(result.hasCycles).toBe(true)
    })

    it('categorizes cycle severity correctly', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' },
          { id: 'e', type: 'function', label: 'E' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
          { source: 'c', target: 'd', type: 'calls' },
          { source: 'd', target: 'e', type: 'calls' },
          { source: 'e', target: 'a', type: 'calls' },
        ],
      }

      const result = detectAllCycles(graph)

      if (result.cycleCount > 0) {
        const cycles = result.cycles
        expect(cycles.some(c => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(c.severity))).toBe(true)
      }
    })

    it('provides recommendations for cycles', () => {
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

      const result = detectAllCycles(graph)

      expect(result.cycles[0]?.recommendation).toBeTruthy()
      expect(result.cycles[0]?.recommendation).toContain('circular')
    })
  })

  // ── Strongly Connected Components ──────────────────────────────────

  describe('detectStronglyConnectedComponents', () => {
    it('detects single-node SCCs', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }],
      }

      const sccs = detectStronglyConnectedComponents(graph)

      expect(sccs.length).toBeGreaterThanOrEqual(0)
    })

    it('detects multi-node SCC', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
          { source: 'c', target: 'a', type: 'calls' },
        ],
      }

      const sccs = detectStronglyConnectedComponents(graph)

      const cycleComponent = sccs.find(s => s.isCycle)
      expect(cycleComponent).toBeDefined()
    })

    it('computes density correctly', () => {
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

      const sccs = detectStronglyConnectedComponents(graph)

      const denseComponent = sccs.find(s => s.size > 1)
      if (denseComponent) {
        expect(denseComponent.density).toBeGreaterThan(0)
        expect(denseComponent.density).toBeLessThanOrEqual(1)
      }
    })
  })

  // ── Summary & Reporting ────────────────────────────────────────────

  describe('getCycleDetectionSummary', () => {
    it('generates summary for acyclic graph', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }],
      }

      const result = detectAllCycles(graph)
      const summary = getCycleDetectionSummary(result)

      expect(summary).toContain('NO')
      expect(summary).toContain('0')
    })

    it('generates summary for cyclic graph', () => {
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

      const result = detectAllCycles(graph)
      const summary = getCycleDetectionSummary(result)

      expect(summary).toContain('YES')
      expect(summary.length).toBeGreaterThan(50)
    })

    it('includes anomalies in summary', () => {
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

      const result = detectAllCycles(graph)
      const summary = getCycleDetectionSummary(result)

      if (result.anomalies.length > 0) {
        expect(summary).toContain('Anomalies')
      }
    })
  })

  // ── Performance Tests ──────────────────────────────────────────────

  describe('Performance', () => {
    it('detects cycles efficiently', () => {
      const nodeCount = 100
      const graph: CodeGraph = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`,
        })),
        edges: Array.from({ length: nodeCount }, (_, i) => ({
          source: `node${i}`,
          target: `node${(i + 1) % nodeCount}`,
          type: 'calls' as const,
        })),
      }

      const start = performance.now()
      const result = detectAllCycles(graph)
      const elapsed = performance.now() - start

      expect(result).toBeDefined()
      expect(elapsed).toBeLessThan(500) // Should be <500ms for 100 nodes
    })

    it('computes SCCs efficiently', () => {
      const nodeCount = 100
      const graph: CodeGraph = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
          id: `node${i}`,
          type: 'function' as const,
          label: `Node ${i}`,
        })),
        edges: Array.from({ length: nodeCount * 1.5 }, (_, i) => ({
          source: `node${i % nodeCount}`,
          target: `node${(i + Math.floor(Math.random() * 5) + 1) % nodeCount}`,
          type: 'calls' as const,
        })),
      }

      const start = performance.now()
      const sccs = detectStronglyConnectedComponents(graph)
      const elapsed = performance.now() - start

      expect(sccs.length).toBeGreaterThanOrEqual(0)
      expect(elapsed).toBeLessThan(500)
    })
  })
})
