/**
 * Context Intelligence Engine
 *
 * Core engine that analyzes conversation patterns and generates
 * actionable guidance for agents.
 */

import { AgentPatternDetector } from './pattern-detector.js'
import type { AgentMessage } from '../shared/agent-message.js'
import type { GodNode, GraphifyAnalysis } from './graph-types.js'
import type {
  ContextInsights,
  ConversationContext,
  EditingContext,
  NavigationContext,
  OptimizationSuggestion,
} from '../shared/intelligence-types.js'

/**
 * Orchestrates pattern detection, graph correlation, and natural-language
 * guidance for agent steering.
 */
export class ContextIntelligenceEngine {
  private patternDetector = new AgentPatternDetector()

  /**
   * Analyze conversation history to extract insights about agent behavior.
   *
   * @param messages - Transcript slice to scan (typically recent turns).
   * @param graphAnalysis - When provided and editing intent is detected,
   *   {@link EditingContext.affectedGodNodes} is filled via
   *   {@link detectAffectedGodNodes}. Omit or pass null when no graph is loaded;
   *   the field stays empty and callers may compute it later.
   */
  analyzeConversationContext(
    messages: AgentMessage[],
    graphAnalysis?: GraphifyAnalysis | null,
  ): ContextInsights {
    let editingIntent = this.patternDetector.detectEditingIntent(messages)
    const navigationRequests =
      this.patternDetector.detectNavigationRequests(messages)
    const suboptimalPatterns =
      this.patternDetector.detectSuboptimalToolUsage(messages)

    const conversationContext = this.analyzeConversationMeta(messages)

    if (graphAnalysis && editingIntent.detected) {
      editingIntent = {
        ...editingIntent,
        affectedGodNodes: this.detectAffectedGodNodes(
          editingIntent,
          graphAnalysis,
        ),
      }
    }

    return {
      editingIntent,
      navigationRequests,
      suboptimalPatterns,
      conversationContext,
    }
  }

  /**
   * Generate actionable guidance based on insights and graph analysis.
   *
   * @param insights - Detector output merged with conversation meta.
   * @param graphAnalysis - Graph-derived signals, or null to fall back to basic tips.
   */
  generateActionableGuidance(
    insights: ContextInsights,
    graphAnalysis: GraphifyAnalysis | null,
  ): string {
    if (!graphAnalysis) {
      return this.generateBasicGuidance(insights)
    }

    const sections: string[] = []

    sections.push(this.generateWorkflowGuidance(insights))

    const optimizationBlock = this.formatOptimizationSuggestions(insights)
    if (optimizationBlock) {
      sections.push(optimizationBlock)
    }

    if (insights.editingIntent.detected) {
      const affectedGodNodes = this.detectAffectedGodNodes(
        insights.editingIntent,
        graphAnalysis,
      )
      if (affectedGodNodes.length > 0) {
        sections.push(this.generateRiskWarnings(affectedGodNodes, graphAnalysis))
      }
    }

    if (insights.conversationContext.mentionedCommunities.length > 0) {
      sections.push(this.generateArchitecturalGuidance(graphAnalysis))
    }

    const contextualSuggestions = this.generateContextualSuggestions(
      insights,
      graphAnalysis,
    )
    if (contextualSuggestions) {
      sections.push(contextualSuggestions)
    }

    return sections.join('\n\n')
  }

  /**
   * Detect which god nodes are affected by editing intent target symbols.
   */
  detectAffectedGodNodes(
    editingContext: EditingContext,
    graphAnalysis: GraphifyAnalysis,
  ): string[] {
    if (!editingContext.detected) return []

    const affectedGodNodes: string[] = []

    for (const symbol of editingContext.targetSymbols) {
      for (const godNode of graphAnalysis.godNodes) {
        if (this.matchesGodNode(symbol, godNode)) {
          affectedGodNodes.push(godNode.label)
        }
      }
    }

    return [...new Set(affectedGodNodes)]
  }

  /**
   * True when a transcript symbol refers to this god node.
   * Prefers exact label/nodeId equality; allows substring only on the graph side
   * (label/nodeId contains symbol) and only for symbols of length ≥ 4 to limit
   * false positives from short tokens.
   */
  private matchesGodNode(symbol: string, godNode: GodNode): boolean {
    const symbolLower = symbol.toLowerCase()
    const labelLower = godNode.label.toLowerCase()
    const nodeIdLower = godNode.nodeId.toLowerCase()

    if (
      symbolLower === labelLower ||
      symbolLower === nodeIdLower
    ) {
      return true
    }

    if (symbol.length >= 4) {
      return (
        labelLower.includes(symbolLower) || nodeIdLower.includes(symbolLower)
      )
    }

    return false
  }

  /**
   * Generate workflow optimization guidance.
   */
  private generateWorkflowGuidance(insights: ContextInsights): string {
    const tips: string[] = []

    tips.push(
      '- When editing code: Use `hashline_edit` tool for hash-verified edits',
    )
    tips.push(
      '- When finding symbols: Use `lsp_go_to_definition` instead of asking for file paths',
    )
    tips.push(
      '- When exploring code: Use `lsp_find_references` to see usage patterns',
    )

    if (insights.editingIntent.hasHashAnnotations) {
      tips.push(
        '- Hash annotations detected: Always use `hashline_edit` with dry_run: true first',
      )
    }

    if (insights.navigationRequests.detected) {
      const toolSuggestion = this.navigationToolSuggestion(
        insights.navigationRequests.requestType,
      )
      tips.push(
        `- Navigation request detected: Use \`${toolSuggestion}\` instead of manual search`,
      )
    }

    return `🎯 WORKFLOW OPTIMIZATION:\n${tips.join('\n')}`
  }

  /**
   * Generate risk warnings for god nodes touched by editing intent.
   */
  private generateRiskWarnings(
    affectedGodNodes: string[],
    graphAnalysis: GraphifyAnalysis,
  ): string {
    const warnings: string[] = []

    for (const nodeId of affectedGodNodes) {
      const godNode = graphAnalysis.godNodes.find(
        (gn) =>
          gn.nodeId.toLowerCase().includes(nodeId.toLowerCase()) ||
          gn.label.toLowerCase().includes(nodeId.toLowerCase()),
      )

      if (godNode) {
        const dependencies = godNode.inDegree
        const criticalityIcon =
          godNode.criticality === 'CRITICAL'
            ? '🔥'
            : godNode.criticality === 'IMPORTANT'
              ? '⚠️'
              : '🔍'

        warnings.push(
          `- ${criticalityIcon} \`${godNode.label}\` (${dependencies} dependencies) - Changes affect ${this.estimateAffectedCommunities(godNode, graphAnalysis)} communities`,
        )
      }
    }

    return `⚠️ HIGH-IMPACT SYMBOLS (edit carefully):\n${warnings.join('\n')}`
  }

  /**
   * Generate architectural guidance based on top communities in the graph.
   */
  private generateArchitecturalGuidance(
    graphAnalysis: GraphifyAnalysis,
  ): string {
    const guidance: string[] = []

    for (const community of graphAnalysis.communities.slice(0, 5)) {
      const cohesion =
        community.metrics?.cohesion ?? community.internalDensity ?? 0
      const safetyLevel =
        cohesion > 0.8
          ? 'safe to refactor'
          : cohesion > 0.6
            ? 'refactor with caution'
            : 'test thoroughly before changes'

      guidance.push(
        `- ${community.label} (${community.nodes.length} files): ${safetyLevel}`,
      )
    }

    return `🏗️ ARCHITECTURAL GUIDANCE:\n${guidance.join('\n')}`
  }

  /**
   * Generate contextual suggestions based on the current transcript signals.
   */
  private generateContextualSuggestions(
    insights: ContextInsights,
    graphAnalysis: GraphifyAnalysis,
  ): string | null {
    if (
      !insights.editingIntent.detected &&
      !insights.navigationRequests.detected
    ) {
      return null
    }

    const suggestions: string[] = []

    if (insights.editingIntent.detected) {
      const targetSymbols = insights.editingIntent.targetSymbols.join(', ')
      suggestions.push(`Based on editing intent for "${targetSymbols}":`)

      if (insights.editingIntent.hasHashAnnotations) {
        suggestions.push(
          '1. Use `hashline_edit` for efficient editing (avoids re-reading)',
        )
      } else {
        suggestions.push(
          '1. Use `lsp_go_to_definition` to locate symbols first',
        )
      }

      suggestions.push(
        '2. Check impact with `lsp_find_references` before major changes',
      )

      const affectedGodNodes = this.detectAffectedGodNodes(
        insights.editingIntent,
        graphAnalysis,
      )
      if (affectedGodNodes.length > 0) {
        suggestions.push('3. Consider impact analysis - god nodes detected')
      }
    }

    if (insights.navigationRequests.detected) {
      const symbols = insights.navigationRequests.requestedSymbols.join(', ')
      const tool = this.navigationToolSuggestion(
        insights.navigationRequests.requestType,
      )

      suggestions.push(`For navigation request "${symbols}":`)
      suggestions.push(`- Use \`${tool}\` instead of manual search`)
    }

    return suggestions.length > 0
      ? `💡 CURRENT CONTEXT SUGGESTIONS:\n${suggestions.join('\n')}`
      : null
  }

  /**
   * Generate basic guidance when no graph analysis is available.
   */
  private generateBasicGuidance(insights: ContextInsights): string {
    const sections: string[] = []

    sections.push(this.generateWorkflowGuidance(insights))

    const optimizationBlock = this.formatOptimizationSuggestions(insights)
    if (optimizationBlock) {
      sections.push(optimizationBlock)
    }

    return sections.join('\n\n')
  }

  private formatOptimizationSuggestions(
    insights: ContextInsights,
  ): string | null {
    if (insights.suboptimalPatterns.length === 0) return null
    const suggestions = insights.suboptimalPatterns
      .map((pattern: OptimizationSuggestion) => `- ${pattern.recommendation}`)
      .join('\n')
    return `💡 OPTIMIZATION SUGGESTIONS:\n${suggestions}`
  }

  private navigationToolSuggestion(
    requestType: NavigationContext['requestType'],
  ): string {
    switch (requestType) {
      case 'references':
        return 'lsp_find_references'
      case 'definition':
      case 'file_location':
      default:
        return 'lsp_go_to_definition'
    }
  }

  /**
   * Summarize recency, codebase relevance, and lightweight entity mentions.
   */
  private analyzeConversationMeta(
    messages: AgentMessage[],
  ): ConversationContext {
    const content = messages
      .map((m) => String(m.content || ''))
      .join(' ')
      .toLowerCase()

    const codebaseKeywords = [
      'function',
      'class',
      'file',
      'code',
      'edit',
      'implement',
      'refactor',
      'bug',
      'fix',
      'test',
      'import',
      'export',
      'variable',
      'method',
    ]
    const codebaseRelevant = codebaseKeywords.some((keyword) =>
      content.includes(keyword),
    )

    const communityPatterns = [
      'auth',
      'authentication',
      'security',
      'transport',
      'client',
      'api',
      'database',
      'storage',
      'ui',
      'frontend',
      'backend',
      'service',
    ]
    const mentionedCommunities = communityPatterns.filter((pattern) =>
      content.includes(pattern),
    )

    const filePattern = /(['"`]?)([./][\w./-]+\.(?:ts|tsx|py|rs|js|jsx))\1/g
    const mentionedFiles: string[] = []
    for (const match of content.matchAll(filePattern)) {
      mentionedFiles.push(match[2])
    }

    return {
      recentMessages: messages.length,
      codebaseRelevant,
      mentionedCommunities: [...new Set(mentionedCommunities)],
      mentionedFiles: [...new Set(mentionedFiles)],
    }
  }

  /**
   * Rough estimate of how many communities a god node may span from degree.
   */
  private estimateAffectedCommunities(
    godNode: GodNode,
    graphAnalysis: GraphifyAnalysis,
  ): number {
    const degree = godNode.inDegree + godNode.outDegree
    if (degree > 30)
      return Math.min(graphAnalysis.communities.length, 6)
    if (degree > 15)
      return Math.min(graphAnalysis.communities.length, 3)
    return 1
  }
}
