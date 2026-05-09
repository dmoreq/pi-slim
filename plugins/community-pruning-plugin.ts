/**
 * Community Pruning Plugin
 *
 * Filters context messages by community membership to keep injections focused.
 * When the user asks about a specific module/community, this plugin:
 *   1. Identifies which community the query relates to
 *   2. Removes context from unrelated communities
 *   3. Preserves interface nodes (cross-community bridges)
 *
 * Satisfies OCP: Registered via pluginManager, not hard-coded in SessionManager.
 * Integrates with GraphifyAnalysis for community data.
 */

import type { Plugin } from './plugin.js'
import type { ExtensionContext } from '../extension.js'
import type { GraphifyAnalysis, CommunityAnalysis } from '../context/graph-types.js'

// ── Options ────────────────────────────────────────────────────────────────

export interface CommunityPruningOptions {
  /** Enable community-based pruning */
  enabled: boolean
  /** Maximum communities to keep context for */
  maxCommunities: number
  /** Whether to always preserve interface nodes */
  preserveInterfaceNodes: boolean
  /** Threshold for community relevance (0-1) */
  relevanceThreshold: number
}

export const DEFAULT_COMMUNITY_PRUNING_OPTIONS: CommunityPruningOptions = {
  enabled: true,
  maxCommunities: 2,
  preserveInterfaceNodes: true,
  relevanceThreshold: 0.3,
}

// ── Plugin ─────────────────────────────────────────────────────────────────

export class CommunityPruningPlugin implements Plugin {
  readonly name = 'community-pruning'
  readonly version = '1.0.0'

  private options: CommunityPruningOptions
  private analysis: GraphifyAnalysis | null = null
  private communityKeywordMap: Map<string, string[]> = new Map()

  constructor(options?: Partial<CommunityPruningOptions>) {
    this.options = { ...DEFAULT_COMMUNITY_PRUNING_OPTIONS, ...options }
  }

  /**
   * Update the graph analysis data.
   * Called externally when analysis is computed or loaded.
   */
  setAnalysis(analysis: GraphifyAnalysis | null): void {
    this.analysis = analysis
    this.buildKeywordMap()
  }

  /**
   * Build a map of community labels → keywords for relevance matching.
   */
  private buildKeywordMap(): void {
    this.communityKeywordMap.clear()
    if (!this.analysis) return

    for (const community of this.analysis.communities) {
      const keywords: string[] = []

      // Extract keywords from community label
      keywords.push(...community.label.toLowerCase().split(/\s+/))

      // Extract keywords from node names
      for (const node of community.nodes) {
        const parts = node
          .toLowerCase()
          .replace(/[^a-z0-9_/]/g, ' ')
          .split(/[/\s_]+/)
        keywords.push(...parts.filter(p => p.length > 2))
      }

      // Remove duplicates
      this.communityKeywordMap.set(community.id, [...new Set(keywords)])
    }
  }

  // ── Hooks ───────────────────────────────────────────────────────────

  /**
   * On session start, load options from config if available.
   */
  async onSessionStart(ctx: ExtensionContext): Promise<void> {
    // Options can be overridden via context
    this.buildKeywordMap()
  }

  /**
   * On each turn, prune messages from unrelated communities.
   */
  async onContext(messages: Record<string, unknown>[]): Promise<void> {
    if (!this.options.enabled || !this.analysis || messages.length === 0) {
      return
    }

    // Extract the latest user message
    const latestMessage = this.findLatestUserMessage(messages)
    if (!latestMessage) return

    const query = typeof latestMessage.content === 'string'
      ? latestMessage.content
      : JSON.stringify(latestMessage.content)

    // Score each community for relevance
    const relevantCommunities = this.scoreCommunitiesForQuery(query)

    if (relevantCommunities.length === 0) {
      return // No relevant communities found, keep all context
    }

    // Get node IDs in relevant communities
    const relevantNodes = new Set<string>()
    const interfaceNodes = new Set<string>()

    for (const { community } of relevantCommunities) {
      for (const node of community.nodes) {
        relevantNodes.add(node)
      }
      if (this.options.preserveInterfaceNodes) {
        for (const node of community.interfaceNodes) {
          interfaceNodes.add(node)
        }
      }
    }

    // Prune: mark non-relevant content as trimmed (but don't fully remove)
    // We do this by annotating the messages rather than deleting,
    // so the agent still has partial context
    for (const msg of messages) {
      if (msg.role === 'developer' && typeof msg.content === 'string') {
        // Check if this message contains graph context from unrelated communities
        if (this.containsNonRelevantContent(msg.content, relevantNodes, interfaceNodes)) {
          // Keep the message but trim non-relevant sections
          msg.content = this.trimToRelevantContent(
            msg.content,
            relevantNodes,
            interfaceNodes
          )
        }
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  /**
   * Find the latest user message in the conversation.
   */
  private findLatestUserMessage(
    messages: Record<string, unknown>[]
  ): Record<string, unknown> | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i]
      }
    }
    return null
  }

  /**
   * Score communities for relevance to a query.
   */
  private scoreCommunitiesForQuery(
    query: string
  ): Array<{ community: CommunityAnalysis; score: number }> {
    const queryLower = query.toLowerCase()
    const queryTokens = new Set(
      queryLower
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2)
    )

    const scores: Array<{ community: CommunityAnalysis; score: number }> = []

    for (const community of this.analysis!.communities) {
      const keywords = this.communityKeywordMap.get(community.id) ?? []
      let matchCount = 0

      for (const token of queryTokens) {
        for (const keyword of keywords) {
          if (keyword.includes(token) || token.includes(keyword)) {
            matchCount++
            break
          }
        }
      }

      const score = keywords.length > 0
        ? matchCount / Math.max(queryTokens.size, 1)
        : 0

      if (score >= this.options.relevanceThreshold) {
        scores.push({ community, score })
      }
    }

    // Sort by relevance score descending
    scores.sort((a, b) => b.score - a.score)

    // Limit to max communities
    return scores.slice(0, this.options.maxCommunities)
  }

  /**
   * Check if message content includes non-relevant community context.
   */
  private containsNonRelevantContent(
    content: string,
    _relevantNodes: Set<string>,
    _interfaceNodes: Set<string>
  ): boolean {
    // Look for community-related markers
    const communityPatterns = [
      /Community \d+/gi,
      /community-/gi,
      /module group/i,
    ]

    for (const pattern of communityPatterns) {
      if (pattern.test(content)) {
        return true
      }
    }

    return false
  }

  /**
   * Trim non-relevant sections from content, keeping relevant and interface nodes.
   */
  private trimToRelevantContent(
    content: string,
    relevantNodes: Set<string>,
    interfaceNodes: Set<string>
  ): string {
    const lines = content.split('\n')
    const trimmedLines: string[] = []
    let inCommunitySection = false
    let keepSection = false

    for (const line of lines) {
      // Detect community section boundaries
      const communityMatch = line.match(/^(?:#+\s*)?Community\s+(\d+)/i)

      if (communityMatch) {
        inCommunitySection = true
        // Check if this specific community is relevant
        // We keep it if we don't have specific info to filter
        keepSection = true
        trimmedLines.push(line)
        continue
      }

      // Check for graph context markers
      if (line.includes('Graph Analysis') || line.includes('god node')) {
        keepSection = true
        trimmedLines.push(line)
        continue
      }

      if (inCommunitySection && line.trim() === '') {
        inCommunitySection = false
        if (keepSection) {
          trimmedLines.push(line)
        }
        keepSection = true // Reset for next section
        continue
      }

      // Check if line references a relevant node
      if (relevantNodes.size > 0 || interfaceNodes.size > 0) {
        const containsRelevant = this.lineReferencesNodes(line, relevantNodes, interfaceNodes)
        if (containsRelevant) {
          trimmedLines.push(line)
          continue
        }
        if (inCommunitySection && keepSection) {
          trimmedLines.push(line)
          continue
        }
      } else {
        trimmedLines.push(line)
      }
    }

    return trimmedLines.join('\n')
  }

  /**
   * Check if a line references any relevant or interface nodes.
   */
  private lineReferencesNodes(
    line: string,
    relevantNodes: Set<string>,
    interfaceNodes: Set<string>
  ): boolean {
    const lineLower = line.toLowerCase()

    for (const node of relevantNodes) {
      if (lineLower.includes(node.toLowerCase())) {
        return true
      }
    }

    for (const node of interfaceNodes) {
      if (lineLower.includes(node.toLowerCase())) {
        return true
      }
    }

    return false
  }
}
