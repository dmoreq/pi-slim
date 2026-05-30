/**
 * `/scope` — in-session pi-scope dashboard (stats + graph summary).
 */

import type { CommunityPruningPlugin } from '../plugins/community-pruning-plugin.js'
import type { SessionManager } from '../manager.js'

export function formatScopeDashboard(manager: SessionManager): string {
  const s = manager.state
  if (!s) {
    return 'pi-scope is not active for this session (no index loaded).'
  }

  const stats = s.stats
  const graph = manager.graphService.analysis
  const commPlugin = manager.pluginManager.getAll().find(
    (p): p is CommunityPruningPlugin => p.name === 'community-pruning'
  )
  const pruneStats = commPlugin?.getStats()

  const lines: string[] = [
    '┌──── pi-scope Session Dashboard ────────────────────────────┐',
    '│ 📇 INDEX                                                    │',
    `│   Source          : ${stats.indexSource === 'cache' ? 'Cached' : 'Fresh build'}`.padEnd(63) + '│',
    `│   Files           : ${String(stats.indexedFiles).padStart(6)}`.padEnd(63) + '│',
    `│   Symbols         : ${String(stats.symbolCount).padStart(6)}`.padEnd(63) + '│',
    `│   Dependencies    : ${String(stats.depEdges).padStart(6)}`.padEnd(63) + '│',
    `│   Dep depth       : ${String(s.config.dependencyDepth)} (slim.dependencyDepth 0–3)`.padEnd(63) + '│',
    '│ 📊 GRAPH ANALYSIS                                          │',
  ]

  if (graph) {
    lines.push(`│   Nodes / Edges   : ${graph.metrics.totalNodes} / ${graph.metrics.totalEdges}`.padEnd(63) + '│')
    lines.push(`│   God Nodes       : ${String(graph.godNodes.length).padStart(6)}`.padEnd(63) + '│')
    lines.push(`│   Communities     : ${String(graph.communities.length).padStart(6)}`.padEnd(63) + '│')
    lines.push(`│   Circular Deps   : ${String(graph.metrics.cycleCount).padStart(6)}`.padEnd(63) + '│')
    lines.push(`│   Bottlenecks     : ${String(graph.bottlenecks.length).padStart(6)}`.padEnd(63) + '│')
    lines.push(`│   Surprises       : ${String(graph.surprises.length).padStart(6)}`.padEnd(63) + '│')
  } else {
    lines.push('│   (no graph analysis loaded)                               │')
  }

  lines.push('│ 💉 CONTEXT INJECTION                                       │')
  lines.push(`│   Repo Map        : ~${stats.repoMapTokens}t (once)`.padEnd(63) + '│')
  lines.push(`│   Graph Insights  : ~${stats.graphInsightsTokens}t`.padEnd(63) + '│')
  lines.push(`│   Intelligence    : ~${stats.intelligenceTokens}t`.padEnd(63) + '│')
  lines.push(`│   Dep Context     : ${stats.depContextTriggers}x, ~${stats.depContextTotalTokens}t total`.padEnd(63) + '│')

  if (pruneStats && pruneStats.pruneCount > 0) {
    lines.push(
      `│   Community prune : ${pruneStats.pruneCount} msgs (${pruneStats.activeCommunityId ?? 'n/a'})`.padEnd(63) + '│'
    )
  }

  lines.push('│ 💰 TOKEN SAVINGS                                           │')
  if (stats.totalTokensSaved > 0) {
    lines.push(
      `│   Saved           : ~${stats.totalTokensSaved}t (${Math.round(stats.savingsRatio * 100)}% vs full reads)`.padEnd(63) +
        '│'
    )
  } else {
    lines.push('│   Saved           : (accumulates after dep-context injections)'.padEnd(63) + '│')
  }

  if (s.providerGuidanceFiles.length > 0) {
    lines.push('│ 📋 PROVIDER GUIDANCE                                       │')
    for (const f of s.providerGuidanceFiles.slice(0, 3)) {
      const short = f.path.split('/').slice(-2).join('/')
      lines.push(`│   - ${short}`.padEnd(63) + '│')
    }
  }

  lines.push('└────────────────────────────────────────────────────────────┘')
  return lines.join('\n')
}
