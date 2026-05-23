/**
 * Enhanced dependency-oriented context: graph-prioritized symbols, tool hints,
 * and community-aware architectural notes (replaces purely static dep summaries).
 */

import type { ContextInsights } from '../shared/intelligence-types.js'
import { godNodeMatchesSymbol } from './god-node-match.js'
import type { GodNode, GraphAnalysis } from './graph-types.js'

export class SmartDependencyContextGenerator {
  /**
   * Build an intelligence-enhanced dependency context block from insights + graph.
   *
   * **God nodes:** Matched against edit targets, affected god nodes, and navigation
   * symbols. When nothing in the conversation points at specific symbols, the top
   * few god nodes (by criticality, then inbound degree) are still surfaced so the
   * graph stays actionable in read-only turns.
   */
  generateEnhancedDependencyContext(insights: ContextInsights, graphAnalysis: GraphAnalysis | null): string {
    const sections: string[] = []

    const highPri = graphAnalysis ? this.collectHighPrioritySymbols(insights, graphAnalysis) : []
    if (highPri.length > 0) {
      const lines = highPri.map(g => `- ${g.label} (${g.criticality})`)
      sections.push(`🎯 HIGH-PRIORITY SYMBOLS\n${lines.join('\n')}`)
    }

    if (insights.editingIntent.detected && insights.editingIntent.hasHashAnnotations) {
      sections.push('Use `hashline_edit` for hash-annotated regions; dry-run first when unsure of blast radius.')
    }

    const toolBlock = this.buildToolRecommendations(insights)
    if (toolBlock) sections.push(toolBlock)

    const arch = graphAnalysis ? this.buildCommunityContext(insights, graphAnalysis) : null
    if (arch) sections.push(arch)

    for (const p of insights.suboptimalPatterns) {
      if (p.toolSuggestion) {
        sections.push(`Pattern \`${p.pattern}\`: ${p.recommendation} → \`${p.toolSuggestion}\``)
      }
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

  /**
   * Resolve high-priority god nodes: conversation-relevant matches first; otherwise
   * the top three by graph impact so navigation/read turns still get prioritization.
   */
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

  /** Lowercase symbols from edit/nav intent for community linkage. */
  private buildRelevantSymbolsLower(insights: ContextInsights): Set<string> {
    return new Set(
      [...insights.editingIntent.targetSymbols, ...insights.navigationRequests.requestedSymbols].map(s =>
        s.toLowerCase()
      )
    )
  }

  private buildMentionedCommunitiesLower(insights: ContextInsights): Set<string> {
    return new Set(insights.conversationContext.mentionedCommunities.map(m => m.toLowerCase()))
  }

  private buildToolRecommendations(insights: ContextInsights): string | null {
    const lines: string[] = []

    if (insights.editingIntent.detected && insights.editingIntent.hasHashAnnotations) {
      lines.push('- Use `hashline_edit` for hash-verified edits on annotated regions')
    }

    if (insights.navigationRequests.detected) {
      const { requestType } = insights.navigationRequests
      if (requestType === 'references') {
        lines.push('- Use `lsp_find_references` to enumerate call sites and usages')
      } else if (requestType === 'definition') {
        lines.push('- Use `lsp_go_to_definition` to jump to the canonical declaration')
      } else if (requestType === 'file_location') {
        lines.push('- Use `lsp_go_to_definition` or workspace search to resolve the owning file')
      }
    }

    if (insights.editingIntent.detected && insights.editingIntent.affectedGodNodes.length > 0) {
      lines.push('- God-node overlap: run `lsp_find_references` before editing to gauge dependency fan-out')
    }

    if (lines.length === 0) return null
    return `🔧 RECOMMENDED TOOLS\n${lines.join('\n')}`
  }

  private buildCommunityContext(insights: ContextInsights, graph: GraphAnalysis): string | null {
    const mentionedLower = this.buildMentionedCommunitiesLower(insights)
    const symbolsLower = this.buildRelevantSymbolsLower(insights)

    const relevant = graph.communities.filter(
      c =>
        mentionedLower.has(c.id.toLowerCase()) ||
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
