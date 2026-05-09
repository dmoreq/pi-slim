/**
 * LSP Hover Enhancement with Graph Metrics
 *
 * Extends hover information with graph-derived insights:
 * - God node status & criticality
 * - Centrality metrics (degree, betweenness)
 * - Community membership
 * - Surprising connections
 * - Impact on dependent code
 */

import type {
  GraphifyGraph,
  GraphifyAnalysis,
  GodNode,
  SurprisingConnection
} from './graphify-types.js'

/**
 * Enhanced hover information with graph metrics.
 */
export interface EnhancedHoverInfo {
  symbol: string
  range: { start: number; end: number }
  baseInfo: string
  graphMetrics?: GraphMetrics
  godNodeInfo?: GodNodeInfo
  surpriseInfo?: SurpriseInfo
  communityInfo?: CommunityInfo
  impactAnalysis?: ImpactAnalysis
}

/**
 * Graph-derived metrics for a symbol.
 */
export interface GraphMetrics {
  inDegree: number
  outDegree: number
  betweenness: number
  pageRank: number
  centrality: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
}

/**
 * Information about god node status.
 */
export interface GodNodeInfo {
  isGodNode: boolean
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  label: string
  inDegree: number
  outDegree: number
  pageRank: number
  community: string
  recommendation: string
}

/**
 * Surprising connection information.
 */
export interface SurpriseInfo {
  hasUnexpectedConnections: boolean
  types: string[]
  count: number
  topSurprises: SurprisingConnection[]
  recommendation: string
}

/**
 * Community membership information.
 */
export interface CommunityInfo {
  communityId: string
  communityLabel: string
  memberCount: number
  density: number
  isInterfaceNode: boolean
  isBottleneck: boolean
}

/**
 * Impact analysis for code changes.
 */
export interface ImpactAnalysis {
  dependentCount: number
  affectedCommunities: number
  criticalityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation: string
  example?: string
}

/**
 * Enhance hover information with graph metrics for a symbol.
 *
 * @param symbol Symbol name (e.g., "authenticate", "Database.query")
 * @param baseInfo Base hover info from LSP
 * @param analysis Graph analysis data
 * @returns Enhanced hover information
 */
export function enhanceHoverWithGraphMetrics(
  symbol: string,
  baseInfo: string,
  analysis: GraphifyAnalysis | null
): EnhancedHoverInfo {
  const hoverInfo: EnhancedHoverInfo = {
    symbol,
    range: { start: 0, end: symbol.length },
    baseInfo
  }

  if (!analysis) {
    return hoverInfo
  }

  // Extract node ID from symbol
  const nodeId = normalizeNodeId(symbol)

  // Compute graph metrics
  hoverInfo.graphMetrics = computeGraphMetrics(nodeId, analysis)

  // Check if god node
  const godNode = findGodNode(nodeId, analysis)
  if (godNode) {
    hoverInfo.godNodeInfo = createGodNodeInfo(godNode)
  }

  // Check for surprising connections
  const surprises = findSurprises(nodeId, analysis)
  if (surprises.length > 0) {
    hoverInfo.surpriseInfo = createSurpriseInfo(surprises)
  }

  // Get community info
  const community = findCommunity(nodeId, analysis)
  if (community) {
    hoverInfo.communityInfo = createCommunityInfo(community, nodeId)
  }

  // Analyze impact
  hoverInfo.impactAnalysis = analyzeImpact(nodeId, analysis)

  return hoverInfo
}

/**
 * Format hover information as markdown.
 *
 * @param hover Enhanced hover info
 * @returns Markdown string for display
 */
export function formatHoverAsMarkdown(hover: EnhancedHoverInfo): string {
  const lines: string[] = []

  // Base info
  lines.push('```')
  lines.push(hover.baseInfo)
  lines.push('```')
  lines.push('')

  // God node info
  if (hover.godNodeInfo) {
    lines.push('## 🌟 God Node')
    lines.push(`**Criticality:** ${hover.godNodeInfo.criticality}`)
    lines.push(`**In-Degree:** ${hover.godNodeInfo.inDegree}`)
    lines.push(`**Out-Degree:** ${hover.godNodeInfo.outDegree}`)
    lines.push(`**PageRank:** ${hover.godNodeInfo.pageRank.toFixed(4)}`)
    lines.push(`**Community:** ${hover.godNodeInfo.community}`)
    lines.push(``)
    lines.push(`_${hover.godNodeInfo.recommendation}_`)
    lines.push('')
  }

  // Graph metrics
  if (hover.graphMetrics) {
    lines.push('## 📊 Graph Metrics')
    lines.push(`**Centrality:** ${hover.graphMetrics.centrality}`)
    lines.push(`**In-Degree:** ${hover.graphMetrics.inDegree}`)
    lines.push(`**Out-Degree:** ${hover.graphMetrics.outDegree}`)
    lines.push('')
  }

  // Community info
  if (hover.communityInfo) {
    lines.push('## 🏘️ Community')
    lines.push(`**Community:** ${hover.communityInfo.communityLabel}`)
    lines.push(`**Members:** ${hover.communityInfo.memberCount}`)
    lines.push(`**Density:** ${(hover.communityInfo.density * 100).toFixed(1)}%`)
    if (hover.communityInfo.isInterfaceNode) {
      lines.push(`**Role:** Interface Node (bridges communities)`)
    }
    if (hover.communityInfo.isBottleneck) {
      lines.push(`**Role:** Bottleneck Node (critical path)`)
    }
    lines.push('')
  }

  // Surprise info
  if (hover.surpriseInfo?.hasUnexpectedConnections) {
    lines.push('## ⚡ Unexpected Connections')
    lines.push(`**Types:** ${hover.surpriseInfo.types.join(', ')}`)
    lines.push(`**Count:** ${hover.surpriseInfo.count}`)
    lines.push(``)
    lines.push(`_${hover.surpriseInfo.recommendation}_`)
    lines.push('')
  }

  // Impact analysis
  if (hover.impactAnalysis) {
    lines.push('## 🔗 Impact Analysis')
    lines.push(`**Criticality:** ${hover.impactAnalysis.criticalityLevel}`)
    lines.push(`**Dependents:** ${hover.impactAnalysis.dependentCount}`)
    lines.push(`**Affected Communities:** ${hover.impactAnalysis.affectedCommunities}`)
    lines.push(``)
    lines.push(`_${hover.impactAnalysis.recommendation}_`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Normalize symbol name to node ID.
 *
 * @param symbol Symbol name
 * @returns Normalized node ID
 */
function normalizeNodeId(symbol: string): string {
  // Remove namespaces, dots, etc.
  return symbol.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * Compute graph metrics for a node.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Graph metrics
 */
function computeGraphMetrics(nodeId: string, analysis: GraphifyAnalysis): GraphMetrics {
  const godNode = analysis.godNodes.find((gn) => normalizeNodeId(gn.nodeId) === nodeId)

  if (godNode) {
    return {
      inDegree: godNode.inDegree,
      outDegree: godNode.outDegree,
      betweenness: godNode.betweenness,
      pageRank: godNode.pageRank,
      centrality: godNode.criticality === 'CRITICAL' ? 'critical' : 'high'
    }
  }

  // Try to find in graph nodes
  const g = (analysis as any).graph as GraphifyGraph | undefined
  if (g) {
    const graphNode = g.nodes.find((n: any) => normalizeNodeId(n.id) === nodeId)
    if (graphNode) {
      const inDegree = g.edges.filter((e: any) => e.target === graphNode.id).length
      const outDegree = g.edges.filter((e: any) => e.source === graphNode.id).length

      return {
        inDegree,
        outDegree,
        betweenness: 0,
        pageRank: 0,
        centrality: outDegree > 5 ? 'high' : outDegree > 2 ? 'medium' : 'low'
      }
    }
  }

  // Fallback: unknown node
  return {
    inDegree: 0,
    outDegree: 0,
    betweenness: 0,
    pageRank: 0,
    centrality: 'unknown'
  }
}

/**
 * Find god node info if exists.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns God node or undefined
 */
function findGodNode(nodeId: string, analysis: GraphifyAnalysis): GodNode | undefined {
  return analysis.godNodes.find((gn) => normalizeNodeId(gn.nodeId) === nodeId)
}

/**
 * Find surprising connections for a node.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Array of surprising connections
 */
function findSurprises(nodeId: string, analysis: GraphifyAnalysis): SurprisingConnection[] {
  if (!analysis.surprises) {
    return []
  }

  return analysis.surprises.filter(
    (s: any) =>
      normalizeNodeId(s.source) === nodeId ||
      normalizeNodeId(s.target) === nodeId
  )
}

/**
 * Create god node info object.
 *
 * @param godNode God node data
 * @returns God node info
 */
function createGodNodeInfo(godNode: GodNode): GodNodeInfo {
  const recommendations: Record<string, string> = {
    CRITICAL:
      'This is a critical hub. Changes may affect many dependent modules. Request code review.',
    HIGH: 'This is a high-importance node. Monitor changes carefully.',
    MEDIUM: 'This node has moderate importance. Standard review applies.',
    LOW: 'This is a low-importance node.'
  }

  return {
    isGodNode: true,
    criticality: godNode.criticality as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    label: godNode.label,
    inDegree: godNode.inDegree,
    outDegree: godNode.outDegree,
    pageRank: godNode.pageRank,
    community: godNode.community,
    recommendation: recommendations[godNode.criticality]
  }
}

/**
 * Create surprise info object.
 *
 * @param surprises Surprising connections
 * @returns Surprise info
 */
function createSurpriseInfo(surprises: SurprisingConnection[]): SurpriseInfo {
  const types = Array.from(new Set(surprises.map((s: any) => s.reason || s.type)))

  return {
    hasUnexpectedConnections: true,
    types,
    count: surprises.length,
    topSurprises: surprises.slice(0, 3),
    recommendation:
      'This node has unexpected connections. Consider refactoring to improve modularity.'
  }
}

/**
 * Find community for a node.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Community or undefined
 */
function findCommunity(nodeId: string, analysis: GraphifyAnalysis) {
  return analysis.communities.find((c) =>
    c.nodes.some((n) => normalizeNodeId(n) === nodeId)
  )
}

/**
 * Create community info object.
 *
 * @param community Community data
 * @param nodeId Node ID
 * @returns Community info
 */
function createCommunityInfo(
  community: GraphifyAnalysis['communities'][0],
  nodeId: string
): CommunityInfo {
  return {
    communityId: community.id,
    communityLabel: community.label,
    memberCount: community.nodes.length,
    density: community.internalDensity,
    isInterfaceNode: community.interfaceNodes.some((n) => normalizeNodeId(n) === nodeId),
    isBottleneck: community.bottlenecks.some((n) => normalizeNodeId(n) === nodeId)
  }
}

/**
 * Analyze impact of changes to a node.
 *
 * @param nodeId Node ID
 * @param analysis Graph analysis
 * @returns Impact analysis
 */
function analyzeImpact(nodeId: string, analysis: GraphifyAnalysis): ImpactAnalysis {
  const g = (analysis as any).graph as GraphifyGraph | undefined
  const edges = g?.edges ?? []
  // Find all dependents (nodes that depend on this one)
  const dependents = edges.filter(
    (e) => normalizeNodeId(e.source) === nodeId
  )
  const dependentCount = new Set(dependents.map((e) => e.target)).size

  // Find affected communities
  const affectedCommunities = new Set<string>()
  for (const dependent of dependents) {
    const community = analysis.communities.find((c) =>
      c.nodes.some((n) => normalizeNodeId(n) === dependent.target)
    )
    if (community) {
      affectedCommunities.add(community.id)
    }
  }

  // Determine criticality
  const godNode = analysis.godNodes.find((gn) => normalizeNodeId(gn.nodeId) === nodeId)
  const criticality = godNode ? godNode.criticality : 'LOW'

  const recommendations: Record<string, string> = {
    CRITICAL: `Changes here will impact ${dependentCount} dependents across ${affectedCommunities.size} communities. Schedule mandatory code review.`,
    HIGH: `Changes will affect ${dependentCount} dependents. Request code review.`,
    MEDIUM: `Changes may affect ${dependentCount} dependents. Standard review applies.`,
    LOW: `Changes have limited impact. Normal review process.`
  }

  return {
    dependentCount,
    affectedCommunities: affectedCommunities.size,
    criticalityLevel: criticality as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    recommendation: recommendations[criticality],
    example: dependentCount > 0 ? `e.g., ${dependents[0]?.target}` : undefined
  }
}

/**
 * Get summary statistics for a node's graph role.
 *
 * @param symbol Symbol name
 * @param analysis Graph analysis
 * @returns Summary statistics
 */
export function getNodeRoleSummary(
  symbol: string,
  analysis: GraphifyAnalysis | null
): {
  isCritical: boolean
  summary: string
  metrics: string[]
} {
  if (!analysis) {
    return { isCritical: false, summary: 'No graph analysis available', metrics: [] }
  }

  const nodeId = normalizeNodeId(symbol)
  const godNode = findGodNode(nodeId, analysis)
  const community = findCommunity(nodeId, analysis)
  const surprises = findSurprises(nodeId, analysis)

  const metrics: string[] = []
  const isCritical = godNode?.criticality === 'CRITICAL'

  if (godNode) {
    metrics.push(`🌟 God Node (${godNode.criticality})`)
    metrics.push(`In-degree: ${godNode.inDegree}`)
    metrics.push(`PageRank: ${godNode.pageRank.toFixed(3)}`)
  }

  if (community) {
    metrics.push(`Community: ${community.label}`)
    if (community.interfaceNodes.some((n) => normalizeNodeId(n) === nodeId)) {
      metrics.push('Role: Interface')
    }
    if (community.bottlenecks.some((n) => normalizeNodeId(n) === nodeId)) {
      metrics.push('Role: Bottleneck')
    }
  }

  if (surprises.length > 0) {
    metrics.push(`⚡ ${surprises.length} unexpected connections`)
  }

  const summary = metrics.join(' • ')

  return { isCritical, summary, metrics }
}
