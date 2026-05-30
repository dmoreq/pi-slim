/**
 * Graph-backed dependency context: god-node prioritization, community linkage,
 * and tool-specific pattern hints. Complements {@link ContextIntelligenceEngine}
 * (workflow, risk, optimization) without duplicating those blocks.
 */

import type { ContextInsights } from '../shared/intelligence-types.js'
import { godNodeMatchesSymbol } from './god-node-match.js'
import type { GodNode, GraphAnalysis } from './graph-types.js'

export class SmartDependencyContextGenerator {
  generateEnhancedDependencyContext(insights: ContextInsights, graphAnalysis: GraphAnalysis | null): string {
    const sections: string[] = []

    const highPri = graphAnalysis ? this.collectHighPrioritySymbols(insights, graphAnalysis) : []
    if (highPri.length > 0) {
      const lines = highPri.map(g => `- ${g.label} (${g.criticality}, ${g.inDegree} in)`)
      sections.push(`🎯 HIGH-PRIORITY SYMBOLS\n${lines.join('\n')}`)
    }

    const arch = graphAnalysis ? this.buildCommunityContext(insights, graphAnalysis) : null
    if (arch) sections.push(arch)

    const patternTools = insights.suboptimalPatterns
      .filter(p => p.toolSuggestion)
      .map(p => `- \`${p.pattern}\`: ${p.recommendation} → \`${p.toolSuggestion}\``)
    if (patternTools.length > 0) {
      sections.push(`🔧 TOOL PATTERNS\n${patternTools.join('\n')}`)
    }

    return sections.join('\n\n')
  }

  private sortGodNodesByPriority(nodes: GodNode[]): GodNode[] {
    const order: Record<GodNode['criticality'], number> = {
      CRITICAL: 0,
      IMPORTANT: 1,
      NORMAL: 2,
    }
    return [...nodes].sort((a, b) => order[a.criticality] - order[b.criticality] || b.inDegree - a.inDegree)
  }

  private collectHighPrioritySymbols(insights: ContextInsights, graphAnalysis: GraphAnalysis): GodNode[] {
    const relevantSymbols = [
      ...insights.editingIntent.targetSymbols,
      ...insights.navigationRequests.requestedSymbols,
      ...insights.editingIntent.affectedGodNodes,
    ]

    if (relevantSymbols.length > 0) {
      const matches = graphAnalysis.godNodes.filter(gn => relevantSymbols.some(sym => godNodeMatchesSymbol(gn, sym)))
      return this.sortGodNodesByPriority(matches)
    }

    if (graphAnalysis.godNodes.length > 0) {
      return this.sortGodNodesByPriority(graphAnalysis.godNodes).slice(0, 3)
    }

    return []
  }

  private buildMentionedCommunitiesLower(insights: ContextInsights): Set<string> {
    return new Set(insights.conversationContext.mentionedCommunities.map(m => m.toLowerCase()))
  }

  private buildRelevantSymbolsLower(insights: ContextInsights): Set<string> {
    return new Set(
      [...insights.editingIntent.targetSymbols, ...insights.navigationRequests.requestedSymbols].map(s =>
        s.toLowerCase()
      )
    )
  }

  private buildCommunityContext(insights: ContextInsights, graph: GraphAnalysis): string | null {
    const mentionedLower = this.buildMentionedCommunitiesLower(insights)
    const symbolsLower = this.buildRelevantSymbolsLower(insights)

    const relevant = graph.communities.filter(
      c =>
        mentionedLower.has(c.id.toLowerCase()) ||
        mentionedLower.has(c.label.toLowerCase()) ||
        c.nodes.some(n => symbolsLower.has(n.toLowerCase())) ||
        [...mentionedLower].some(m => c.label.toLowerCase().includes(m))
    )

    if (relevant.length === 0) return null

    const lines = relevant.map(
      c =>
        `- **${c.label}** (\`${c.id}\`): ${c.nodes.length} symbols — cohesion ${(c.metrics?.cohesion ?? c.internalDensity).toFixed(2)}`
    )
    return `🏗️ ARCHITECTURAL CONTEXT\n${lines.join('\n')}`
  }
}
