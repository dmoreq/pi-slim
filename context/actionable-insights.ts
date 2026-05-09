/**
 * Actionable Insights Generator
 *
 * Transforms static graph analysis into dynamic, actionable guidance that
 * steers agents toward safer edits and faster navigation.
 */

import type { GraphifyAnalysis, GodNode, CommunityAnalysis } from './graph-types.js'
import type { ContextInsights } from '../shared/intelligence-types.js'

type CommunitySizing = CommunityAnalysis & { size?: number; cohesion?: number }

export class ActionableInsightsGenerator {
  /**
   * Produce the full actionable-insights XML block from conversation + graph.
   */
  generate(insights: ContextInsights, graphAnalysis: GraphifyAnalysis | null): string {
    if (!graphAnalysis) {
      return this.generateBasicInsights(insights)
    }

    const sections: string[] = []

    sections.push(this.generateWorkflowGuidance())

    if (graphAnalysis.godNodes.length > 0) {
      sections.push(this.generateRiskWarnings(graphAnalysis.godNodes))
    }

    if (graphAnalysis.communities.length > 0) {
      sections.push(this.generateArchitecturalGuidance(graphAnalysis.communities))
    }

    if (insights.editingIntent.detected || insights.navigationRequests.detected) {
      sections.push(this.generateContextualSuggestions(insights, graphAnalysis))
    }

    return `<actionable-insights>\n${sections.filter(Boolean).join('\n\n')}\n</actionable-insights>`
  }

  /**
   * General workflow optimizations and tool pairing recommendations.
   */
  generateWorkflowGuidance(): string {
    const tips = [
      '- When editing code: Use `hashline_edit` tool for hash-verified edits',
      '- When finding symbols: Use `lsp_go_to_definition` instead of asking for file paths',
      '- When exploring code: Use `lsp_find_references` to see usage patterns',
      '- When navigating large files: Use LSP hover for context without reading entire files',
    ]

    return `🎯 WORKFLOW OPTIMIZATION:\n${tips.join('\n')}`
  }

  /**
   * Risk callouts for high-centrality (“god”) symbols.
   */
  generateRiskWarnings(godNodes: GodNode[]): string {
    const sortedGodNodes = [...godNodes].sort(this.compareGodNodesRisk).slice(0, 5)

    const warnings = sortedGodNodes.map((godNode) => this.formatGodNodeWarning(godNode))

    return `⚠️ HIGH-IMPACT SYMBOLS (edit carefully):\n${warnings.join('\n')}`
  }

  /**
   * Summarize cohesion and refactoring safety across top communities by impact.
   */
  generateArchitecturalGuidance(communities: CommunityAnalysis[]): string {
    const sortedCommunities = [...communities]
      .sort((a, b) => this.communityImpactScore(b) - this.communityImpactScore(a))
      .slice(0, 6)

    const guidance = sortedCommunities.map((community) => {
      const cohesion = this.communityCohesion(community)
      const safetyLevel =
        cohesion > 0.8
          ? 'Self-contained — safe to refactor'
          : cohesion > 0.6
            ? 'Moderate coupling — refactor with caution'
            : 'High coupling — test thoroughly'

      const size = this.communitySize(community)
      const sizeDesc = size === 1 ? '1 file' : `${size} files`

      return `- ${community.label} (${sizeDesc}): ${safetyLevel}`
    })

    return `🏗️ ARCHITECTURAL GUIDANCE:\n${guidance.join('\n')}`
  }

  /**
   * Short, conversational tips tied to the current edit/navigation posture.
   */
  generateContextualSuggestions(insights: ContextInsights, graphAnalysis: GraphifyAnalysis): string {
    const suggestions: string[] = []

    if (insights.editingIntent.detected) {
      const targetSymbols = insights.editingIntent.targetSymbols.slice(0, 3).join(', ')
      suggestions.push(`Based on editing intent for "${targetSymbols}":`)

      if (insights.editingIntent.hasHashAnnotations) {
        suggestions.push('1. Use `hashline_edit` with dry_run: true to preview changes safely')
        suggestions.push('2. Hash annotations detected - avoid StrReplace for consistency')
      } else {
        suggestions.push('1. Use `lsp_go_to_definition` to locate symbols efficiently')
        suggestions.push('2. Consider using `lsp_hover` for context before editing')
      }

      const affectedGodNodes = this.findAffectedGodNodes(insights.editingIntent.targetSymbols, graphAnalysis.godNodes)

      if (affectedGodNodes.length > 0) {
        suggestions.push('3. ⚠️ God nodes detected - run `lsp_find_references` to assess impact')
        suggestions.push('4. Consider incremental changes with testing at each step')
      }
    }

    if (insights.navigationRequests.detected) {
      const symbols = insights.navigationRequests.requestedSymbols.slice(0, 2).join(', ')
      const tool =
        insights.navigationRequests.requestType === 'references' ? 'lsp_find_references' : 'lsp_go_to_definition'

      suggestions.push(`For "${symbols}" navigation:`)
      suggestions.push(`- Use \`${tool}\` instead of manual file browsing`)
      suggestions.push('- Results will auto-inject into next context for seamless workflow')
    }

    if (insights.conversationContext.mentionedCommunities.length > 0) {
      const communitiesLabel = insights.conversationContext.mentionedCommunities.slice(0, 2).join(', ')
      suggestions.push(`Working across communities (${communitiesLabel}):`)
      suggestions.push('- Respect community boundaries when adding features')
      suggestions.push('- Consider interface changes rather than cross-community dependencies')
    }

    return suggestions.length > 0 ? `💡 CURRENT CONTEXT SUGGESTIONS:\n${suggestions.join('\n')}` : ''
  }

  /** Basic guidance when analysis is unavailable. */
  private generateBasicInsights(insights: ContextInsights): string {
    const sections: string[] = []

    sections.push(this.generateWorkflowGuidance())

    if (insights.editingIntent.detected) {
      sections.push(
        ['💡 EDITING RECOMMENDATIONS:', '- Use `hashline_edit` if hash annotations are available',
          '- Use `lsp_go_to_definition` to locate symbols before editing',
          '- Use `lsp_find_references` to understand usage before changes',
        ].join('\n'))
    }

    if (insights.navigationRequests.detected) {
      sections.push(
        ['💡 NAVIGATION RECOMMENDATIONS:', '- Use LSP tools instead of manual search',
          '- Leverage intelligent retrieval by mentioning symbol names',
          '- Let pi-scope find files rather than specifying paths',
        ].join('\n'))
    }

    return `<actionable-insights>\n${sections.join('\n\n')}\n</actionable-insights>`
  }

  /** Match edit targets against high-impact symbols. */
  private findAffectedGodNodes(targetSymbols: string[], godNodes: GodNode[]): GodNode[] {
    const affected: GodNode[] = []

    for (const symbol of targetSymbols) {
      for (const godNode of godNodes) {
        const symbolLower = symbol.toLowerCase()
        const labelLower = godNode.label.toLowerCase()
        const nodeIdLower = godNode.nodeId.toLowerCase()

        if (
          labelLower.includes(symbolLower) ||
          nodeIdLower.includes(symbolLower) ||
          symbolLower.includes(labelLower)
        ) {
          affected.push(godNode)
        }
      }
    }

    return [...new Map(affected.map((gn) => [gn.nodeId, gn])).values()]
  }

  private compareGodNodesRisk(a: GodNode, b: GodNode): number {
    const criticalityOrder: Record<GodNode['criticality'], number> = {
      CRITICAL: 3,
      IMPORTANT: 2,
      NORMAL: 1,
    }
    const aCrit = criticalityOrder[a.criticality]
    const bCrit = criticalityOrder[b.criticality]
    if (aCrit !== bCrit) return bCrit - aCrit
    return b.inDegree - a.inDegree
  }

  private formatGodNodeWarning(godNode: GodNode): string {
    const criticalityIcon =
      godNode.criticality === 'CRITICAL' ? '🔥' : godNode.criticality === 'IMPORTANT' ? '⚠️' : '🔍'

    const dependencies = godNode.inDegree
    const impactLevel =
      dependencies > 20
        ? 'affects entire system'
        : dependencies > 10
          ? `affects ${Math.floor(dependencies / 5)} subsystems`
          : `affects ${dependencies} components`

    return `- ${criticalityIcon} \`${godNode.label}\` (${dependencies} dependencies, ${godNode.criticality}) — ${impactLevel}`
  }

  private communitySize(community: CommunityAnalysis): number {
    const sizing = community as CommunitySizing
    return typeof sizing.size === 'number' ? sizing.size : community.nodes.length
  }

  private communityCohesion(community: CommunityAnalysis): number {
    const sizing = community as CommunitySizing
    if (typeof sizing.cohesion === 'number') return sizing.cohesion
    return sizing.metrics?.cohesion ?? sizing.internalDensity
  }

  private communityImpactScore(community: CommunityAnalysis): number {
    return this.communitySize(community) * this.communityCohesion(community)
  }
}
