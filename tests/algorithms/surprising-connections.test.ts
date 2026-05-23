/**
 * Tests for Surprising Connection Detection
 */

import { describe, expect, it } from 'vitest'
import {
  categorizeSurprises,
  computeSurpriseStats,
  detectSurprisingConnections,
  filterHighImpactSurprises,
  getSurpriseNodes,
  getSurpriseRecommendation,
  getTopSurprises,
} from '../../algorithms/surprising-connections'
import type { CodeGraph, SurprisingConnection } from '../../context/graph-types'

describe('SurprisingConnections', () => {
  // ── Cross-Community Detection ──────────────────────────────────────

  describe('detectSurprisingConnections - Cross-Community', () => {
    it('detects cross-community edges', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'auth:module', type: 'module', label: 'Auth' },
          { id: 'auth:func', type: 'function', label: 'AuthFunc' },
          { id: 'db:module', type: 'module', label: 'DB' },
          { id: 'db:func', type: 'function', label: 'DBFunc' },
        ],
        edges: [{ source: 'auth:module', target: 'db:module', type: 'calls' }],
      }

      const communities = new Map([
        ['auth:module', 'auth-community'],
        ['auth:func', 'auth-community'],
        ['db:module', 'db-community'],
        ['db:func', 'db-community'],
      ])

      const surprises = detectSurprisingConnections(graph, communities)

      expect(surprises).toHaveLength(1)
      expect(surprises[0].reason).toBe('cross-community')
      expect(surprises[0].confidence).toBeGreaterThan(0.7)
    })

    it('ignores same-community edges', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }],
      }

      const communities = new Map([
        ['a', 'module-a'],
        ['b', 'module-a'],
      ])

      const surprises = detectSurprisingConnections(graph, communities)

      expect(surprises).toHaveLength(0)
    })
  })

  // ── Legacy Detection ───────────────────────────────────────────────

  describe('detectSurprisingConnections - Legacy', () => {
    it('detects modern code using legacy', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'src/auth.ts', type: 'module', label: 'Auth' },
          { id: 'src/legacy/login.ts', type: 'module', label: 'Legacy Login' },
        ],
        edges: [{ source: 'src/auth.ts', target: 'src/legacy/login.ts', type: 'imports' }],
      }

      const surprises = detectSurprisingConnections(graph)

      expect(surprises).toHaveLength(1)
      expect(surprises[0].reason).toBe('legacy')
      expect(surprises[0].confidence).toBeGreaterThan(0.8)
    })

    it('ignores legacy-to-legacy connections', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'legacy/v1', type: 'module', label: 'Legacy V1' },
          { id: 'legacy/v2', type: 'module', label: 'Legacy V2' },
        ],
        edges: [{ source: 'legacy/v1', target: 'legacy/v2', type: 'imports' }],
      }

      const surprises = detectSurprisingConnections(graph)

      expect(surprises).toHaveLength(0)
    })
  })

  // ── Circular Detection ─────────────────────────────────────────────

  describe('detectSurprisingConnections - Circular', () => {
    it('detects circular edges', () => {
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

      const cycles = new Set(['a→b', 'b→a'])

      const surprises = detectSurprisingConnections(graph, undefined, cycles)

      expect(surprises.filter(s => s.reason === 'circular')).toHaveLength(2)
      expect(surprises[0].confidence).toBe(1.0) // Highest confidence
    })
  })

  // ── Filtering Tests ────────────────────────────────────────────────

  describe('filterHighImpactSurprises', () => {
    it('filters by confidence threshold', () => {
      const surprises: SurprisingConnection[] = [
        {
          source: 'a',
          target: 'b',
          reason: 'circular',
          confidence: 1.0,
        },
        {
          source: 'c',
          target: 'd',
          reason: 'unexpected',
          confidence: 0.4,
        },
      ]

      const filtered = filterHighImpactSurprises(surprises, 0.7)

      expect(filtered).toHaveLength(1)
      expect(filtered[0].source).toBe('a')
    })

    it('prioritizes by reason', () => {
      const surprises: SurprisingConnection[] = [
        {
          source: 'a',
          target: 'b',
          reason: 'unexpected',
          confidence: 0.9,
        },
        {
          source: 'c',
          target: 'd',
          reason: 'circular',
          confidence: 0.7,
        },
      ]

      const filtered = filterHighImpactSurprises(surprises, 0.7)

      // Circular should come first despite lower confidence
      expect(filtered[0].reason).toBe('circular')
      expect(filtered[1].reason).toBe('unexpected')
    })
  })

  // ── Categorization Tests ───────────────────────────────────────────

  describe('categorizeSurprises', () => {
    it('categorizes surprises by reason', () => {
      const surprises: SurprisingConnection[] = [
        { source: 'a', target: 'b', reason: 'circular', confidence: 1.0 },
        { source: 'c', target: 'd', reason: 'legacy', confidence: 0.9 },
        { source: 'e', target: 'f', reason: 'unexpected', confidence: 0.5 },
      ]

      const categories = categorizeSurprises(surprises)

      expect(categories.circular).toHaveLength(1)
      expect(categories.legacy).toHaveLength(1)
      expect(categories.unexpected).toHaveLength(1)
      expect(categories['cross-community']).toHaveLength(0)
    })
  })

  // ── Node Extraction Tests ──────────────────────────────────────────

  describe('getSurpriseNodes', () => {
    it('extracts all involved nodes', () => {
      const surprises: SurprisingConnection[] = [
        { source: 'a', target: 'b', reason: 'circular', confidence: 1.0 },
        { source: 'b', target: 'c', reason: 'circular', confidence: 1.0 },
        { source: 'c', target: 'a', reason: 'circular', confidence: 1.0 },
      ]

      const nodes = getSurpriseNodes(surprises)

      expect(nodes.size).toBe(3)
      expect(nodes.has('a')).toBe(true)
      expect(nodes.has('b')).toBe(true)
      expect(nodes.has('c')).toBe(true)
    })

    it('handles duplicates', () => {
      const surprises: SurprisingConnection[] = [
        { source: 'a', target: 'b', reason: 'circular', confidence: 1.0 },
        { source: 'a', target: 'c', reason: 'circular', confidence: 1.0 },
      ]

      const nodes = getSurpriseNodes(surprises)

      expect(nodes.size).toBe(3)
    })
  })

  // ── Top Surprises Tests ────────────────────────────────────────────

  describe('getTopSurprises', () => {
    it('returns top N by confidence', () => {
      const surprises: SurprisingConnection[] = [
        { source: 'a', target: 'b', reason: 'circular', confidence: 0.5 },
        { source: 'c', target: 'd', reason: 'legacy', confidence: 0.9 },
        { source: 'e', target: 'f', reason: 'circular', confidence: 0.7 },
      ]

      const top2 = getTopSurprises(surprises, 2)

      expect(top2).toHaveLength(2)
      expect(top2[0].confidence).toBe(0.9)
      expect(top2[1].confidence).toBe(0.7)
    })

    it('respects limit', () => {
      const surprises = Array.from({ length: 20 }, (_, i) => ({
        source: `a${i}`,
        target: `b${i}`,
        reason: 'circular' as const,
        confidence: Math.random(),
      }))

      const top5 = getTopSurprises(surprises, 5)

      expect(top5).toHaveLength(5)
    })
  })

  // ── Statistics Tests ───────────────────────────────────────────────

  describe('computeSurpriseStats', () => {
    it('computes statistics correctly', () => {
      const surprises: SurprisingConnection[] = [
        { source: 'a', target: 'b', reason: 'circular', confidence: 1.0 },
        { source: 'c', target: 'd', reason: 'legacy', confidence: 0.8 },
        { source: 'e', target: 'f', reason: 'circular', confidence: 0.6 },
      ]

      const stats = computeSurpriseStats(surprises)

      expect(stats.totalCount).toBe(3)
      expect(stats.byReason.circular).toBe(2)
      expect(stats.byReason.legacy).toBe(1)
      expect(stats.avgConfidence).toBeCloseTo((1.0 + 0.8 + 0.6) / 3)
      expect(stats.maxConfidence).toBe(1.0)
      expect(stats.nodeCount).toBe(6)
    })

    it('handles empty surprises', () => {
      const stats = computeSurpriseStats([])

      expect(stats.totalCount).toBe(0)
      expect(stats.avgConfidence).toBe(0)
      expect(stats.nodeCount).toBe(0)
    })
  })

  // ── Recommendation Tests ───────────────────────────────────────────

  describe('getSurpriseRecommendation', () => {
    it('provides circular recommendation', () => {
      const surprise: SurprisingConnection = {
        source: 'a',
        target: 'b',
        reason: 'circular',
        confidence: 1.0,
      }

      const rec = getSurpriseRecommendation(surprise)

      expect(rec).toContain('Break circular dependency')
      expect(rec).toContain('a')
      expect(rec).toContain('b')
    })

    it('provides legacy recommendation', () => {
      const surprise: SurprisingConnection = {
        source: 'modern',
        target: 'legacy',
        reason: 'legacy',
        confidence: 0.9,
      }

      const rec = getSurpriseRecommendation(surprise)

      expect(rec).toContain('legacy')
      expect(rec).toContain('migration')
    })

    it('provides cross-community recommendation', () => {
      const surprise: SurprisingConnection = {
        source: 'auth',
        target: 'db',
        reason: 'cross-community',
        confidence: 0.7,
      }

      const rec = getSurpriseRecommendation(surprise)

      expect(rec).toContain('module boundary')
      expect(rec).toContain('coupling')
    })
  })

  // ── Integration Tests ──────────────────────────────────────────────

  describe('Full flow', () => {
    it('detects all surprise types in complex graph', () => {
      const graph: CodeGraph = {
        nodes: [
          { id: 'auth', type: 'module', label: 'Auth' },
          { id: 'db', type: 'module', label: 'DB' },
          { id: 'legacy/old', type: 'module', label: 'Legacy' },
        ],
        edges: [
          { source: 'auth', target: 'db', type: 'calls' },
          { source: 'auth', target: 'legacy/old', type: 'imports' },
        ],
      }

      const communities = new Map([
        ['auth', 'auth-comm'],
        ['db', 'db-comm'],
        ['legacy/old', 'legacy-comm'],
      ])

      const surprises = detectSurprisingConnections(graph, communities)

      // Should detect cross-community (first edge) and/or legacy (second edge with legacy target)
      const reasons = surprises.map(s => s.reason)
      expect(reasons.length).toBeGreaterThan(0)
      // Check if we detected cross-community relationship
      expect(reasons).toContain('cross-community')
    })
  })
})
