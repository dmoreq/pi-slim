/**
 * Context Intelligence Engine
 *
 * Analyzes conversation patterns and generates actionable guidance for agents.
 */

import type { AgentMessage } from '../shared/agent-message.js'
import type {
  ContextInsights,
  ConversationContext,
  EditingContext,
  NavigationContext,
  OptimizationSuggestion,
} from '../shared/intelligence-types.js'
import { computeDependentFanout } from './graph-impact.js'
import { godNodeMatchesSymbol } from './god-node-match.js'
import { parseGraphNodeId } from './graph-node-id.js'
import type { GodNode, GraphAnalysis, CodeGraph } from './graph-types.js'
import {
  type IntelligenceGuidanceOptions,
  type IntelligenceTurnMode,
  classifyIntelligenceTurnMode,
} from './intelligence-turn.js'
import { formatCompilerErrorLspGuidance } from './compiler-error-bridge.js'
import { AgentPatternDetector } from './pattern-detector.js'

/** Legacy hardcoded fallbacks when graph analysis is unavailable. */
const LEGACY_COMMUNITY_KEYWORDS = [
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
] as const

export type { IntelligenceGuidanceOptions, IntelligenceTurnMode }
export { classifyIntelligenceTurnMode }

/**
 * Orchestrates pattern detection, graph correlation, and natural-language guidance.
 */
export class ContextIntelligenceEngine {
  private patternDetector = new AgentPatternDetector()
  private projectRoot?: string

  /** Optional repo root for compiler-error path normalization. */
  setProjectRoot(root: string | undefined): void {
    this.projectRoot = root
  }

  analyzeConversationContext(messages: AgentMessage[], graphAnalysis?: GraphAnalysis | null): ContextInsights {
    let editingIntent = this.patternDetector.detectEditingIntent(messages)
    const navigationRequests = this.patternDetector.detectNavigationRequests(messages)
    const suboptimalPatterns = this.patternDetector.detectSuboptimalToolUsage(messages)
    const conversationContext = this.analyzeConversationMeta(messages, graphAnalysis)

    if (graphAnalysis && editingIntent.detected) {
      editingIntent = {
        ...editingIntent,
        affectedGodNodes: this.detectAffectedGodNodes(editingIntent, graphAnalysis),
      }
    }

    const compilerErrors = this.patternDetector.detectCompilerErrors(messages, this.projectRoot)

    return {
      editingIntent,
      navigationRequests,
      suboptimalPatterns,
      conversationContext,
      compilerErrors,
    }
  }

  generateActionableGuidance(
    insights: ContextInsights,
    graphAnalysis: GraphAnalysis | null,
    graphData?: CodeGraph | null,
    options: IntelligenceGuidanceOptions = {}
  ): string {
    const mode = options.mode ?? classifyIntelligenceTurnMode(insights, false)
    const includeWorkflow = options.includeWorkflow ?? true

    if (!graphAnalysis) {
      return this.generateBasicGuidance(insights, { includeWorkflow, mode })
    }

    const sections: string[] = []

    if (includeWorkflow && mode !== 'overview') {
      sections.push(this.generateWorkflowGuidance(insights, mode))
    }

    const optimizationBlock = this.formatOptimizationSuggestions(insights)
    if (optimizationBlock) {
      sections.push(optimizationBlock)
    }

    const compilerBlock = formatCompilerErrorLspGuidance(insights.compilerErrors ?? [])
    if (compilerBlock) {
      sections.push(compilerBlock)
    }

    if (mode === 'editing' && insights.editingIntent.detected) {
      const affectedLabels =
        insights.editingIntent.affectedGodNodes.length > 0
          ? insights.editingIntent.affectedGodNodes
          : this.detectAffectedGodNodes(insights.editingIntent, graphAnalysis)
      if (affectedLabels.length > 0) {
        sections.push(this.generateRiskWarnings(affectedLabels, graphAnalysis, graphData ?? undefined))
      }
    }

    const contextualSuggestions = this.generateContextualSuggestions(insights, graphAnalysis, mode)
    if (contextualSuggestions) {
      sections.push(contextualSuggestions)
    }

    return sections.filter(Boolean).join('\n\n')
  }

  detectAffectedGodNodes(editingContext: EditingContext, graphAnalysis: GraphAnalysis): string[] {
    if (!editingContext.detected) return []

    const affectedGodNodes: string[] = []

    for (const symbol of editingContext.targetSymbols) {
      for (const godNode of graphAnalysis.godNodes) {
        if (godNodeMatchesSymbol(godNode, symbol)) {
          affectedGodNodes.push(godNode.label)
        }
      }
    }

    return [...new Set(affectedGodNodes)]
  }

  private generateWorkflowGuidance(insights: ContextInsights, mode: IntelligenceTurnMode): string {
    const tips: string[] = []

    if (mode === 'navigation') {
      tips.push('- Use `lsp_go_to_definition` or `lsp_find_references` instead of manual search')
      tips.push('- Use `lsp_hover` for type info and graph impact at the cursor')
    } else if (mode === 'editing') {
      tips.push('- When editing code: Use `hashline_edit` with `dry_run: true` first when anchors are present')
      tips.push('- Before large edits on shared symbols: `lsp_find_references` then `lsp_hover`')
    } else {
      tips.push('- Editing: `hashline_edit` (dry_run first) · Navigation: LSP tools · Types: `lsp_hover`')
    }

    if (insights.editingIntent.hasHashAnnotations && mode !== 'navigation') {
      tips.push('- Hash anchors detected: use `hashline_edit` with dry_run: true')
    }

    if (insights.navigationRequests.detected) {
      const toolSuggestion = this.navigationToolSuggestion(insights.navigationRequests.requestType)
      const desc = this.navigationToolDescription(insights.navigationRequests.requestType)
      tips.push(`- Navigation: \`${toolSuggestion}\` — ${desc}`)
    }

    return `🎯 WORKFLOW OPTIMIZATION:\n${tips.join('\n')}`
  }

  private sortGodNodesByRisk(nodes: GodNode[]): GodNode[] {
    const order: Record<GodNode['criticality'], number> = {
      CRITICAL: 0,
      IMPORTANT: 1,
      NORMAL: 2,
    }
    return [...nodes].sort((a, b) => order[a.criticality] - order[b.criticality] || b.inDegree - a.inDegree)
  }

  private resolveGodNodesForLabels(labels: string[], graphAnalysis: GraphAnalysis): GodNode[] {
    const lower = new Set(labels.map(l => l.toLowerCase()))
    return graphAnalysis.godNodes.filter(
      gn => lower.has(gn.label.toLowerCase()) || lower.has(gn.nodeId.toLowerCase())
    )
  }

  private generateRiskWarnings(
    affectedLabels: string[],
    graphAnalysis: GraphAnalysis,
    graphData?: CodeGraph
  ): string {
    const matched = this.sortGodNodesByRisk(this.resolveGodNodesForLabels(affectedLabels, graphAnalysis)).slice(0, 5)

    const warnings = matched.map(godNode => {
      const lookup = godNode.label || godNode.nodeId
      const { dependentCount, affectedCommunities } = graphData
        ? computeDependentFanout(lookup, graphAnalysis)
        : {
            dependentCount: godNode.inDegree,
            affectedCommunities: this.estimateAffectedCommunities(godNode, graphAnalysis),
          }
      const icon = godNode.criticality === 'CRITICAL' ? '🔥' : godNode.criticality === 'IMPORTANT' ? '⚠️' : '🔍'
      return `- ${icon} \`${godNode.label}\` (${dependentCount} dependents, ${affectedCommunities} communities)`
    })

    return `⚠️ HIGH-IMPACT SYMBOLS (edit carefully):\n${warnings.join('\n')}`
  }

  private generateContextualSuggestions(
    insights: ContextInsights,
    graphAnalysis: GraphAnalysis,
    mode: IntelligenceTurnMode
  ): string | null {
    if (mode === 'overview' || mode === 'idle') return null
    if (!insights.editingIntent.detected && !insights.navigationRequests.detected) {
      return null
    }

    const suggestions: string[] = []

    if (insights.editingIntent.detected && mode === 'editing') {
      const targetSymbols = insights.editingIntent.targetSymbols.join(', ')
      suggestions.push(`Editing intent for "${targetSymbols}":`)

      if (insights.editingIntent.hasHashAnnotations) {
        suggestions.push('1. `hashline_edit` with dry_run, then apply')
      } else {
        suggestions.push('1. `lsp_go_to_definition` to confirm the symbol')
      }
      suggestions.push('2. `lsp_find_references` before applying changes')

      if (insights.editingIntent.affectedGodNodes.length > 0) {
        suggestions.push('3. God nodes overlap — treat as high-impact edit')
      }
    }

    if (insights.navigationRequests.detected) {
      const symbols = insights.navigationRequests.requestedSymbols.join(', ')
      const tool = this.navigationToolSuggestion(insights.navigationRequests.requestType)
      suggestions.push(`Navigation for "${symbols}": use \`${tool}\``)
    }

    void graphAnalysis
    return suggestions.length > 0 ? `💡 CURRENT CONTEXT SUGGESTIONS:\n${suggestions.join('\n')}` : null
  }

  private generateBasicGuidance(
    insights: ContextInsights,
    options: { includeWorkflow: boolean; mode: IntelligenceTurnMode }
  ): string {
    const sections: string[] = []

    if (options.includeWorkflow && options.mode !== 'overview') {
      sections.push(this.generateWorkflowGuidance(insights, options.mode))
    }

    const optimizationBlock = this.formatOptimizationSuggestions(insights)
    if (optimizationBlock) {
      sections.push(optimizationBlock)
    }

    const compilerBlock = formatCompilerErrorLspGuidance(insights.compilerErrors ?? [])
    if (compilerBlock) {
      sections.push(compilerBlock)
    }

    if (options.mode === 'editing' && insights.editingIntent.detected && insights.editingIntent.targetSymbols.length > 0) {
      const symbols = insights.editingIntent.targetSymbols.slice(0, 3).join(', ')
      sections.push(
        `⚠️ IMPACT UNKNOWN (no graph loaded):\n` +
          `- Symbols: \`${symbols}\`\n` +
          `- Run \`lsp_find_references\` before editing; use \`lsp_hover\` for local context`
      )
    }

    return sections.join('\n\n')
  }

  private formatOptimizationSuggestions(insights: ContextInsights): string | null {
    if (insights.suboptimalPatterns.length === 0) return null
    const suggestions = insights.suboptimalPatterns
      .map((pattern: OptimizationSuggestion) => `- ${pattern.recommendation}`)
      .join('\n')
    return `💡 OPTIMIZATION SUGGESTIONS:\n${suggestions}`
  }

  private navigationToolDescription(requestType: NavigationContext['requestType']): string {
    switch (requestType) {
      case 'references':
        return 'enumerate call sites and usages'
      case 'definition':
      case 'file_location':
        return 'jump to the canonical declaration'
      default:
        return 'jump to the canonical declaration'
    }
  }

  private navigationToolSuggestion(requestType: NavigationContext['requestType']): string {
    switch (requestType) {
      case 'references':
        return 'lsp_find_references'
      default:
        return 'lsp_go_to_definition'
    }
  }

  private analyzeConversationMeta(messages: AgentMessage[], graphAnalysis?: GraphAnalysis | null): ConversationContext {
    const content = messages
      .map(m => String(m.content || ''))
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
    const codebaseRelevant = codebaseKeywords.some(keyword => content.includes(keyword))

    const mentionedCommunities = graphAnalysis?.communities?.length
      ? this.detectMentionedGraphCommunities(content, graphAnalysis)
      : LEGACY_COMMUNITY_KEYWORDS.filter(pattern => content.includes(pattern))

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

  private detectMentionedGraphCommunities(contentLower: string, graphAnalysis: GraphAnalysis): string[] {
    const found: string[] = []

    for (const c of graphAnalysis.communities) {
      const labelLower = c.label.toLowerCase()
      const idLower = c.id.toLowerCase()
      if (contentLower.includes(labelLower) || contentLower.includes(idLower)) {
        found.push(c.label)
        continue
      }
      for (const nodeId of c.nodes) {
        const { pathPart, symbolPart } = parseGraphNodeId(nodeId)
        const basename = pathPart.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
        if (basename.length > 3 && contentLower.includes(basename.toLowerCase())) {
          found.push(c.label)
          break
        }
        if (symbolPart && symbolPart.length >= 4 && contentLower.includes(symbolPart.toLowerCase())) {
          found.push(c.label)
          break
        }
      }
    }

    return found
  }

  private estimateAffectedCommunities(godNode: GodNode, graphAnalysis: GraphAnalysis): number {
    const degree = godNode.inDegree + godNode.outDegree
    if (degree > 30) return Math.min(graphAnalysis.communities.length, 6)
    if (degree > 15) return Math.min(graphAnalysis.communities.length, 3)
    return 1
  }
}
