/**
 * Surprising Connection Detection
 *
 * Identifies unexpected relationships in the dependency graph that reveal hidden patterns.
 * These are edges that appear unusual based on various criteria.
 */

import type { CodeGraph, SurprisingConnection } from '../context/graph-types.js'

/**
 * Reasons why a connection might be surprising.
 */
export type SurpriseReason =
  | 'cross-community' // Connects different modules
  | 'legacy' // Connects to deprecated/legacy code
  | 'circular' // Part of a cycle
  | 'hidden' // Not directly imported, but used
  | 'unexpected' // Defies expected patterns

/**
 * Detect all surprising connections in a graph.
 *
 * A connection is surprising if it:
 * - Crosses community boundaries (indicates tight coupling)
 * - Involves legacy code (indicates technical debt)
 * - Is part of a cycle (indicates fragile pattern)
 * - Is hidden (indirect dependency)
 * - Defies expected patterns
 *
 * Time Complexity: O(n × m) for full analysis
 * Space Complexity: O(m)
 *
 * @param graph The knowledge graph
 * @param communities Optional pre-computed communities for cross-community detection
 * @param cycles Optional pre-computed cycles for circular detection
 * @returns Array of surprising connections
 */
export function detectSurprisingConnections(
  graph: CodeGraph,
  communities?: Map<string, string>, // nodeId -> communityId
  cycles?: Set<string> // "source->target" edges in cycles
): SurprisingConnection[] {
  const surprises: SurprisingConnection[] = []
  const seenPairs = new Set<string>() // Deduplicate

  for (const edge of graph.edges) {
    const pairKey = `${edge.source}→${edge.target}`

    if (seenPairs.has(pairKey)) {
      continue
    }

    seenPairs.add(pairKey)

    // ── Check for cross-community edge ────────────────────────────────

    if (communities) {
      const sourceComm = communities.get(edge.source)
      const targetComm = communities.get(edge.target)

      if (sourceComm && targetComm && sourceComm !== targetComm) {
        surprises.push({
          source: edge.source,
          target: edge.target,
          reason: 'cross-community',
          confidence: 0.75,
          explanation: `Connects ${sourceComm} to ${targetComm}`,
        })
        continue
      }
    }

    // ── Check for legacy connection ──────────────────────────────────

    const isLegacy = (nodeId: string) => {
      return (
        nodeId.includes('legacy') || nodeId.includes('deprecated') || nodeId.includes('old') || nodeId.match(/v\d+/i) // version suffixes
      )
    }

    if (isLegacy(edge.target) && !isLegacy(edge.source)) {
      surprises.push({
        source: edge.source,
        target: edge.target,
        reason: 'legacy',
        confidence: 0.85,
        explanation: `Modern code depends on legacy: ${edge.target}`,
      })
      continue
    }

    // ── Check for circular edge ──────────────────────────────────────

    if (cycles?.has(pairKey)) {
      surprises.push({
        source: edge.source,
        target: edge.target,
        reason: 'circular',
        confidence: 1.0,
        explanation: 'Part of circular dependency',
      })
      continue
    }

    // ── Check for unexpected patterns ────────────────────────────────

    const sourceIsModule = edge.source.includes('/')
    const targetIsFunction = !edge.target.includes('/')
    const edgeType = edge.type

    // Modules shouldn't call individual functions (use other modules)
    if (sourceIsModule && targetIsFunction && edgeType === 'calls') {
      surprises.push({
        source: edge.source,
        target: edge.target,
        reason: 'unexpected',
        confidence: 0.6,
        explanation: 'Module directly calls function instead of module',
      })
    }
  }

  return surprises
}

/**
 * Identify high-impact surprising connections.
 * These are surprises that indicate structural issues.
 *
 * @param surprises All detected surprises
 * @param minConfidence Minimum confidence threshold (0-1)
 * @returns High-impact surprises
 */
export function filterHighImpactSurprises(
  surprises: SurprisingConnection[],
  minConfidence = 0.7
): SurprisingConnection[] {
  const highImpact = surprises.filter(s => s.confidence >= minConfidence)

  // Prioritize by reason (some are more important than others)
  const reasonPriority: Record<SurpriseReason, number> = {
    circular: 10, // Most critical
    legacy: 8, // Important technical debt
    'cross-community': 6,
    hidden: 4,
    unexpected: 2, // Least critical
  }

  return highImpact.sort((a, b) => (reasonPriority[b.reason] || 0) - (reasonPriority[a.reason] || 0))
}

/**
 * Analyze surprising connections by reason.
 *
 * @param surprises All detected surprises
 * @returns Breakdown by reason
 */
export function categorizeSurprises(surprises: SurprisingConnection[]): Record<SurpriseReason, SurprisingConnection[]> {
  const categories: Record<SurpriseReason, SurprisingConnection[]> = {
    'cross-community': [],
    legacy: [],
    circular: [],
    hidden: [],
    unexpected: [],
  }

  for (const surprise of surprises) {
    categories[surprise.reason].push(surprise)
  }

  return categories
}

/**
 * Find all nodes involved in surprising connections.
 *
 * @param surprises Detected surprises
 * @returns Set of node IDs with surprising connections
 */
export function getSurpriseNodes(surprises: SurprisingConnection[]): Set<string> {
  const nodes = new Set<string>()

  for (const surprise of surprises) {
    nodes.add(surprise.source)
    nodes.add(surprise.target)
  }

  return nodes
}

/**
 * Get top surprising connections by confidence.
 *
 * @param surprises All surprises
 * @param limit Number to return (default: 10)
 * @returns Top N surprises
 */
export function getTopSurprises(surprises: SurprisingConnection[], limit = 10): SurprisingConnection[] {
  return [...surprises].sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

/**
 * Statistics about surprising connections.
 */
export interface SurpriseStats {
  totalCount: number
  byReason: Record<SurpriseReason, number>
  avgConfidence: number
  maxConfidence: number
  minConfidence: number
  nodeCount: number
}

/**
 * Compute statistics about surprising connections.
 *
 * @param surprises All detected surprises
 * @returns Statistics
 */
export function computeSurpriseStats(surprises: SurprisingConnection[]): SurpriseStats {
  const categories = categorizeSurprises(surprises)
  const nodes = getSurpriseNodes(surprises)
  const confidences = surprises.map(s => s.confidence)

  return {
    totalCount: surprises.length,
    byReason: {
      'cross-community': categories['cross-community'].length,
      legacy: categories.legacy.length,
      circular: categories.circular.length,
      hidden: categories.hidden.length,
      unexpected: categories.unexpected.length,
    },
    avgConfidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
    maxConfidence: Math.max(...confidences, 0),
    minConfidence: Math.min(...confidences, 1),
    nodeCount: nodes.size,
  }
}

/**
 * Generate recommendation for surprising connection.
 *
 * @param surprise The surprising connection
 * @returns Actionable recommendation
 */
export function getSurpriseRecommendation(surprise: SurprisingConnection): string {
  const { source, target, reason } = surprise

  switch (reason) {
    case 'circular':
      return `Break circular dependency between ${source} and ${target} by extracting shared interface`

    case 'legacy':
      return `${source} depends on legacy code (${target}). Plan migration or deprecation.`

    case 'cross-community':
      return `${source} crosses module boundary to ${target}. Consider whether this coupling is necessary.`

    case 'hidden':
      return `${source} has hidden dependency on ${target}. Make relationship explicit or refactor.`

    case 'unexpected':
      return `Unexpected relationship between ${source} and ${target}. Review design.`

    default:
      return `Investigate surprising connection between ${source} and ${target}`
  }
}
