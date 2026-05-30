/**
 * Compact per-turn graph reminder (after full insights were injected once).
 */

import { godNodeMatchesSymbol } from './god-node-match.js'
import type { GraphAnalysis, GodNode } from './graph-types.js'
import type { ContextInsights } from '../shared/intelligence-types.js'

export interface GraphPulseInput {
  analysis: GraphAnalysis
  insights: ContextInsights
  activeCommunityId?: string | null
  cycleWarning?: string | null
}

function pickRelevantGodNodes(insights: ContextInsights, analysis: GraphAnalysis, limit = 2): GodNode[] {
  const symbols = [
    ...insights.editingIntent.targetSymbols,
    ...insights.navigationRequests.requestedSymbols,
    ...insights.editingIntent.affectedGodNodes,
  ]

  if (symbols.length > 0) {
    const matched = analysis.godNodes.filter(gn => symbols.some(sym => godNodeMatchesSymbol(gn, sym)))
    if (matched.length > 0) return matched.slice(0, limit)
  }

  const critical = analysis.godNodes.filter(g => g.criticality === 'CRITICAL')
  const pool = critical.length > 0 ? critical : analysis.godNodes
  return pool.slice(0, limit)
}

function communityLabel(analysis: GraphAnalysis, id: string | null | undefined): string | null {
  if (!id) return null
  const c = analysis.communities.find(x => x.id === id)
  return c ? `${c.label} (\`${c.id}\`)` : id
}

/**
 * Short graph context for turns after full Graph Analysis Insights (saves tokens).
 */
export function formatGraphPulse(input: GraphPulseInput): string | null {
  const lines: string[] = ['## Graph pulse', '']

  const comm = communityLabel(input.analysis, input.activeCommunityId)
  if (comm) {
    lines.push(`**Active community:** ${comm}`)
  } else if (input.analysis.communities.length > 1) {
    lines.push(`**Communities:** ${input.analysis.communities.length} modules detected`)
  }

  const gods = pickRelevantGodNodes(input.insights, input.analysis)
  if (gods.length > 0) {
    lines.push('**Focus god nodes:**')
    for (const g of gods) {
      lines.push(`  - \`${g.label}\` (${g.criticality}, ${g.inDegree} in) — use \`lsp_find_references\` before editing`)
    }
  }

  if (input.cycleWarning) {
    lines.push(`**Cycle:** ${input.cycleWarning}`)
  }

  if (lines.length <= 2) return null
  return lines.join('\n').trimEnd()
}
