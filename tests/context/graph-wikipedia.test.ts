/**
 * Tests for Wikipedia Subsystem
 */

import { describe, it, expect } from 'vitest'
import { generateWikiPage, wikiPageToMarkdown } from '../../context/graph-wikipedia'
import type { GraphifyAnalysis } from '../../context/graph-types'

const createMockAnalysis = (): GraphifyAnalysis => {
  return {
    graph: {
      nodes: [
        { id: 'core', type: 'function', label: 'Core' },
        { id: 'auth', type: 'function', label: 'Auth' },
        { id: 'database', type: 'module', label: 'Database' },
        { id: 'cache', type: 'module', label: 'Cache' }
      ],
      edges: [
        { source: 'auth', target: 'core', type: 'calls' },
        { source: 'cache', target: 'core', type: 'calls' },
        { source: 'core', target: 'database', type: 'calls' },
        { source: 'auth', target: 'database', type: 'calls' }
      ]
    },
    godNodes: [
      {
        nodeId: 'core',
        label: 'Core',
        inDegree: 2,
        outDegree: 1,
        betweenness: 0.8,
        pageRank: 0.75,
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
        label: 'Authentication',
        nodes: ['auth'],
        internalDensity: 0.0,
        externalDensity: 1.0,
        interfaceNodes: ['auth'],
        bottlenecks: []
      }
    ]
  }
}

describe('Wikipedia', () => {
  // ── Wiki Page Generation ───────────────────────────────────────────

  describe('generateWikiPage', () => {
    it('generates page for god node', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      expect(page.title).toContain('core')
      expect(page.symbol).toBe('core')
      expect(page.metadata.type).toBe('god_node')
      expect(page.metadata.criticality).toBe('CRITICAL')
      expect(page.section.length).toBeGreaterThan(0)
    })

    it('generates page for regular node', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('auth', analysis)

      expect(page.symbol).toBe('auth')
      expect(page.metadata.type).toBe('regular_node')
      expect(page.section.length).toBeGreaterThan(0)
    })

    it('includes overview section', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const overview = page.section.find((s) => s.title === 'Overview')
      expect(overview).toBeDefined()
      expect(overview?.content).toContain('core')
    })

    it('includes metrics section for nodes with data', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const metrics = page.section.find((s) => s.title === 'Key Metrics')
      expect(metrics).toBeDefined()
      expect(metrics?.content).toContain('In-Degree')
    })

    it('includes dependencies section', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const deps = page.section.find((s) => s.title === 'Dependencies')
      expect(deps).toBeDefined()
      expect(deps?.content).toContain('database')
    })

    it('includes dependents section', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const dependents = page.section.find((s) => s.title === 'Direct Dependents')
      expect(dependents).toBeDefined()
      expect(dependents?.content).toContain('auth')
    })

    it('includes community section when applicable', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const community = page.section.find((s) => s.title.includes('Community'))
      expect(community).toBeDefined()
      expect(community?.content).toContain('Core')
    })

    it('includes god node section for critical nodes', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const godNode = page.section.find((s) => s.title.includes('God Node'))
      expect(godNode).toBeDefined()
      expect(godNode?.content).toContain('CRITICAL')
    })

    it('includes risks and recommendations', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      const risks = page.section.find((s) => s.title === 'Risks & Recommendations')
      expect(risks).toBeDefined()
      expect(risks?.content).toContain('Recommendations')
    })

    it('handles null analysis gracefully', () => {
      const page = generateWikiPage('unknownSymbol', null)

      expect(page.symbol).toBe('unknownSymbol')
      expect(page.metadata.type).toBe('isolated')
      expect(page.section.length).toBeGreaterThan(0)
      expect(page.section[0].content).toContain('No graph analysis')
    })

    it('handles unknown symbols', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('unknownModule', analysis)

      expect(page.symbol).toBe('unknownModule')
      expect(page.metadata.type).toBe('isolated')
      expect(page.section.length).toBeGreaterThan(0)
    })

    it('sets generation date', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      expect(page.generatedAt).toBeInstanceOf(Date)
    })
  })

  // ── Markdown Conversion ────────────────────────────────────────────

  describe('wikiPageToMarkdown', () => {
    it('converts page to markdown', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      expect(markdown).toContain('# ')
      expect(markdown).toContain(page.title)
    })

    it('includes section headers', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      expect(markdown).toContain('## ')
      expect(markdown).toContain('Overview')
    })

    it('includes generation date', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      expect(markdown).toContain('Auto-generated')
    })

    it('is valid markdown', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      // Check for markdown structure
      expect(markdown).toMatch(/^#/m)  // Has headers
      expect(markdown.length).toBeGreaterThan(100)
    })

    it('preserves content hierarchy', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      const lines = markdown.split('\n')
      const headerLines = lines.filter((l) => l.startsWith('#'))
      expect(headerLines.length).toBeGreaterThan(1)
    })

    it('includes metrics tables', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      expect(markdown).toContain('|')  // Table separator
    })
  })

  // ── Metadata Tests ─────────────────────────────────────────────────

  describe('Wiki metadata', () => {
    it('tracks metadata correctly', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)

      expect(page.metadata.symbol).toBe('core')
      expect(page.metadata.type).toBe('god_node')
      expect(page.metadata.inDegree).toBe(2)
      expect(page.metadata.outDegree).toBe(1)
      expect(page.metadata.community).toBe('Core')
      expect(page.metadata.criticality).toBe('CRITICAL')
    })

    it('identifies isolated nodes', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('isolated', analysis)

      expect(page.metadata.type).toBe('isolated')
    })

    it('normalizes symbol names', () => {
      const analysis = createMockAnalysis()
      const page1 = generateWikiPage('Core', analysis)
      const page2 = generateWikiPage('CORE', analysis)

      // Both should find the same node
      expect(page1.metadata.type).toBe('god_node')
      expect(page2.metadata.type).toBe('god_node')
    })
  })

  // ── Integration Tests ──────────────────────────────────────────────

  describe('Full workflow', () => {
    it('generates and formats wiki page', () => {
      const analysis = createMockAnalysis()
      const page = generateWikiPage('core', analysis)
      const markdown = wikiPageToMarkdown(page)

      expect(markdown).toContain('core')
      expect(markdown).toContain('CRITICAL')
      expect(markdown).toContain('Dependencies')
      expect(markdown).toContain('Recommendations')
    })

    it('generates comprehensive documentation', () => {
      const analysis = createMockAnalysis()
      const symbols = ['core', 'auth', 'database', 'cache']

      for (const symbol of symbols) {
        const page = generateWikiPage(symbol, analysis)
        expect(page.section.length).toBeGreaterThan(0)
      }
    })
  })
})
