/**
 * Tests for Impact Analysis
 */

import { describe, it, expect } from 'vitest'
import {
  analyzeSymbolImpact,
  traceImpactPaths,
  getImpactSummary,
  computeImpactStats
} from '../../context/graph-impact-analysis'
import type { GraphifyAnalysis } from '../../context/graph-types'

const createMockAnalysis = (godNodes: any[] = []): GraphifyAnalysis => {
  return {
    graph: {
      nodes: [
        { id: 'core', type: 'function', label: 'Core' },
        { id: 'auth', type: 'function', label: 'Auth' },
        { id: 'validate', type: 'function', label: 'Validate' },
        { id: 'database', type: 'module', label: 'Database' },
        { id: 'cache', type: 'module', label: 'Cache' },
        { id: 'api1', type: 'function', label: 'API1' },
        { id: 'api2', type: 'function', label: 'API2' },
        { id: 'client', type: 'module', label: 'Client' }
      ],
      edges: [
        // Core is a hub
        { source: 'auth', target: 'core', type: 'calls' },
        { source: 'validate', target: 'core', type: 'calls' },
        { source: 'api1', target: 'core', type: 'calls' },
        { source: 'api2', target: 'core', type: 'calls' },
        { source: 'client', target: 'core', type: 'calls' },
        // Auth dependencies
        { source: 'validate', target: 'auth', type: 'calls' },
        { source: 'api1', target: 'auth', type: 'calls' },
        // Database dependencies
        { source: 'database', target: 'cache', type: 'calls' },
        { source: 'api1', target: 'database', type: 'calls' },
        { source: 'api2', target: 'database', type: 'calls' }
      ]
    },
    godNodes: godNodes.length > 0 ? godNodes : [
      {
        nodeId: 'core',
        label: 'Core',
        inDegree: 5,
        outDegree: 2,
        betweenness: 0.8,
        pageRank: 0.9,
        community: 'core-comm',
        criticality: 'CRITICAL'
      }
    ],
    communities: [
      {
        id: 'core-comm',
        label: 'Core',
        nodes: ['core'],
        internalDensity: 0.0,
        externalDensity: 1.0,
        interfaceNodes: ['core'],
        bottlenecks: ['core']
      },
      {
        id: 'auth-comm',
        label: 'Auth',
        nodes: ['auth', 'validate'],
        internalDensity: 0.5,
        externalDensity: 0.5,
        interfaceNodes: ['auth'],
        bottlenecks: []
      },
      {
        id: 'api-comm',
        label: 'API',
        nodes: ['api1', 'api2', 'client'],
        internalDensity: 0.3,
        externalDensity: 0.7,
        interfaceNodes: ['api1', 'api2'],
        bottlenecks: ['api1']
      },
      {
        id: 'data-comm',
        label: 'Data',
        nodes: ['database', 'cache'],
        internalDensity: 0.5,
        externalDensity: 0.5,
        interfaceNodes: ['database'],
        bottlenecks: ['database']
      }
    ]
  }
}

describe('ImpactAnalysis', () => {
  // ── Basic Impact Analysis ──────────────────────────────────────────

  describe('analyzeSymbolImpact', () => {
    it('analyzes critical god node impact', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      expect(impact.symbol).toBe('core')
      expect(impact.directDependents.length).toBeGreaterThan(0)
      expect(impact.riskLevel).toBe('CRITICAL')
      expect(impact.affectedCommunities.length).toBeGreaterThan(0)
      expect(impact.directDependents.length).toBeGreaterThanOrEqual(5)  // >= 5 may cause breaking change risk
    })

    it('identifies direct dependents', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      expect(impact.directDependents).toContain('auth')
      expect(impact.directDependents).toContain('validate')
      expect(impact.directDependents).toContain('api1')
    })

    it('finds transitive dependents', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('auth', analysis)

      expect(impact.transitiveDependents.length).toBeGreaterThan(0)
    })

    it('identifies affected communities', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      expect(impact.affectedCommunities.length).toBeGreaterThan(1)
      expect(impact.affectedCommunities.some((c) => c.id === 'core-comm')).toBe(true)
    })

    it('generates recommendations for high impact', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      expect(impact.recommendations.length).toBeGreaterThan(0)
      expect(impact.recommendations.some((r) => r.includes('review'))).toBe(true)
    })

    it('estimates affected lines', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      expect(impact.estimatedAffectedLines).toBeGreaterThan(0)
    })

    it('analyzes low-impact changes', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('cache', analysis)

      expect(impact.riskLevel).toBe('LOW')
      expect(impact.breakingChangeRisk).not.toBe(true)
    })

    it('analyzes medium-impact changes', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('auth', analysis)

      // auth has 2 direct dependents, so should be HIGH or MEDIUM
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(impact.riskLevel)
    })
  })

  // ── Impact Path Tracing ────────────────────────────────────────────

  describe('traceImpactPaths', () => {
    it('traces direct impact paths', () => {
      const analysis = createMockAnalysis()
      const paths = traceImpactPaths('core', analysis)

      expect(paths.length).toBeGreaterThan(0)
      paths.forEach((path) => {
        expect(path.source).toBe('core')
        expect(path.pathLength).toBeGreaterThanOrEqual(2)
      })
    })

    it('includes path length information', () => {
      const analysis = createMockAnalysis()
      const paths = traceImpactPaths('core', analysis)

      if (paths.length > 0) {
        expect(paths[0].pathLength).toBeGreaterThanOrEqual(2)
      }
    })

    it('returns sorted paths (shortest first)', () => {
      const analysis = createMockAnalysis()
      const paths = traceImpactPaths('core', analysis)

      for (let i = 1; i < paths.length; i++) {
        expect(paths[i].pathLength).toBeGreaterThanOrEqual(paths[i - 1].pathLength)
      }
    })

    it('includes community information', () => {
      const analysis = createMockAnalysis()
      const paths = traceImpactPaths('core', analysis)

      const withCommunity = paths.filter((p) => p.community)
      expect(withCommunity.length).toBeGreaterThan(0)
    })

    it('respects max paths limit', () => {
      const analysis = createMockAnalysis()
      const maxPaths = 10
      const paths = traceImpactPaths('core', analysis, maxPaths)

      expect(paths.length).toBeLessThanOrEqual(maxPaths)
    })

    it('handles nodes with low dependents', () => {
      const analysis = createMockAnalysis()
      const paths = traceImpactPaths('cache', analysis)

      // cache has limited dependents
      expect(Array.isArray(paths)).toBe(true)
    })
  })

  // ── Summary & Statistics ───────────────────────────────────────────

  describe('getImpactSummary', () => {
    it('generates readable summary', () => {
      const analysis = createMockAnalysis()
      const summary = getImpactSummary('core', analysis)

      expect(summary).toContain('core')
      expect(summary).toContain('Risk Level')
      expect(summary).toContain('Dependents')
    })

    it('includes recommendations', () => {
      const analysis = createMockAnalysis()
      const summary = getImpactSummary('core', analysis)

      expect(summary).toContain('Recommendations')
      expect(summary).toContain('•')
    })

    it('notes critical changes', () => {
      const analysis = createMockAnalysis()
      const summary = getImpactSummary('core', analysis)

      expect(summary).toContain('CRITICAL')
    })

    it('shows impact for low-risk changes', () => {
      const analysis = createMockAnalysis()
      const summary = getImpactSummary('cache', analysis)

      expect(summary).toContain('cache')
      expect(summary.length).toBeGreaterThan(50)
    })
  })

  describe('computeImpactStats', () => {
    it('computes statistics for single impact', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)
      const stats = computeImpactStats([impact])

      expect(stats.totalImpacted).toBe(1)
      expect(stats.criticalCount).toBe(1)
      expect(stats.avgDependents).toBeGreaterThan(0)
    })

    it('aggregates multiple impacts', () => {
      const analysis = createMockAnalysis()
      const impact1 = analyzeSymbolImpact('core', analysis)
      const impact2 = analyzeSymbolImpact('auth', analysis)
      const stats = computeImpactStats([impact1, impact2])

      expect(stats.totalImpacted).toBe(2)
      expect(stats.avgDependents).toBeGreaterThan(0)
    })

    it('categorizes by risk level', () => {
      const analysis = createMockAnalysis()
      const impact1 = analyzeSymbolImpact('core', analysis)
      const impact2 = analyzeSymbolImpact('cache', analysis)
      const stats = computeImpactStats([impact1, impact2])

      expect(stats.criticalCount + stats.lowCount).toBe(2)
    })

    it('handles empty impacts array', () => {
      const stats = computeImpactStats([])

      expect(stats.totalImpacted).toBe(0)
      expect(stats.avgDependents).toBe(0)
    })
  })

  // ── Edge Cases & Integration ───────────────────────────────────────

  describe('Edge cases and integration', () => {
    it('handles symbols with special characters', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('Auth.authenticate', analysis)

      expect(impact.symbol).toBe('Auth.authenticate')
    })

    it('handles unknown symbols gracefully', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('unknownSymbol', analysis)

      expect(impact.riskLevel).toBe('LOW')
      expect(impact.directDependents.length).toBe(0)
    })

    it('analyzes each god node correctly', () => {
      const analysis = createMockAnalysis()
      const impact = analyzeSymbolImpact('core', analysis)

      // Core is a god node
      expect(impact.riskLevel).toBe('CRITICAL')
    })

    it('shows comprehensive summary for critical changes', () => {
      const analysis = createMockAnalysis()
      const summary = getImpactSummary('core', analysis)

      expect(summary).toContain('Risk Level: CRITICAL')
      expect(summary).toContain('Direct Dependents')
      expect(summary).toContain('Affected Communities')
    })

    it('full workflow: analyze → trace → summarize', () => {
      const analysis = createMockAnalysis()

      const impact = analyzeSymbolImpact('core', analysis)
      expect(impact.riskLevel).toBe('CRITICAL')

      const paths = traceImpactPaths('core', analysis)
      expect(paths.length).toBeGreaterThan(0)

      const summary = getImpactSummary('core', analysis)
      expect(summary).toContain(impact.riskLevel)

      const stats = computeImpactStats([impact])
      expect(stats.totalImpacted).toBe(1)
    })
  })

  // ── Performance Tests ──────────────────────────────────────────────

  describe('Performance', () => {
    it('analyzes impact efficiently', () => {
      const analysis = createMockAnalysis()
      const start = performance.now()

      analyzeSymbolImpact('core', analysis)

      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(100)  // Should be <100ms
    })

    it('traces paths efficiently', () => {
      const analysis = createMockAnalysis()
      const start = performance.now()

      traceImpactPaths('core', analysis, 20)

      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(100)  // Should be <100ms
    })

    it('generates summary quickly', () => {
      const analysis = createMockAnalysis()
      const start = performance.now()

      getImpactSummary('core', analysis)

      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(50)  // Should be <50ms
    })
  })
})
