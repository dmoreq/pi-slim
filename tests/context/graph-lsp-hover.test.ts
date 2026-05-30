/**
 * Tests for LSP Hover Enhancement with Graph Metrics
 */

import { describe, expect, it } from 'vitest'
import { enhanceHoverWithGraphMetrics, formatHoverAsMarkdown, getNodeRoleSummary } from '../../context/graph-lsp-hover'
import type { GraphAnalysis } from '../../context/graph-types'

const createMockAnalysis = (godNodes: any[] = [], communities: any[] = [], surprises: any[] = []): GraphAnalysis => {
  return {
    graph: {
      nodes: [
        { id: 'authenticate', type: 'function', label: 'Authenticate' },
        { id: 'validateToken', type: 'function', label: 'ValidateToken' },
        { id: 'getUserProfile', type: 'function', label: 'GetUserProfile' },
        { id: 'database', type: 'module', label: 'Database' },
        { id: 'cache', type: 'module', label: 'Cache' },
      ],
      edges: [
        { source: 'validateToken', target: 'authenticate', type: 'calls' },
        { source: 'getUserProfile', target: 'authenticate', type: 'calls' },
        { source: 'authenticate', target: 'database', type: 'calls' },
        { source: 'validateToken', target: 'database', type: 'calls' },
        { source: 'getUserProfile', target: 'cache', type: 'calls' },
        { source: 'cache', target: 'database', type: 'calls' },
      ],
    },
    godNodes:
      godNodes.length > 0
        ? godNodes
        : [
            {
              nodeId: 'authenticate',
              label: 'Authenticate',
              inDegree: 2,
              outDegree: 5,
              betweenness: 0.8,
              pageRank: 0.75,
              community: 'auth',
              criticality: 'CRITICAL',
            },
          ],
    communities:
      communities.length > 0
        ? communities
        : [
            {
              id: 'auth-comm',
              label: 'Authentication',
              nodes: ['authenticate', 'validateToken'],
              internalDensity: 0.8,
              externalDensity: 0.2,
              interfaceNodes: ['authenticate'],
              bottlenecks: ['authenticate'],
            },
            {
              id: 'data-comm',
              label: 'Data Access',
              nodes: ['database', 'cache'],
              internalDensity: 0.6,
              externalDensity: 0.4,
              interfaceNodes: ['cache'],
              bottlenecks: ['database'],
            },
          ],
    surprises: surprises,
  }
}

describe('Graph LSP Hover', () => {
  // ── Basic Hover Enhancement ────────────────────────────────────────

  describe('enhanceHoverWithGraphMetrics', () => {
    it('enhances hover for god node', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics(
        'authenticate',
        'function authenticate(token: string): boolean',
        analysis
      )

      expect(hover.symbol).toBe('authenticate')
      expect(hover.baseInfo).toBe('function authenticate(token: string): boolean')
      expect(hover.godNodeInfo).toBeDefined()
      // godNodeInfo is GodNode & { recommendation } — isGodNode is not present; presence itself suffices
      expect(hover.godNodeInfo?.criticality).toBe('CRITICAL')
      expect(hover.graphMetrics).toBeDefined()
      expect(hover.graphMetrics?.centrality).toBe('critical')
    })

    it('enhances hover for regular node', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics(
        'validateToken',
        'function validateToken(token: string): boolean',
        analysis
      )

      expect(hover.symbol).toBe('validateToken')
      // godNodeInfo may be defined only for god nodes; regular nodes lack it
      expect(hover.graphMetrics).toBeDefined()
    })

    it('handles missing graph analysis gracefully', () => {
      const hover = enhanceHoverWithGraphMetrics('unknownSymbol', 'function unknownSymbol(): void', null)

      expect(hover.symbol).toBe('unknownSymbol')
      expect(hover.baseInfo).toBe('function unknownSymbol(): void')
      expect(hover.godNodeInfo).toBeUndefined()
      expect(hover.graphMetrics).toBeUndefined()
    })

    it('includes community information', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics(
        'authenticate',
        'function authenticate(token: string): boolean',
        analysis
      )

      expect(hover.communityInfo).toBeDefined()
      expect(hover.communityInfo?.communityLabel).toBe('Authentication')
      expect(hover.communityInfo?.memberCount).toBe(2)
    })

    it('identifies interface nodes', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      expect(hover.communityInfo?.isInterfaceNode).toBe(true)
    })

    it('identifies bottleneck nodes', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      expect(hover.communityInfo?.isBottleneck).toBe(true)
    })

    it('includes impact analysis', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      expect(hover.impactAnalysis).toBeDefined()
      expect(hover.impactAnalysis?.dependentCount).toBeGreaterThan(0)
      expect(hover.impactAnalysis?.criticalityLevel).toBe('CRITICAL')
    })

    it('handles surprising connections', () => {
      const surprises = [
        {
          source: 'authenticate',
          target: 'legacyAuth',
          type: 'legacy' as const,
          confidence: 0.8,
          recommendation: 'Consider removing legacy code',
        },
      ]
      const analysis = createMockAnalysis([], [], surprises)
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      expect(hover.surpriseInfo).toBeDefined()
      expect(hover.surpriseInfo?.hasUnexpectedConnections).toBe(true)
      expect(hover.surpriseInfo?.count).toBe(1)
    })
  })

  // ── Markdown Formatting ────────────────────────────────────────────

  describe('formatHoverAsMarkdown', () => {
    it('formats basic hover info', () => {
      const hover = {
        symbol: 'test',
        range: { start: 0, end: 4 },
        baseInfo: 'function test(): void',
      }

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('```')
      expect(markdown).toContain('function test(): void')
    })

    it('includes god node section', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('🌟 God Node')
      expect(markdown).toContain('CRITICAL')
      expect(markdown).toContain('In-Degree')
    })

    it('includes community section', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('🏘️ Community')
      expect(markdown).toContain('Authentication')
    })

    it('includes impact analysis section', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('🔗 Impact Analysis')
      expect(markdown).toContain('CRITICAL')
      expect(markdown).toContain('Dependents')
    })

    it('formats graph metrics section', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('📊 Graph Metrics')
      expect(markdown).toContain('Centrality')
    })

    it('includes surprise info when present', () => {
      const surprises = [
        {
          source: 'authenticate',
          target: 'legacyAuth',
          type: 'legacy' as const,
          confidence: 0.8,
          recommendation: 'Consider refactoring',
        },
      ]
      const analysis = createMockAnalysis([], [], surprises)
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      expect(markdown).toContain('⚡ Unexpected Connections')
      expect(markdown).toContain('legacy')
    })

    it('produces valid markdown', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('authenticate', 'function authenticate(): boolean', analysis)

      const markdown = formatHoverAsMarkdown(hover)

      // Should have sections
      expect(markdown).toMatch(/##/g) // Headers
      expect(markdown).toContain('```') // Code blocks
      expect(markdown).toContain('**') // Bold text
    })
  })

  // ── Node Role Summary ──────────────────────────────────────────────

  describe('getNodeRoleSummary', () => {
    it('identifies critical god nodes', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.isCritical).toBe(true)
      expect(summary.summary).toContain('God Node')
      expect(summary.summary).toContain('CRITICAL')
    })

    it('includes god node metrics', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.metrics).toContain('🌟 God Node (CRITICAL)')
      expect(summary.metrics.some(m => m.includes('In-degree'))).toBe(true)
      expect(summary.metrics.some(m => m.includes('PageRank'))).toBe(true)
    })

    it('includes community information', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.summary).toContain('Authentication')
      expect(summary.metrics.some(m => m.includes('Community'))).toBe(true)
    })

    it('identifies interface nodes', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.metrics.some(m => m.includes('Interface'))).toBe(true)
    })

    it('identifies bottleneck nodes', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.metrics.some(m => m.includes('Bottleneck'))).toBe(true)
    })

    it('reports surprising connections count', () => {
      const surprises = [
        {
          source: 'authenticate',
          target: 'legacy1',
          type: 'legacy' as const,
          confidence: 0.8,
          recommendation: '',
        },
        {
          source: 'authenticate',
          target: 'legacy2',
          type: 'legacy' as const,
          confidence: 0.8,
          recommendation: '',
        },
      ]
      const analysis = createMockAnalysis([], [], surprises)
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.metrics.some(m => m.includes('2 unexpected connections'))).toBe(true)
    })

    it('handles non-critical nodes', () => {
      const analysis = createMockAnalysis([
        {
          nodeId: 'regularNode',
          label: 'Regular',
          inDegree: 1,
          outDegree: 0,
          betweenness: 0.1,
          pageRank: 0.1,
          community: 'data',
          criticality: 'LOW',
        },
      ])
      const summary = getNodeRoleSummary('regularNode', analysis)

      expect(summary.isCritical).not.toBe(true)
    })

    it('handles missing analysis gracefully', () => {
      const summary = getNodeRoleSummary('anySymbol', null)

      expect(summary.isCritical).toBe(false)
      expect(summary.summary).toBe('No graph analysis available')
      expect(summary.metrics).toHaveLength(0)
    })

    it('formats summary as readable string', () => {
      const analysis = createMockAnalysis()
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(summary.summary).toBeTruthy()
      expect(summary.summary).toContain('•') // Separator
      expect(summary.summary.length).toBeGreaterThan(10)
    })

    describe('GodNodeInfo composition', () => {
      it('populates godNodeInfo from GodNode fields without redefined types', () => {
        const analysis = createMockAnalysis()
        const result = enhanceHoverWithGraphMetrics(
          'authenticate',
          'function authenticate(token: string): boolean',
          analysis as GraphAnalysis
        )
        expect(result.godNodeInfo).toBeDefined()
        expect(result.godNodeInfo?.inDegree).toBe(2)
        expect(result.godNodeInfo?.pageRank).toBe(0.75)
        expect(result.godNodeInfo?.community).toBe('auth')
        expect(result.godNodeInfo?.recommendation).toContain('critical hub')
      })
    })
  })

  // ── Edge Cases & Integration ───────────────────────────────────────

  describe('Edge cases and integration', () => {
    it('handles symbol name normalization', () => {
      const analysis = createMockAnalysis()

      // Different variations should normalize to same node
      const hover1 = enhanceHoverWithGraphMetrics('authenticate', 'fn', analysis)
      const hover2 = enhanceHoverWithGraphMetrics('Authenticate', 'fn', analysis)

      expect(hover1.godNodeInfo).toBeDefined()
      expect(hover2.godNodeInfo).toBeDefined()
    })

    it('handles unknown symbols', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics('unknownFunction', 'function unknownFunction(): void', analysis)

      expect(hover.baseInfo).toBe('function unknownFunction(): void')
      expect(hover.graphMetrics?.centrality).toBe('unknown')
    })

    it('handles communities without matching node', () => {
      const analysis = createMockAnalysis([], [])
      const hover = enhanceHoverWithGraphMetrics('unknownNode', 'fn', analysis)

      expect(hover.communityInfo).toBeUndefined()
    })

    it('handles nodes with no dependents', () => {
      const godNodes = [
        {
          nodeId: 'isolated',
          label: 'Isolated',
          inDegree: 0,
          outDegree: 0,
          betweenness: 0,
          pageRank: 0.01,
          community: 'data',
          criticality: 'LOW',
        },
      ]
      const analysis = createMockAnalysis(godNodes)
      const hover = enhanceHoverWithGraphMetrics('isolated', 'fn', analysis)

      expect(hover.impactAnalysis?.dependentCount).toBe(0)
      expect(hover.impactAnalysis?.criticalityLevel).toBe('LOW')
    })

    it('full markdown output is comprehensive', () => {
      const analysis = createMockAnalysis()
      const hover = enhanceHoverWithGraphMetrics(
        'authenticate',
        'function authenticate(token: string): boolean',
        analysis
      )

      const markdown = formatHoverAsMarkdown(hover)
      const summary = getNodeRoleSummary('authenticate', analysis)

      expect(markdown.length).toBeGreaterThan(100)
      expect(summary.summary.length).toBeGreaterThan(20)
      // Check for key elements in markdown
      expect(markdown).toContain('authenticate')
      expect(markdown).toContain('God Node')
    })
  })
})
