/**
 * Wikipedia Subsystem for Graphify
 *
 * Auto-generated symbol documentation using graph metrics:
 * - Symbol pages with metrics
 * - Dependency documentation
 * - Community overview
 * - Impact analysis
 * - Architecture insights
 */

import type {
  GraphifyGraph,
  GraphifyAnalysis,
  GodNode,
  CommunityAnalysis
} from './graphify-types.js'

// GraphifyAnalysis doesn't carry .graph — provide it separately
interface AnalysisWithGraph extends Omit<GraphifyAnalysis, 'graph'> {
  graph?: GraphifyGraph
}

/**
 * Wikipedia page for a symbol.
 */
export interface WikiPage {
  title: string
  symbol: string
  section: WikiSection[]
  metadata: WikiMetadata
  generatedAt: Date
}

/**
 * Section of a wiki page.
 */
export interface WikiSection {
  title: string
  content: string
  subsections?: WikiSection[]
}

/**
 * Metadata for a wiki page.
 */
export interface WikiMetadata {
  symbol: string
  nodeId: string
  type: 'god_node' | 'regular_node' | 'isolated'
  inDegree: number
  outDegree: number
  community?: string
  criticality?: string
}

/**
 * Generate a wiki page for a symbol.
 *
 * @param symbol Symbol name
 * @param analysis Graph analysis (may include a .graph field if available)
 * @param graph Optional graph data (needed for edge/node lookups)
 * @returns Wiki page
 */
export function generateWikiPage(symbol: string, analysis: GraphifyAnalysis | null, graph?: GraphifyGraph | null): WikiPage {
  const nodeId = normalizeSymbol(symbol)

  if (!analysis) {
    return createEmptyWikiPage(symbol)
  }

  // Support both old convention (analysis.graph) and explicit graph param
  const effectiveGraph = graph ?? (analysis as any).graph ?? null

  const sections: WikiSection[] = []

  // Overview section
  sections.push(createOverviewSection(symbol, analysis))

  // Metrics section
  const metrics = getSymbolMetrics(nodeId, analysis)
  if (metrics) {
    sections.push(createMetricsSection(metrics))
  }

  // Dependencies section
  const deps = getSymbolDependencies(nodeId, analysis)
  if (deps.length > 0) {
    sections.push(createDependenciesSection(symbol, deps, analysis))
  }

  // Dependents section
  const dependents = getSymbolDependents(nodeId, analysis)
  if (dependents.length > 0) {
    sections.push(createDependentsSection(symbol, dependents, analysis))
  }

  // Community section
  const community = findSymbolCommunity(nodeId, analysis)
  if (community) {
    sections.push(createCommunitySection(community, analysis))
  }

  // God node section
  const godNode = findGodNode(nodeId, analysis)
  if (godNode) {
    sections.push(createGodNodeSection(godNode, analysis))
  }

  // Risks & Recommendations
  sections.push(createRisksSection(symbol, analysis))

  // Metadata
  const edgeCountIn = effectiveGraph
    ? effectiveGraph.edges.filter((e) => e.target === nodeId).length
    : 0
  const edgeCountOut = effectiveGraph
    ? effectiveGraph.edges.filter((e) => e.source === nodeId).length
    : 0

  const metadata: WikiMetadata = {
    symbol,
    nodeId,
    type: godNode ? 'god_node' : dependents.length === 0 && deps.length === 0 ? 'isolated' : 'regular_node',
    inDegree: edgeCountIn,
    outDegree: edgeCountOut,
    community: community?.label,
    criticality: godNode?.criticality
  }

  return {
    title: `${symbol} - Architecture Documentation`,
    symbol,
    section: sections,
    metadata,
    generatedAt: new Date()
  }
}

/**
 * Create overview section.
 *
 * @param symbol Symbol name
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createOverviewSection(symbol: string, analysis: GraphifyAnalysis): WikiSection {
  const nodeId = normalizeSymbol(symbol)
  const godNode = findGodNode(nodeId, analysis)
  const deps = getSymbolDependencies(nodeId, analysis)
  const dependents = getSymbolDependents(nodeId, analysis)

  let overview = `**${symbol}** is a `

  if (godNode) {
    overview += `critical hub module with ${godNode.inDegree} incoming dependencies and ${godNode.outDegree} outgoing dependencies. `
    overview += `It serves as a ${godNode.criticality} node in the architecture.`
  } else {
    overview += `module with ${dependents.length} direct dependents and ${deps.length} direct dependencies.`
  }

  overview += `\n\nThis page documents the role, dependencies, and architectural impact of ${symbol}.`

  return {
    title: 'Overview',
    content: overview
  }
}

/**
 * Create metrics section.
 *
 * @param metrics Symbol metrics
 * @returns Wiki section
 */
function createMetricsSection(metrics: SymbolMetrics): WikiSection {
  const content = `
| Metric | Value |
|--------|-------|
| In-Degree | ${metrics.inDegree} |
| Out-Degree | ${metrics.outDegree} |
| Total Degree | ${metrics.inDegree + metrics.outDegree} |
| Betweenness | ${(metrics.betweenness * 100).toFixed(1)}% |
| PageRank | ${metrics.pageRank.toFixed(4)} |
| Centrality | ${metrics.centrality} |
  `.trim()

  return {
    title: 'Key Metrics',
    content
  }
}

/**
 * Create dependencies section.
 *
 * @param symbol Symbol name
 * @param deps Dependencies
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createDependenciesSection(
  symbol: string,
  deps: string[],
  analysis: GraphifyAnalysis
): WikiSection {
  const godDeps = deps.filter((d) => analysis.godNodes.some((gn) => normalizeSymbol(gn.nodeId) === d))

  let content = `${symbol} depends on:\n\n`

  if (godDeps.length > 0) {
    content += `**Critical Dependencies** (may affect multiple modules):\n`
    godDeps.slice(0, 5).forEach((dep) => {
      content += `- \`${dep}\` (god node)\n`
    })
    content += `\n`
  }

  content += `**All Dependencies**:\n`
  deps.slice(0, 10).forEach((dep) => {
    content += `- \`${dep}\`\n`
  })

  if (deps.length > 10) {
    content += `- ... and ${deps.length - 10} more\n`
  }

  return {
    title: 'Dependencies',
    content
  }
}

/**
 * Create dependents section.
 *
 * @param symbol Symbol name
 * @param dependents Dependents
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createDependentsSection(
  symbol: string,
  dependents: string[],
  analysis: GraphifyAnalysis
): WikiSection {
  const godDependents = dependents.filter((d) => analysis.godNodes.some((gn) => normalizeSymbol(gn.nodeId) === d))

  let content = `**${dependents.length}** modules depend on ${symbol}:\n\n`

  if (godDependents.length > 0) {
    content += `**Critical Dependents** (god nodes):\n`
    godDependents.forEach((dep) => {
      content += `- \`${dep}\`\n`
    })
    content += `\n`
  }

  content += `**Direct Dependents**:\n`
  dependents.slice(0, 10).forEach((dep) => {
    content += `- \`${dep}\`\n`
  })

  if (dependents.length > 10) {
    content += `- ... and ${dependents.length - 10} more\n`
  }

  content += `\n> Changing ${symbol} may require updates to ${dependents.length} dependent modules.`

  return {
    title: 'Direct Dependents',
    content
  }
}

/**
 * Create community section.
 *
 * @param community Community data
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createCommunitySection(community: CommunityAnalysis, analysis: GraphifyAnalysis): WikiSection {
  const content = `
${community.label} is a cohesive group of ${community.nodes.length} related modules.

**Community Statistics:**
- Internal Density: ${(community.internalDensity * 100).toFixed(1)}%
- External Connectivity: ${(community.externalDensity * 100).toFixed(1)}%

**Member Modules:** ${community.nodes.slice(0, 5).join(', ')}${community.nodes.length > 5 ? ', ...' : ''}

**Interface Nodes:** ${community.interfaceNodes.length > 0 ? community.interfaceNodes.join(', ') : 'None'}

**Bottleneck Nodes:** ${community.bottlenecks.length > 0 ? community.bottlenecks.join(', ') : 'None'}
  `.trim()

  return {
    title: `Community: ${community.label}`,
    content
  }
}

/**
 * Create god node section.
 *
 * @param godNode God node data
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createGodNodeSection(godNode: GodNode, analysis: GraphifyAnalysis): WikiSection {
  const content = `
This is a **god node** - a critically important hub in the architecture.

**Criticality:** ${godNode.criticality}

**PageRank Score:** ${godNode.pageRank.toFixed(4)}

**Community:** ${godNode.community}

**Impact:** Changes to this module affect multiple other modules and communities. 
Modifications require careful review and comprehensive testing.

**Responsibility:** This module bridges multiple architectural layers and should be:
- Well-documented
- Thoroughly tested
- Reviewed carefully for changes
- Monitored for dependencies
  `.trim()

  return {
    title: '⭐ God Node',
    content
  }
}

/**
 * Create risks and recommendations section.
 *
 * @param symbol Symbol name
 * @param analysis Graph analysis
 * @returns Wiki section
 */
function createRisksSection(symbol: string, analysis: GraphifyAnalysis): WikiSection {
  const nodeId = normalizeSymbol(symbol)
  const dependents = getSymbolDependents(nodeId, analysis)
  const deps = getSymbolDependencies(nodeId, analysis)
  const godNode = findGodNode(nodeId, analysis)

  const recommendations: string[] = []

  if (godNode?.criticality === 'CRITICAL') {
    recommendations.push('This is a critical hub. Request mandatory code review for any changes.')
    recommendations.push('Write comprehensive integration tests.')
    recommendations.push('Maintain clear API documentation.')
  } else if (dependents.length > 5) {
    recommendations.push(`This module has ${dependents.length} dependents. Ensure backward compatibility.`)
    recommendations.push('Add changelog entry for breaking changes.')
  }

  if (deps.length > 10) {
    recommendations.push(`High dependencies (${deps.length}). Consider dependency injection or interfaces.`)
  }

  let content = `**Recommendations:**\n`
  recommendations.slice(0, 5).forEach((rec) => {
    content += `- ${rec}\n`
  })

  return {
    title: 'Risks & Recommendations',
    content
  }
}

/**
 * Create empty wiki page for unknown symbols.
 *
 * @param symbol Symbol name
 * @returns Wiki page
 */
function createEmptyWikiPage(symbol: string): WikiPage {
  return {
    title: `${symbol} - No Graph Data`,
    symbol,
    section: [
      {
        title: 'Overview',
        content: `No graph analysis available for ${symbol}. Enable the graph system to get architectural insights.`
      }
    ],
    metadata: {
      symbol,
      nodeId: normalizeSymbol(symbol),
      type: 'isolated',
      inDegree: 0,
      outDegree: 0
    },
    generatedAt: new Date()
  }
}

/**
 * Convert wiki page to markdown.
 *
 * @param page Wiki page
 * @returns Markdown string
 */
export function wikiPageToMarkdown(page: WikiPage): string {
  const lines: string[] = []

  lines.push(`# ${page.title}\n`)
  lines.push(`> Auto-generated on ${page.generatedAt.toISOString().split('T')[0]}\n`)

  function renderSection(section: WikiSection, depth: number = 2) {
    lines.push(`${'#'.repeat(depth)} ${section.title}\n`)
    lines.push(section.content)
    lines.push('')

    if (section.subsections) {
      section.subsections.forEach((sub) => renderSection(sub, depth + 1))
    }
  }

  page.section.forEach((section) => renderSection(section))

  return lines.join('\n')
}

/**
 * Symbol metrics from analysis.
 */
interface SymbolMetrics {
  inDegree: number
  outDegree: number
  betweenness: number
  pageRank: number
  centrality: string
}

/**
 * Get symbol metrics.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Metrics or undefined
 */
function getSymbolMetrics(nodeId: string, analysis: GraphifyAnalysis): SymbolMetrics | undefined {
  const godNode = analysis.godNodes.find((gn) => normalizeSymbol(gn.nodeId) === nodeId)

  if (godNode) {
    return {
      inDegree: godNode.inDegree,
      outDegree: godNode.outDegree,
      betweenness: godNode.betweenness,
      pageRank: godNode.pageRank,
      centrality: godNode.criticality
    }
  }

  // Can't get graph metrics without a graph field — use godNodes as fallback
  const graph = (analysis as any).graph as GraphifyGraph | undefined
  if (graph) {
    const graphNode = graph.nodes.find((n) => normalizeSymbol(n.id) === nodeId)
    if (graphNode) {
      const inDegree = graph.edges.filter((e) => e.target === graphNode.id).length
      const outDegree = graph.edges.filter((e) => e.source === graphNode.id).length

      return {
        inDegree,
        outDegree,
        betweenness: 0,
        pageRank: 0,
        centrality: outDegree > 5 ? 'high' : 'normal'
      }
    }
  }

  return undefined
}

/**
 * Get dependencies of a symbol.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Array of dependent node IDs
 */
function getSymbolDependencies(nodeId: string, analysis: GraphifyAnalysis): string[] {
  const graph = (analysis as any).graph as GraphifyGraph | undefined
  if (!graph) return []
  return graph.edges
    .filter((e) => normalizeSymbol(e.source) === nodeId)
    .map((e) => e.target)
    .slice(0, 20)
}

/**
 * Get dependents of a symbol.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Array of dependent node IDs
 */
function getSymbolDependents(nodeId: string, analysis: GraphifyAnalysis): string[] {
  const graph = (analysis as any).graph as GraphifyGraph | undefined
  if (!graph) return []
  return Array.from(
    new Set(
      graph.edges
        .filter((e) => normalizeSymbol(e.target) === nodeId)
        .map((e) => e.source)
    )
  ).slice(0, 20)
}

/**
 * Find community for a symbol.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Community or undefined
 */
function findSymbolCommunity(nodeId: string, analysis: GraphifyAnalysis): CommunityAnalysis | undefined {
  return analysis.communities.find((c) =>
    c.nodes.some((n) => normalizeSymbol(n) === nodeId)
  )
}

/**
 * Find god node for a symbol.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns God node or undefined
 */
function findGodNode(nodeId: string, analysis: GraphifyAnalysis): GodNode | undefined {
  return analysis.godNodes.find((gn) => normalizeSymbol(gn.nodeId) === nodeId)
}

/**
 * Normalize symbol name.
 *
 * @param symbol Symbol name
 * @returns Normalized ID
 */
function normalizeSymbol(symbol: string): string {
  return symbol.toLowerCase().replace(/[^a-z0-9_]/g, '')
}
