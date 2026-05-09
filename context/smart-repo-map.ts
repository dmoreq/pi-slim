/**
 * Graph-prioritized repository map: surfaces communities and high-impact symbols
 * before the static repo tree so agents route exploration efficiently.
 */

import type { ContextInsights } from '../shared/intelligence-types.js'
import type { GraphifyAnalysis, GodNode } from './graph-types.js'
import { godNodeMatchesSymbol } from './god-node-match.js'

export class SmartRepositoryMapGenerator {
  /**
   * Prefix the standard repo map with compact graph-driven navigation hints.
   */
  generatePrioritizedRepoMap(
    baseRepoMap: string,
    insights: ContextInsights,
    graphAnalysis: GraphifyAnalysis | null,
  ): string {
    if (!graphAnalysis || !baseRepoMap.trim()) {
      return baseRepoMap
    }

    const blocks: string[] = []

    const communities = this.pickCommunities(insights, graphAnalysis)
    if (communities.length > 0) {
      const lines = communities.map(
        (c) =>
          `- **${c.label}** (\`${c.id}\`, ${c.nodes.length} nodes) — start here when working in this domain`,
      )
      blocks.push(`📍 GRAPH-PRIORITIZED NAVIGATION\n${lines.join('\n')}`)
    }

    const gods = this.pickGodNodes(insights, graphAnalysis.godNodes)
    if (gods.length > 0) {
      const lines = gods.map(
        (g) =>
          `- \`${g.label}\` — ${g.criticality}, ${g.inDegree} inbound deps (community: ${g.community})`,
      )
      blocks.push(`🎯 FOCUS AREAS (graph impact)\n${lines.join('\n')}`)
    }

    if (blocks.length === 0) return baseRepoMap
    return `${blocks.join('\n\n')}\n\n---\n\n${baseRepoMap}`
  }

  private pickCommunities(insights: ContextInsights, graph: GraphifyAnalysis) {
    const mentionedLower = new Set(
      insights.conversationContext.mentionedCommunities.map((m) => m.toLowerCase()),
    )
    const symbolsLower = new Set(
      [...insights.editingIntent.targetSymbols, ...insights.navigationRequests.requestedSymbols].map(
        (s) => s.toLowerCase(),
      ),
    )

    const scored = graph.communities
      .map((c) => {
        let score = 0
        if (mentionedLower.has(c.id.toLowerCase())) score += 3
        if (c.nodes.some((n) => symbolsLower.has(n.toLowerCase()))) score += 2
        score += c.internalDensity
        return { c, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)

    return scored.map((x) => x.c)
  }

  private pickGodNodes(insights: ContextInsights, godNodes: GodNode[]): GodNode[] {
    const symbols = [
      ...insights.editingIntent.affectedGodNodes,
      ...insights.editingIntent.targetSymbols,
      ...insights.navigationRequests.requestedSymbols,
    ]

    if (symbols.length === 0) {
      return []
    }

    return godNodes
      .filter((g) => symbols.some((sym) => godNodeMatchesSymbol(g, sym)))
      .sort((a, b) => {
        const rank: Record<GodNode['criticality'], number> = {
          CRITICAL: 0,
          IMPORTANT: 1,
          NORMAL: 2,
        }
        return rank[a.criticality] - rank[b.criticality] || b.inDegree - a.inDegree
      })
      .slice(0, 6)
  }
}
