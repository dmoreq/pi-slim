/**
 * Graphify Retrieval Boost
 *
 * Enhances the retrieval engine with semantic scoring from graph analysis.
 * Boosts god nodes and injects surprising connections as context breadcrumbs.
 */

import type { RepoIndex } from '../shared/types'
import type { GraphifyAnalysis, GodNode, SurprisingConnection } from './graph-types.js'

export interface ScoredFile {
  file: string
  score: number
  signals: string[]
}

export interface EnhancedScoredFile extends ScoredFile {
  graphBoost?: number
  isGodNode?: boolean
  surprisingConnections?: SurprisingConnection[]
}

/**
 * Boost retrieval scores using graph analysis.
 * 
 * Scoring rules:
 * - God nodes: 2x multiplier (highly central symbols)
 * - Surprising connections: +0.5 boost (unexpected relationships worth investigating)
 * - Same community: +0.2 bonus (grouped context)
 * 
 * Time Complexity: O(results × (god_nodes + surprises))
 *
 * @param scoredFiles Files scored by standard retrieval
 * @param analysis Graph analysis results
 * @param query Original query (for context)
 * @returns Enhanced scores with graph boosts
 */
export function boostWithGraphMetrics(
  scoredFiles: ScoredFile[],
  analysis: GraphifyAnalysis,
  query?: string
): EnhancedScoredFile[] {
  // Build quick lookup maps
  const godNodeMap = new Map<string, GodNode>()
  for (const godNode of analysis.godNodes) {
    godNodeMap.set(godNode.nodeId, godNode)
  }

  const surpriseMap = new Map<string, SurprisingConnection[]>()
  for (const surprise of analysis.surprises) {
    const key = surprise.source
    if (!surpriseMap.has(key)) {
      surpriseMap.set(key, [])
    }
    surpriseMap.get(key)?.push(surprise)
  }

  // Enhance each scored file
  const enhanced: EnhancedScoredFile[] = []

  for (const file of scoredFiles) {
    const nodeName = file.file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    const godNode = godNodeMap.get(nodeName)
    const surprises = surpriseMap.get(nodeName) ?? []

    let boost = 0
    let newScore = file.score

    // Apply god node boost
    if (godNode) {
      const godNodeBoost = file.score * 1.0  // 2x total = original + boost
      boost += godNodeBoost
      newScore += godNodeBoost
    }

    // Apply surprising connection boost
    if (surprises.length > 0) {
      // Higher confidence surprises get more boost
      const surpriseBoost = Math.min(
        0.5,
        surprises.length * 0.1 + surprises[0].confidence * 0.3
      )
      boost += surpriseBoost
      newScore += surpriseBoost
    }

    enhanced.push({
      ...file,
      score: newScore,
      graphBoost: boost > 0 ? boost : undefined,
      isGodNode: !!godNode,
      surprisingConnections: surprises.length > 0 ? surprises : undefined
    })
  }

  // Re-sort by new scores
  enhanced.sort((a, b) => b.score - a.score)

  return enhanced
}

/**
 * Inject surprising connections as context breadcrumbs.
 * These help understand hidden patterns in the codebase.
 *
 * @param godNodes Identified god nodes
 * @param surprises Surprising connections
 * @param limit Maximum breadcrumbs to return
 * @returns High-priority breadcrumbs for injection
 */
export function generateContextBreadcrumbs(
  godNodes: string[],
  surprises: SurprisingConnection[],
  limit: number = 5
): string[] {
  const breadcrumbs: string[] = []

  // Priority 1: God nodes
  for (const godNode of godNodes.slice(0, limit)) {
    breadcrumbs.push(`⭐ Central: ${godNode} is a god node (highly depended on)`)
  }

  // Priority 2: High-confidence surprises
  const highConfidenceSurprises = surprises
    .filter((s) => s.confidence >= 0.8)
    .slice(0, limit - breadcrumbs.length)

  for (const surprise of highConfidenceSurprises) {
    const description = getSupriseBreadcrumb(surprise)
    breadcrumbs.push(description)
  }

  return breadcrumbs.slice(0, limit)
}

/**
 * Generate human-readable breadcrumb for a surprising connection.
 *
 * @param surprise The surprising connection
 * @returns Breadcrumb text
 */
function getSupriseBreadcrumb(surprise: SurprisingConnection): string {
  switch (surprise.reason) {
    case 'circular':
      return `🔄 Circular: ${surprise.source} ↔ ${surprise.target}`

    case 'legacy':
      return `⚠️ Legacy: ${surprise.source} depends on legacy ${surprise.target}`

    case 'cross-community':
      return `🔗 Cross-module: ${surprise.source} → ${surprise.target}`

    case 'hidden':
      return `🔍 Hidden: ${surprise.source} indirectly uses ${surprise.target}`

    case 'unexpected':
      return `❓ Unusual: ${surprise.source} → ${surprise.target}`

    default:
      return `${surprise.source} → ${surprise.target}`
  }
}

/**
 * Filter retrieval results by community.
 * Only returns files in the same community as the primary result.
 *
 * @param scoredFiles Scored files from retrieval
 * @param analysis Graph analysis with community info
 * @returns Filtered files in same community
 */
export function filterByCommunity(
  scoredFiles: EnhancedScoredFile[],
  analysis: GraphifyAnalysis
): EnhancedScoredFile[] {
  if (scoredFiles.length === 0) return []

  // Get community of top result
  const topFile = scoredFiles[0]
  const topNodeName = topFile.file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''

  let targetCommunity: string | undefined

  for (const community of analysis.communities) {
    if (community.nodes.includes(topNodeName)) {
      targetCommunity = community.id
      break
    }
  }

  // If no community found, return original results
  if (!targetCommunity) {
    return scoredFiles
  }

  // Filter to same community + some cross-community interface nodes
  const communityNodeSet = new Set(
    analysis.communities.find((c) => c.id === targetCommunity)?.nodes ?? []
  )

  const interfaceNodes = new Set(
    analysis.communities.find((c) => c.id === targetCommunity)?.interfaceNodes ?? []
  )

  return scoredFiles.filter((file) => {
    const nodeName = file.file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    return communityNodeSet.has(nodeName) || interfaceNodes.has(nodeName)
  })
}

/**
 * Statistics about retrieval boost effectiveness.
 */
export interface BoostStats {
  totalFiles: number
  boostedFiles: number
  avgBoost: number
  maxBoost: number
  godNodeBoosts: number
  surpriseBoosts: number
}

/**
 * Compute statistics about graph boost effectiveness.
 *
 * @param original Original scores
 * @param enhanced Enhanced scores with boosts
 * @returns Statistics
 */
export function computeBoostStats(
  original: ScoredFile[],
  enhanced: EnhancedScoredFile[]
): BoostStats {
  const boosts = enhanced
    .map((e, i) => (e.graphBoost ?? 0))
    .filter((b) => b > 0)

  const godNodeBoosts = enhanced.filter((e) => e.isGodNode).length
  const surpriseBoosts = enhanced.filter((e) => e.surprisingConnections?.length).length

  return {
    totalFiles: enhanced.length,
    boostedFiles: boosts.length,
    avgBoost: boosts.length > 0 ? boosts.reduce((a, b) => a + b) / boosts.length : 0,
    maxBoost: Math.max(...boosts, 0),
    godNodeBoosts,
    surpriseBoosts
  }
}

/**
 * Measure retrieval quality improvement from graph boost.
 *
 * @param original Original ranked files
 * @param enhanced Enhanced ranked files
 * @returns Quality metrics
 */
export function measureRetrievalImprovement(
  original: ScoredFile[],
  enhanced: EnhancedScoredFile[]
): {
  topNImprovement: number[]  // Position changes for top 5
  avgRankImprovement: number
  godNodesInTop5: number
} {
  const topNImprovement: number[] = []

  for (let i = 0; i < Math.min(5, original.length); i++) {
    const originalFile = original[i]
    const newIndex = enhanced.findIndex((e) => e.file === originalFile.file)

    if (newIndex >= 0) {
      topNImprovement.push(i - newIndex)  // Positive = moved up
    }
  }

  const avgImprovement =
    topNImprovement.length > 0
      ? topNImprovement.reduce((a, b) => a + b) / topNImprovement.length
      : 0

  const godNodesInTop5 = enhanced
    .slice(0, 5)
    .filter((e) => e.isGodNode).length

  return {
    topNImprovement,
    avgRankImprovement: avgImprovement,
    godNodesInTop5
  }
}
