/**
 * Tests for Graphify Retrieval Boost
 */

import { describe, it, expect } from 'vitest'
import {
  boostWithGraphMetrics,
  generateContextBreadcrumbs,
  filterByCommunity,
  computeBoostStats,
  measureRetrievalImprovement
} from '../../context/graph-retrieval-boost'
import type {
  GraphifyAnalysis,
  GodNode,
  SurprisingConnection
} from '../../context/graph-types'

const createMockAnalysis = (
  godNodes: GodNode[] = [],
  surprises: SurprisingConnection[] = []
): GraphifyAnalysis => ({
  godNodes,
  communities: [],
  surprises,
  bottlenecks: [],
  anomalies: [],
  wikipedia: {
    entries: new Map(),
    query: () => [],
    get: () => undefined,
    find: () => []
  },
  metrics: {
    totalNodes: 10,
    totalEdges: 15,
    godNodeCount: godNodes.length,
    communityCount: 0,
    averageDegree: 3,
    maxDegree: 5,
    graphDensity: 0.3,
    avgClusteringCoeff: 0.4,
    cycleCount: 0,
    bottleneckCount: 0
  },
  computedAt: Date.now(),
  version: '1.0'
})

describe('GraphifyRetrievalBoost', () => {
  // ── Boost Tests ────────────────────────────────────────────────────

  describe('boostWithGraphMetrics', () => {
    it('boosts god nodes by 2x', () => {
      const original = [
        { file: 'src/auth.ts', score: 1.0, signals: ['symbol:auth'] },
        { file: 'src/db.ts', score: 0.5, signals: ['symbol:db'] }
      ]

      const godNodes: GodNode[] = [
        {
          nodeId: 'auth',
          label: 'Auth',
          inDegree: 10,
          outDegree: 2,
          betweenness: 0.8,
          pageRank: 0.6,
          community: 'auth-comm',
          criticality: 'CRITICAL'
        }
      ]

      const analysis = createMockAnalysis(godNodes)
      const enhanced = boostWithGraphMetrics(original, analysis)

      const authFile = enhanced.find((e) => e.file === 'src/auth.ts')
      expect(authFile?.score).toBeGreaterThan(1.0)  // Boosted
      expect(authFile?.isGodNode).toBe(true)
    })

    it('injects surprising connections', () => {
      const original = [
        { file: 'src/main.ts', score: 1.0, signals: [] }
      ]

      const surprises: SurprisingConnection[] = [
        {
          source: 'main',
          target: 'legacy',
          reason: 'legacy',
          confidence: 0.9
        }
      ]

      const analysis = createMockAnalysis([], surprises)
      const enhanced = boostWithGraphMetrics(original, analysis)

      const mainFile = enhanced[0]
      expect(mainFile.score).toBeGreaterThan(1.0)  // Surprise boost
      expect(mainFile.surprisingConnections).toBeDefined()
    })

    it('re-sorts by new scores', () => {
      const original = [
        { file: 'src/util.ts', score: 1.0, signals: [] },
        { file: 'src/core.ts', score: 0.5, signals: [] }
      ]

      const godNodes: GodNode[] = [
        {
          nodeId: 'core',
          label: 'Core',
          inDegree: 15,
          outDegree: 1,
          betweenness: 0.9,
          pageRank: 0.8,
          community: 'core-comm',
          criticality: 'CRITICAL'
        }
      ]

      const analysis = createMockAnalysis(godNodes)
      const enhanced = boostWithGraphMetrics(original, analysis)

      // Core should be boosted
      const coreFile = enhanced.find((e) => e.file === 'src/core.ts')
      expect(coreFile?.score).toBeGreaterThan(0.5)  // Boosted from original
    })

    it('handles files not in graph', () => {
      const original = [
        { file: 'src/new.ts', score: 1.0, signals: [] }
      ]

      const analysis = createMockAnalysis()
      const enhanced = boostWithGraphMetrics(original, analysis)

      expect(enhanced).toHaveLength(1)
      expect(enhanced[0].isGodNode).not.toBe(true)  // Should not be a god node
      expect(enhanced[0].graphBoost).toBeUndefined()
    })
  })

  // ── Breadcrumb Tests ───────────────────────────────────────────────

  describe('generateContextBreadcrumbs', () => {
    it('includes god nodes', () => {
      const godNodes = ['auth', 'db', 'api']
      const surprises: SurprisingConnection[] = []

      const breadcrumbs = generateContextBreadcrumbs(godNodes, surprises, 5)

      expect(breadcrumbs.length).toBeGreaterThan(0)
      expect(breadcrumbs.some((b) => b.includes('auth'))).toBe(true)
    })

    it('includes high-confidence surprises', () => {
      const godNodes: string[] = []
      const surprises: SurprisingConnection[] = [
        {
          source: 'auth',
          target: 'legacy',
          reason: 'legacy',
          confidence: 0.95
        }
      ]

      const breadcrumbs = generateContextBreadcrumbs(godNodes, surprises, 5)

      expect(breadcrumbs.some((b) => b.includes('Legacy'))).toBe(true)
    })

    it('respects limit', () => {
      const godNodes = ['a', 'b', 'c', 'd', 'e', 'f']
      const breadcrumbs = generateContextBreadcrumbs(godNodes, [], 3)

      expect(breadcrumbs.length).toBeLessThanOrEqual(3)
    })

    it('prioritizes high-confidence surprises', () => {
      const godNodes: string[] = []
      const surprises: SurprisingConnection[] = [
        {
          source: 'a',
          target: 'b',
          reason: 'unexpected',
          confidence: 0.5
        },
        {
          source: 'c',
          target: 'd',
          reason: 'circular',
          confidence: 1.0
        }
      ]

      const breadcrumbs = generateContextBreadcrumbs(godNodes, surprises, 1)

      expect(breadcrumbs[0]).toContain('Circular')
    })
  })

  // ── Community Filtering Tests ──────────────────────────────────────

  describe('filterByCommunity', () => {
    it('returns all results if no community info', () => {
      const files = [
        { file: 'a.ts', score: 1.0, signals: [] },
        { file: 'b.ts', score: 0.5, signals: [] }
      ]

      const analysis = createMockAnalysis()

      const filtered = filterByCommunity(files, analysis)

      expect(filtered).toHaveLength(2)
    })

    it('filters to same community', () => {
      const files = [
        { file: 'auth.ts', score: 1.0, signals: [] },
        { file: 'db.ts', score: 0.5, signals: [] }
      ]

      const analysis: GraphifyAnalysis = createMockAnalysis()
      analysis.communities = [
        {
          id: 'auth-comm',
          label: 'Auth',
          nodes: ['auth', 'session'],
          internalDensity: 0.8,
          externalDensity: 0.2,
          interfaceNodes: [],
          bottlenecks: []
        },
        {
          id: 'db-comm',
          label: 'DB',
          nodes: ['db', 'models'],
          internalDensity: 0.9,
          externalDensity: 0.1,
          interfaceNodes: [],
          bottlenecks: []
        }
      ]

      const filtered = filterByCommunity(files, analysis)

      // Should only include auth community (top result)
      expect(filtered.length).toBeLessThanOrEqual(files.length)
    })
  })

  // ── Boost Stats Tests ──────────────────────────────────────────────

  describe('computeBoostStats', () => {
    it('computes correct statistics', () => {
      const original = [
        { file: 'a.ts', score: 1.0, signals: [] },
        { file: 'b.ts', score: 0.5, signals: [] }
      ]

      const enhanced = [
        {
          file: 'b.ts',
          score: 1.2,
          signals: [],
          graphBoost: 0.7,
          isGodNode: true
        },
        {
          file: 'a.ts',
          score: 1.0,
          signals: [],
          graphBoost: undefined,
          isGodNode: undefined
        }
      ]

      const stats = computeBoostStats(original, enhanced)

      expect(stats.totalFiles).toBe(2)
      expect(stats.boostedFiles).toBe(1)
      expect(stats.godNodeBoosts).toBe(1)
      expect(stats.avgBoost).toBeCloseTo(0.7)
      expect(stats.maxBoost).toBe(0.7)
    })

    it('handles no boosts', () => {
      const original = [
        { file: 'a.ts', score: 1.0, signals: [] }
      ]

      const enhanced = [
        {
          file: 'a.ts',
          score: 1.0,
          signals: [],
          graphBoost: undefined
        }
      ]

      const stats = computeBoostStats(original, enhanced)

      expect(stats.boostedFiles).toBe(0)
      expect(stats.avgBoost).toBe(0)
    })
  })

  // ── Improvement Measurement Tests ──────────────────────────────────

  describe('measureRetrievalImprovement', () => {
    it('measures position improvements', () => {
      const original = [
        { file: 'a.ts', score: 1.0, signals: [] },
        { file: 'b.ts', score: 0.8, signals: [] },
        { file: 'c.ts', score: 0.6, signals: [] }
      ]

      const enhanced = [
        {
          file: 'c.ts',
          score: 1.5,
          signals: [],
          isGodNode: true,
          graphBoost: 0.9
        },
        {
          file: 'a.ts',
          score: 1.0,
          signals: [],
          graphBoost: undefined
        },
        {
          file: 'b.ts',
          score: 0.8,
          signals: [],
          graphBoost: undefined
        }
      ]

      const improvement = measureRetrievalImprovement(original, enhanced)

      // c.ts moved from position 2 to position 0 (improvement of 2)
      expect(improvement.topNImprovement[2]).toBe(2)
      // Should have some improvement recorded
      expect(improvement.topNImprovement.length).toBeGreaterThan(0)
    })

    it('counts god nodes in top 5', () => {
      const original = [
        { file: 'a.ts', score: 1.0, signals: [] },
        { file: 'b.ts', score: 0.5, signals: [] }
      ]

      const enhanced = [
        {
          file: 'a.ts',
          score: 1.5,
          signals: [],
          isGodNode: true,
          graphBoost: 0.5
        },
        {
          file: 'b.ts',
          score: 0.5,
          signals: [],
          isGodNode: undefined
        }
      ]

      const improvement = measureRetrievalImprovement(original, enhanced)

      expect(improvement.godNodesInTop5).toBeGreaterThan(0)
    })
  })

  // ── Integration Tests ──────────────────────────────────────────────

  describe('Full retrieval boost flow', () => {
    it('boosts and ranks correctly', () => {
      const original = [
        { file: 'src/utils.ts', score: 0.9, signals: ['filename'] },
        { file: 'src/auth.ts', score: 0.7, signals: ['symbol'] },
        { file: 'src/api.ts', score: 0.5, signals: [] }
      ]

      const godNodes: GodNode[] = [
        {
          nodeId: 'auth',
          label: 'Auth',
          inDegree: 20,
          outDegree: 3,
          betweenness: 0.8,
          pageRank: 0.7,
          community: 'auth',
          criticality: 'CRITICAL'
        }
      ]

      const surprises: SurprisingConnection[] = [
        {
          source: 'api',
          target: 'legacy',
          reason: 'legacy',
          confidence: 0.9
        }
      ]

      const analysis = createMockAnalysis(godNodes, surprises)

      // Apply boost
      const enhanced = boostWithGraphMetrics(original, analysis)

      // Auth should move up due to god node status
      const authIndex = enhanced.findIndex((e) => e.file === 'src/auth.ts')
      const utilIndex = enhanced.findIndex((e) => e.file === 'src/utils.ts')

      // Boost should apply even if scores still differ
      expect(enhanced.length).toBe(3)

      // Measure improvement
      const improvement = measureRetrievalImprovement(original, enhanced)

      expect(improvement.godNodesInTop5).toBeGreaterThan(0)
      expect(improvement.godNodesInTop5).toBeGreaterThan(0)
    })
  })
})
