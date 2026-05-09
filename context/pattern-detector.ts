/**
 * Agent Pattern Detector
 *
 * Analyzes conversation history to detect agent behavior patterns
 * and identify optimization opportunities.
 */

import type { AgentMessage } from '../manager.js'
import type {
  EditingContext,
  NavigationContext,
  OptimizationSuggestion,
} from '../shared/intelligence-types.js'

export class AgentPatternDetector {
  /**
   * Detect when agent intends to edit files based on conversation content
   */
  detectEditingIntent(messages: AgentMessage[]): EditingContext {
    const recentMessages = messages.slice(-10)
    const preserved = recentMessages.map((m) => String(m.content || '')).join(' ')
    const contentLower = preserved.toLowerCase()

    const editingKeywords = [
      'edit',
      'modify',
      'change',
      'update',
      'fix',
      'refactor',
      'add to',
      'remove from',
      'implement',
      'write',
    ]

    const detected = editingKeywords.some((keyword) => contentLower.includes(keyword))

    if (!detected) {
      return {
        detected: false,
        targetSymbols: [],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      }
    }

    const symbolPatterns: RegExp[] = [
      /\b(?:edit|modify|change|update|fix|refactor)\s+(?:the\s+)?([\w]+)\s+(?:function|method|class|interface|logic|constructor|handler)\b/gi,
      /\bimplement(?:ing)?\s+(?:the\s+)?([\w]+)\b/gi,
      /\b([A-Z][a-z]+\w*[A-Z]\w*)\b/g,
      /\b([a-z]+[A-Z]\w*)\b/g,
      /\b([a-z]+_[a-z]\w*)\b/g,
      /\b(?:function|class|interface|type)\s+([\w]+)\b/gi,
    ]

    const targetSymbols: string[] = []
    for (const pattern of symbolPatterns) {
      const regex = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
      for (const match of preserved.matchAll(regex)) {
        const symbol = match[1]
        if (symbol && symbol.length > 2) targetSymbols.push(symbol)
      }
    }

    const filePattern = /\b[\w./~-]+\.(?:ts|tsx|py|rs|js|jsx|mjs|cjs)\b/gi
    const targetFiles: string[] = []
    for (const match of preserved.matchAll(filePattern)) {
      targetFiles.push(match[0])
    }

    const hasHashAnnotations =
      contentLower.includes('hashline') || /\b\d+[a-z]{2}\b/.test(contentLower)

    return {
      detected: true,
      targetSymbols: [...new Set(targetSymbols)],
      targetFiles: [...new Set(targetFiles)],
      hasHashAnnotations,
      affectedGodNodes: [],
    }
  }

  /**
   * Detect navigation requests (looking for definitions, references, files)
   */
  detectNavigationRequests(messages: AgentMessage[]): NavigationContext {
    const recentMessages = messages.slice(-5)
    const preserved = recentMessages.map((m) => String(m.content || '')).join(' ')
    const content = preserved.toLowerCase()

    let requestType: NavigationContext['requestType'] = 'none'
    let detected = false

    if (/\b(where\s+is|find\s+the|locate\b|definition\s+of)\b/.test(content)) {
      detected = true
      requestType = 'definition'
    } else if (
      /\b(references\s+to|usages\s+of|called\s+from)\b/.test(content) ||
      /\bwhere\b[^.?]{0,120}\bused\b/.test(content)
    ) {
      detected = true
      requestType = 'references'
    } else if (
      /\b(which\s+file|what\s+file|file\s+contains|file\s+location)\b/.test(content)
    ) {
      detected = true
      requestType = 'file_location'
    }

    if (!detected) {
      return {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      }
    }

    const symbolPatterns: RegExp[] = [
      /\b(?:where\s+is|find\s+the|definition\s+of|references\s+to|usages\s+of)\s+(?:the\s+)?([\w]+)\b/gi,
      /\bthe\s+([\w]+)\s+(?:class|interface|enum|type)\b/gi,
      /\b([\w]+)\s+(?:class|interface|enum)(?:\s+defined|\s+(?:extends|implements))?\b/gi,
      /\b([A-Z][a-z]+\w*[A-Z]\w*)\b/g,
      /\b([a-z]+[A-Z]\w*)\b/g,
    ]

    const requestedSymbols: string[] = []
    for (const pattern of symbolPatterns) {
      const regex = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
      for (const match of preserved.matchAll(regex)) {
        const symbol = match[1]
        if (symbol && symbol.length > 2) requestedSymbols.push(symbol)
      }
    }

    return {
      detected: true,
      requestedSymbols: [...new Set(requestedSymbols)],
      requestType,
    }
  }

  /**
   * Detect suboptimal tool usage patterns that should be optimized
   */
  detectSuboptimalToolUsage(messages: AgentMessage[]): OptimizationSuggestion[] {
    const recentMessages = messages.slice(-15)
    const suggestions: OptimizationSuggestion[] = []

    const allMessages = recentMessages.map((m) =>
      String(m.content || '').toLowerCase(),
    )

    const usesStrReplace = allMessages.some(
      (c) =>
        c.includes('strreplace') ||
        /\b(str\s+replace|string\s+replace)\b/.test(c) ||
        c.includes('edit the file'),
    )

    if (usesStrReplace) {
      const hasHashContent = allMessages.some(
        (c) => c.includes('hashline') || /\b\d+[a-z]{2}\b/.test(c),
      )
      suggestions.push({
        type: 'tool_usage',
        pattern: 'basic_file_edit',
        recommendation: hasHashContent
          ? 'Use hashline_edit instead of StrReplace when hash-annotated content is available'
          : 'Prefer hashline_edit over StrReplace for hash-verified, line-accurate edits when annotations are present',
        confidence: hasHashContent ? 0.9 : 0.75,
        context: hasHashContent
          ? 'hash-annotated content available'
          : 'StrReplace-style bulk edit detected; hashline_edit reduces drift',
        toolSuggestion: 'hashline_edit',
      })
    }

    const asksForLocations = allMessages.some(
      (c) =>
        c.includes('which file') ||
        c.includes('where is') ||
        c.includes('can you tell me'),
    )

    if (asksForLocations) {
      suggestions.push({
        type: 'tool_usage',
        pattern: 'manual_navigation',
        recommendation:
          'Use lsp_go_to_definition or lsp_find_references instead of asking for file locations',
        confidence: 0.8,
        context: 'LSP tools available for navigation',
        toolSuggestion: 'lsp_go_to_definition',
      })
    }

    const mentionsGodNodes = allMessages.some(
      (c) => c.includes('god node') || c.includes('critical') || c.includes('important'),
    )
    const lacksImpactAnalysis = !allMessages.some(
      (c) =>
        c.includes('impact') || c.includes('affects') || c.includes('dependencies'),
    )

    if (mentionsGodNodes && lacksImpactAnalysis) {
      suggestions.push({
        type: 'context_awareness',
        pattern: 'missing_impact_analysis',
        recommendation: 'Consider impact analysis when editing god nodes or critical symbols',
        confidence: 0.7,
        context: 'god node mentioned without impact consideration',
      })
    }

    return suggestions
  }
}
