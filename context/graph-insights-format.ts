/**
 * Format full graph insights block for system-prompt injection.
 */

import type { GraphAnalysis } from './graph-types.js'

export interface GraphInsightsFormatOptions {
  surfaceAnomalies?: boolean
  surfaceSurprisesMax?: number
}

export function topGodLabels(analysis: GraphAnalysis, limit = 5): string[] {
  return analysis.godNodes.slice(0, limit).map(g => g.label)
}

export function formatGraphInsightsSection(
  a: GraphAnalysis,
  options: GraphInsightsFormatOptions = {}
): string {
  const surfaceAnomalies = options.surfaceAnomalies ?? true
  const surpriseMax = options.surfaceSurprisesMax ?? 5

  const lines: string[] = [
    '## Graph Analysis Insights',
    '',
    `**Graph:** ${a.metrics.totalNodes} nodes, ${a.metrics.totalEdges} edges, ${a.metrics.communityCount} communities`,
  ]
  if (a.metrics.cycleCount > 0) {
    lines.push(`**Circular Dependencies:** ${a.metrics.cycleCount}`)
  }
  lines.push('')

  if (a.godNodes.length > 0) {
    lines.push('**God Nodes (most depended-on symbols):**')
    for (const g of a.godNodes.slice(0, 5)) {
      lines.push(`  - \`${g.label}\` (${g.inDegree} in, ${g.outDegree} out, ${g.criticality})`)
    }
    if (a.godNodes.length > 5) {
      lines.push(`  - ... and ${a.godNodes.length - 5} more`)
    }
    lines.push('')
  }

  if (a.communities.length > 1) {
    lines.push('**Communities:**')
    for (const c of a.communities) {
      lines.push(`  - ${c.label}: ${c.nodes.length} nodes`)
    }
    lines.push('')
  }

  if (a.bottlenecks.length > 0) {
    lines.push('**Bottlenecks (high betweenness):**')
    for (const b of a.bottlenecks.slice(0, 5)) {
      const label = b.nodeId.includes(':') ? b.nodeId.split(':').pop() : b.nodeId
      lines.push(`  - \`${label}\` (${b.impact.dependentCount} dependents, ${b.betweenness.toFixed(2)} betweenness)`)
    }
    if (a.bottlenecks.length > 5) {
      lines.push(`  - ... and ${a.bottlenecks.length - 5} more`)
    }
    lines.push('')
  }

  if (surfaceAnomalies && a.anomalies.length > 0) {
    lines.push('**Anomalies:**')
    for (const an of a.anomalies.slice(0, 3)) {
      const nodes = an.nodes
        .slice(0, 2)
        .map(n => (n.includes(':') ? n.split(':').pop() : n))
        .join(', ')
      lines.push(`  - [${an.severity}] ${an.type}: ${an.description}${nodes ? ` (${nodes})` : ''}`)
    }
    if (a.anomalies.length > 3) {
      lines.push(`  - ... and ${a.anomalies.length - 3} more`)
    }
    lines.push('')
  }

  if (surpriseMax > 0 && a.surprises.length > 0) {
    lines.push('**Notable connections:**')
    for (const s of a.surprises.slice(0, surpriseMax)) {
      lines.push(`  - \`${s.source}\` → \`${s.target}\` (${s.reason})`)
    }
  }

  return lines.filter(l => l !== undefined).join('\n').trimEnd()
}
