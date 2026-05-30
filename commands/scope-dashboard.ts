/**
 * `/scope` — in-session pi-scope dashboard (stats + graph summary).
 * `/scope history` — recent sessions from stats.jsonl.
 */

import { buildInjectionBreakdown } from '../metrics/injection-breakdown.js'
import { readRecentSessions, summarizeTrend } from '../metrics/stats-reader.js'
import type { CommunityPruningPlugin } from '../plugins/community-pruning-plugin.js'
import type { SessionManager } from '../manager.js'

function padLine(content: string, width = 63): string {
  return `│ ${content}`.padEnd(width) + '│'
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function formatScopeDashboard(manager: SessionManager): string {
  const s = manager.state
  if (!s) {
    return 'pi-scope is not active for this session (no index loaded).'
  }

  const stats = s.stats
  const graph = manager.graphService.analysis
  const gm = s.graphMetrics
  const commPlugin = manager.pluginManager.getAll().find(
    (p): p is CommunityPruningPlugin => p.name === 'community-pruning'
  )
  const pruneStats = commPlugin?.getStats()

  const lines: string[] = [
    '┌──── pi-scope Session Dashboard ────────────────────────────┐',
    padLine('📇 INDEX'),
    padLine(`  Source          : ${stats.indexSource === 'cache' ? 'Cached' : 'Fresh build'}`),
    padLine(`  Files           : ${String(stats.indexedFiles).padStart(6)}`),
    padLine(`  Symbols         : ${String(stats.symbolCount).padStart(6)}`),
    padLine(`  Dependencies    : ${String(stats.depEdges).padStart(6)}`),
    padLine(`  Dep depth       : ${String(s.config.dependencyDepth)} (slim.dependencyDepth 0–3)`),
    padLine('⏱️  SESSION'),
    padLine(`  Duration        : ${formatDuration(stats.sessionDurationMs())}`),
    padLine(`  Index load      : ${stats.indexLoadTime != null ? `${stats.indexLoadTime}ms` : 'n/a'}`),
    padLine(`  Index stale     : ${stats.indexStale ? 'yes' : 'no'}`),
    padLine('📊 GRAPH ANALYSIS'),
  ]

  if (graph) {
    lines.push(padLine(`  Nodes / Edges   : ${graph.metrics.totalNodes} / ${graph.metrics.totalEdges}`))
    lines.push(padLine(`  God Nodes       : ${String(graph.godNodes.length).padStart(6)}`))
    lines.push(padLine(`  Communities     : ${String(graph.communities.length).padStart(6)}`))
    lines.push(padLine(`  Circular Deps   : ${String(graph.metrics.cycleCount).padStart(6)}`))
    lines.push(padLine(`  Bottlenecks     : ${String(graph.bottlenecks.length).padStart(6)}`))
    lines.push(padLine(`  Surprises       : ${String(graph.surprises.length).padStart(6)}`))
  } else {
    lines.push(padLine('  (no graph analysis loaded)'))
  }

  if (gm) {
    lines.push(padLine('📈 GRAPH QUALITY'))
    lines.push(padLine(`  Score           : ${gm.quality.score}/100`))
    lines.push(
      padLine(
        `  Analysis        : ${gm.performance.cacheHit ? 'cache hit' : `${gm.performance.analysisMs}ms fresh`}`
      )
    )
    if (gm.quality.cycleCount > 0) {
      lines.push(padLine(`  Cycles          : ${gm.quality.cycleCount}`))
    }
    lines.push(padLine(`  Est. savings    : ~${gm.token.estimatedSavings}t (community filter heuristic)`))
  }

  lines.push(padLine('💉 CONTEXT INJECTION'))
  lines.push(padLine(`  Repo Map        : ~${stats.repoMapTokens}t (once)`))
  lines.push(padLine(`  Graph Insights  : ~${stats.graphInsightsTokens}t`))
  lines.push(padLine(`  Intelligence    : ~${stats.intelligenceTokens}t`))
  lines.push(padLine(`  Smart Dep Ctx   : ~${stats.smartDepContextTokens}t`))
  lines.push(padLine(`  Dep Context     : ${stats.depContextTriggers}x, ~${stats.depContextTotalTokens}t total`))
  lines.push(padLine(`  Total injected  : ~${stats.totalInjectionTokens()}t`))

  const breakdown = buildInjectionBreakdown([
    { label: 'repo-map', tokens: stats.repoMapTokens },
    { label: 'graph', tokens: stats.graphInsightsTokens },
    { label: 'intelligence', tokens: stats.intelligenceTokens },
    { label: 'smart-dep', tokens: stats.smartDepContextTokens },
    { label: 'dep-context', tokens: stats.depContextTotalTokens },
  ])
  if (breakdown.length > 0) {
    lines.push(padLine('  Breakdown       : ' + breakdown.map(b => `${b.label} ${b.percent}%`).join(' · ')))
  }

  if (pruneStats && pruneStats.pruneCount > 0) {
    lines.push(padLine(`  Community prune : ${pruneStats.pruneCount} msgs (${pruneStats.activeCommunityId ?? 'n/a'})`))
  }

  const lspTotal =
    stats.lspGoToDef +
    stats.lspFindRefs +
    stats.lspHover +
    stats.lspWorkspaceSymbol +
    stats.lspDocumentSymbol +
    stats.lspImplementation +
    stats.lspBatchGotoDef
  if (lspTotal > 0 || stats.lspErrors > 0) {
    lines.push(padLine('🧭 LSP'))
    if (stats.lspGoToDef > 0) lines.push(padLine(`  go_to_definition : ${stats.lspGoToDef}`))
    if (stats.lspFindRefs > 0) lines.push(padLine(`  find_references  : ${stats.lspFindRefs}`))
    if (stats.lspHover > 0) lines.push(padLine(`  hover            : ${stats.lspHover}`))
    if (stats.lspWorkspaceSymbol > 0) lines.push(padLine(`  workspace_symbol : ${stats.lspWorkspaceSymbol}`))
    if (stats.lspDocumentSymbol > 0) lines.push(padLine(`  document_symbol  : ${stats.lspDocumentSymbol}`))
    if (stats.lspImplementation > 0) lines.push(padLine(`  implementation   : ${stats.lspImplementation}`))
    if (stats.lspBatchGotoDef > 0) lines.push(padLine(`  batch goto-def   : ${stats.lspBatchGotoDef}`))
    if (stats.lspErrors > 0) {
      lines.push(padLine(`  errors           : ${stats.lspErrors}`))
      if (stats.lspLastError) lines.push(padLine(`  last error       : ${stats.lspLastError}`))
    }
  }

  const lspHealth = manager.lspServerHealth
  if (lspHealth && lspHealth.length > 0) {
    const available = lspHealth.filter(h => h.available).map(h => h.id).join(', ')
    const missing = lspHealth.filter(h => !h.available).map(h => h.id).join(', ')
    if (available) lines.push(padLine(`  servers (ok)     : ${available}`))
    if (missing) lines.push(padLine(`  servers (miss)   : ${missing}`))
  }

  if (stats.hashlineEdits > 0 || stats.hashlineAnchorInjectTurns > 0 || stats.builtinEditSteered > 0) {
    lines.push(padLine('🔗 HASHLINE'))
    lines.push(padLine(`  hashline_edit    : ${stats.hashlineEdits} (${stats.hashlineDryRuns} dry_run)`))
    lines.push(padLine(`  apply (no dry)   : ${stats.hashlineApplyEdits}`))
    lines.push(padLine(`  anchor turns     : ${stats.hashlineAnchorInjectTurns}`))
    lines.push(padLine(`  builtin steered  : ${stats.builtinEditSteered}`))
    if (stats.hashlineMismatches > 0) {
      lines.push(padLine(`  mismatches       : ${stats.hashlineMismatches}`))
    }
  }

  lines.push(padLine('💰 TOKEN SAVINGS'))
  if (stats.totalTokensSaved > 0) {
    lines.push(
      padLine(`  Saved           : ~${stats.totalTokensSaved}t (${Math.round(stats.savingsRatio * 100)}% vs full reads)`)
    )
  } else {
    lines.push(padLine('  Saved           : (accumulates after dep-context injections)'))
  }

  const topFiles = stats.getTopFiles(5)
  if (topFiles.length > 0) {
    lines.push(padLine('📁 TOP FILES (dep-context)'))
    for (const { file, mentions } of topFiles) {
      const short = file.split('/').slice(-2).join('/')
      lines.push(padLine(`  ${mentions}×  ${short}`))
    }
  }

  if (s.providerGuidanceFiles.length > 0) {
    lines.push(padLine('📋 PROVIDER GUIDANCE'))
    for (const f of s.providerGuidanceFiles.slice(0, 3)) {
      const short = f.path.split('/').slice(-2).join('/')
      lines.push(padLine(`  - ${short}`))
    }
  }

  lines.push('└────────────────────────────────────────────────────────────┘')
  lines.push('')
  lines.push('Tip: `/scope history` for recent session trends.')
  return lines.join('\n')
}

export async function formatScopeHistory(manager: SessionManager, limit?: number): Promise<string> {
  const s = manager.state
  const projectRoot = s?.projectRoot
  if (!projectRoot) {
    return 'pi-scope is not active — no project root for history.'
  }

  const cfgLimit = s?.config.metrics.historyLimit ?? 5
  const n = limit ?? cfgLimit
  const sessions = await readRecentSessions(projectRoot, n)

  if (sessions.length === 0) {
    return 'No session history in .pi/pi-scope/stats.jsonl yet (records appear after session shutdown).'
  }

  const trend = summarizeTrend(sessions)
  const lines: string[] = [
    '┌──── pi-scope Session History ──────────────────────────────┐',
    padLine(`Last ${sessions.length} session(s) · averages below`),
    padLine(
      `  Avg savings     : ~${trend.averages.totalTokensSaved}t (${Math.round(trend.averages.savingsRatio * 100)}%)`
    ),
    padLine(`  Avg dep-context : ${trend.averages.depContextTriggers}x`),
    padLine(`  Avg injected    : ~${trend.averages.totalInjectionTokens}t`),
    padLine(''),
  ]

  for (const rec of sessions) {
    const started = rec.startedAt.slice(0, 16).replace('T', ' ')
    const dur = rec.sessionDurationMs != null ? formatDuration(rec.sessionDurationMs) : '?'
    const quality = rec.graphQualityScore != null ? ` · Q${rec.graphQualityScore}` : ''
    lines.push(
      padLine(
        `  ${started} · ${rec.indexedFiles} files · saved ~${rec.totalTokensSaved}t · ${rec.depContextTriggers} inj · ${dur}${quality}`
      )
    )
  }

  lines.push('└────────────────────────────────────────────────────────────┘')
  return lines.join('\n')
}

/** Route `/scope` with optional `history` argument. */
export async function formatScopeCommand(manager: SessionManager, args?: string): Promise<string> {
  const trimmed = (args ?? '').trim().toLowerCase()
  if (trimmed === 'history' || trimmed.startsWith('history ')) {
    const parts = trimmed.split(/\s+/)
    const limit = parts[1] ? parseInt(parts[1], 10) : undefined
    return formatScopeHistory(manager, Number.isFinite(limit) ? limit : undefined)
  }
  return formatScopeDashboard(manager)
}
