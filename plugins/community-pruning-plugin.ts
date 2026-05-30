/**
 * CommunityPruningPlugin — filter injected context by community membership.
 *
 * When graph analysis is available and multiple communities exist, this plugin:
 *   1. Detects the "active" community from file references in recent user messages.
 *   2. Prunes older `developer`-role context messages that reference no nodes
 *      from the active community — they are stale cross-community noise.
 *
 * The most-recent developer message is always preserved so fresh context
 * is never removed.
 *
 * Relationship to the rest of the community-filtering stack:
 *   - SmartRepositoryMapGenerator.pickCommunities()        — filters repo-map at build time
 *   - SmartDependencyContextGenerator.buildCommunityContext() — filters dep-context at build time
 *   - CommunityPruningPlugin (this)                        — prunes *older* injections in
 *                                                            the live conversation history
 */

import { getTelemetry } from 'pi-telemetry'
import type { CommunityAnalysis, GraphAnalysis } from '../context/graph-types.js'
import type { GraphService } from '../services/graph-service.js'
import type { Plugin } from './plugin.js'

export class CommunityPruningPlugin implements Plugin {
  readonly name = 'community-pruning'
  readonly version = '1.0.0'

  private readonly graphService: GraphService
  private _activeCommunityId: string | null = null
  private _pruneCount = 0
  private _processedTurns = 0

  constructor(graphService: GraphService) {
    this.graphService = graphService
  }

  // ── Public accessors ───────────────────────────────────────────────

  /** The community id identified as currently active (last processed turn). */
  get activeCommunityId(): string | null {
    return this._activeCommunityId
  }

  /** Pruning counters for diagnostics / telemetry. */
  getStats(): { pruneCount: number; processedTurns: number; activeCommunityId: string | null } {
    return {
      pruneCount: this._pruneCount,
      processedTurns: this._processedTurns,
      activeCommunityId: this._activeCommunityId,
    }
  }

  // ── Plugin hooks ───────────────────────────────────────────────────

  async onSessionStart(): Promise<void> {
    this._activeCommunityId = null
    this._pruneCount = 0
    this._processedTurns = 0
  }

  async onContext(messages: Record<string, unknown>[]): Promise<void> {
    const analysis = this.graphService.analysis

    // Skip: no analysis, trivially single-community graph, or too few messages to prune
    if (!analysis || analysis.communities.length < 2 || messages.length < 3) return

    this._processedTurns++

    // Build node-id → community-id lookup
    const nodeToComm = new Map<string, string>()
    for (const c of analysis.communities) {
      for (const n of c.nodes) nodeToComm.set(n, c.id)
    }

    // Identify which community the conversation is currently focused on
    const userMessages = messages.filter(m => m.role === 'user').slice(-3)
    const activeCommunity = this.detectActiveCommunity(userMessages, analysis, nodeToComm)
    this._activeCommunityId = activeCommunity?.id ?? null

    if (!activeCommunity) return

    const communityNodes = new Set(activeCommunity.nodes)

    // Locate the last developer-injected message (always preserved)
    let lastDevIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'developer') {
        lastDevIdx = i
        break
      }
    }

    let prunedThisTurn = 0

    // Walk forward and prune developer messages with no community-relevant content
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role !== 'developer') continue
      if (i === lastDevIdx) continue // always keep the freshest injection

      const text = typeof messages[i].content === 'string' ? (messages[i].content as string) : ''
      if (text.trim() === '') continue

      if (!this.hasAnyNodeFromCommunity(text, communityNodes)) {
        messages.splice(i, 1)
        i--
        // Shift the preserved-index down by one since we removed a prior element
        if (lastDevIdx > i) lastDevIdx--
        this._pruneCount++
        prunedThisTurn++
      }
    }

    if (prunedThisTurn > 0) {
      try {
        getTelemetry()?.notify(
          `Community pruning: removed ${prunedThisTurn} off-community injection(s) (active: ${activeCommunity.label})`,
          {
            severity: 'info' as any,
            badge: { text: 'comm prune', variant: 'info' as any },
          }
        )
      } catch {
        // pi-telemetry optional
      }
    }
  }

  async onSessionShutdown(): Promise<void> {
    if (this._pruneCount > 0) {
      console.error(
        `[community-pruning] Session summary: ${this._pruneCount} context messages pruned over ${this._processedTurns} turns`
      )
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Vote on which community is currently active based on file/symbol references
   * found in the last three user messages.
   *
   * Node IDs from `repoIndexToCodeGraph` are in the form:
   *   `file:relative/path/to/file.ts`          (module nodes)
   *   `file:relative/path/to/file.ts:SymName`  (symbol nodes)
   *
   * We extract the path segment and match it against tokens in the message text.
   */
  private detectActiveCommunity(
    userMessages: Record<string, unknown>[],
    analysis: GraphAnalysis,
    nodeToComm: Map<string, string>
  ): CommunityAnalysis | null {
    const votes = new Map<string, number>()

    for (const msg of userMessages) {
      const text = typeof msg.content === 'string' ? (msg.content as string) : ''
      if (!text) continue

      // Match bare file names and relative paths (e.g. "auth.ts", "src/auth.ts")
      const fileMatches = text.matchAll(/[\w./\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go)/g)
      const mentionedFiles = new Set<string>([...fileMatches].map(m => m[0]))

      for (const [nodeId, commId] of nodeToComm) {
        // Extract path part from "file:path/to/file.ts" or "file:path:Symbol"
        const colonIdx = nodeId.indexOf(':')
        if (colonIdx < 0) continue
        const pathPart = nodeId.slice(colonIdx + 1).split(':')[0] // strip symbol suffix
        const basename = pathPart.split('/').pop() ?? pathPart

        for (const mention of mentionedFiles) {
          if (
            pathPart === mention ||
            pathPart.endsWith(`/${mention}`) ||
            basename === mention ||
            mention.endsWith(`/${basename}`)
          ) {
            votes.set(commId, (votes.get(commId) ?? 0) + 1)
          }
        }
      }
    }

    if (votes.size === 0) return null

    const [topCommId] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    return analysis.communities.find(c => c.id === topCommId) ?? null
  }

  /**
   * Return true if `text` mentions at least one node from `communityNodes`.
   * Uses both the full node-id path and the basename for matching.
   */
  private hasAnyNodeFromCommunity(text: string, communityNodes: Set<string>): boolean {
    for (const nodeId of communityNodes) {
      const colonIdx = nodeId.indexOf(':')
      if (colonIdx < 0) continue
      const pathPart = nodeId.slice(colonIdx + 1).split(':')[0]
      const basename = pathPart.split('/').pop() ?? pathPart

      if (basename.length > 3 && (text.includes(pathPart) || text.includes(basename))) {
        return true
      }
    }
    return false
  }
}
