/**
 * Session-scoped usage statistics for the scope extension.
 *
 * Tracks every injection, computes token savings vs full file reads,
 * and persists a summary to stats.jsonl + state.json.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import type { GraphMetricsSummary } from './graph-metrics.js'
import { scopeDir } from '../shared/paths.js'
import { writeState } from '../shared/runtime-state.js'
import { PathUtils } from '../shared/utils/path-utils.js'
// ── Stored record ────────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId: string
  startedAt: string
  endedAt: string
  indexSource: 'cache' | 'fresh'
  indexedFiles: number
  symbolCount?: number
  depEdges: number
  repoMapTokens: number
  depContextTriggers: number
  depContextTotalTokens: number
  uniqueFilesInjected: number
  topFiles: { file: string; mentions: number }[]
  contextFilesTokens: number
  contextFilesCount: number
  providerGuidanceTokens: number
  providerGuidanceCount: number
  graphInsightsTokens: number
  intelligenceTokens: number
  smartDepContextTokens: number
  totalTokensSaved: number
  savingsRatio: number
  // ── Metadata (from StoredIndexV2) ──
  indexBuiltAt?: string
  indexAge?: number // hours
  indexStale?: boolean
  indexBuildTime?: number // milliseconds
  indexLoadTime?: number // milliseconds
  languages?: string[]
  godNodesCount?: number
  communityCount?: number
  circularDependencies?: number
  graphQualityScore?: number
  graphAnalysisMs?: number
  graphCacheHit?: boolean
  graphEstimatedSavings?: number
  sessionDurationMs?: number
  totalInjectionTokens?: number
  communityPruneCount?: number
  hashlineEdits?: number
  hashlineDryRuns?: number
  hashlineApplyEdits?: number
  builtinEditSteered?: number
  hashlineAnchorInjectTurns?: number
  hashlineMismatches?: number
}

// ── Live tracker ──────────────────────────────────────────────────────────

export class SessionStats {
  readonly sessionId: string
  readonly startedAt = Date.now()
  indexLoadStartedAt = Date.now()

  indexSource: 'cache' | 'fresh' = 'fresh'
  indexedFiles = 0
  symbolCount = 0
  depEdges = 0
  repoMapTokens = 0
  contextFilesTokens = 0
  contextFilesCount = 0
  providerGuidanceTokens = 0
  providerGuidanceCount = 0
  graphInsightsTokens = 0
  intelligenceTokens = 0
  smartDepContextTokens = 0
  depContextTriggers = 0
  depContextTotalTokens = 0
  totalTokensSaved = 0
  savingsRatio = 0

  // Metadata from StoredIndexV2
  indexBuiltAt?: string
  indexAge?: number
  indexBuildTime?: number
  indexLoadTime?: number
  languages: string[] = []
  godNodesCount?: number
  communityCount?: number
  circularDependencies?: number
  indexStale = false

  graphQualityScore?: number
  graphAnalysisMs?: number
  graphCacheHit?: boolean
  graphEstimatedSavings?: number
  communityPruneCount = 0
  hashlineEdits = 0
  hashlineDryRuns = 0
  hashlineApplyEdits = 0
  builtinEditSteered = 0
  hashlineAnchorInjectTurns = 0
  hashlineMismatches = 0

  private mentionCounts = new Map<string, number>()
  private injectedFiles = new Set<string>()

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  recordRepoMapInjection(tokens: number): void {
    this.repoMapTokens = tokens
  }

  recordDepContextInjection(paths: string[], tokens: number, fullFileTokens?: number): void {
    this.depContextTriggers++
    this.depContextTotalTokens += tokens
    if (fullFileTokens !== undefined && fullFileTokens > tokens) {
      this.totalTokensSaved += fullFileTokens - tokens
      this.savingsRatio =
        this.depContextTotalTokens > 0
          ? 1 - this.depContextTotalTokens / (this.depContextTotalTokens + this.totalTokensSaved)
          : 0
    }
    for (const f of paths) {
      if (!this.injectedFiles.has(f) || f.startsWith('/')) {
        this.injectedFiles.add(f)
        this.mentionCounts.set(f, (this.mentionCounts.get(f) ?? 0) + 1)
      }
    }
  }

  recordContextFilesInjection(tokens: number, count: number): void {
    this.contextFilesTokens = tokens
    this.contextFilesCount = count
  }

  recordProviderGuidanceInjection(tokens: number, count: number): void {
    this.providerGuidanceTokens = tokens
    this.providerGuidanceCount = count
  }

  recordGraphInsightsInjection(tokens: number): void {
    this.graphInsightsTokens += tokens
  }

  recordIntelligenceInjection(tokens: number): void {
    this.intelligenceTokens += tokens
  }

  recordSmartDepContextInjection(tokens: number): void {
    this.smartDepContextTokens += tokens
  }

  recordGraphMetrics(summary: GraphMetricsSummary): void {
    this.graphQualityScore = summary.quality.score
    this.graphAnalysisMs = summary.performance.analysisMs
    this.graphCacheHit = summary.performance.cacheHit
    this.graphEstimatedSavings = summary.token.estimatedSavings
  }

  recordCommunityPrune(count: number): void {
    this.communityPruneCount = count
  }

  recordHashlineEdit(dryRun: boolean): void {
    this.hashlineEdits++
    if (dryRun) this.hashlineDryRuns++
    else this.hashlineApplyEdits++
  }

  recordBuiltinEditSteered(): void {
    this.builtinEditSteered++
  }

  recordHashlineAnchorInjectTurn(): void {
    this.hashlineAnchorInjectTurns++
  }

  recordHashlineMismatch(): void {
    this.hashlineMismatches++
  }

  get uniqueFilesInjected(): number {
    return this.injectedFiles.size
  }

  getTopFiles(limit = 5): { file: string; mentions: number }[] {
    return [...this.mentionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file, mentions]) => ({ file, mentions }))
  }

  totalInjectionTokens(): number {
    return (
      this.repoMapTokens +
      this.graphInsightsTokens +
      this.intelligenceTokens +
      this.smartDepContextTokens +
      this.depContextTotalTokens +
      this.contextFilesTokens +
      this.providerGuidanceTokens
    )
  }

  sessionDurationMs(): number {
    return Date.now() - this.startedAt
  }

  recordIndexLoaded(metadata?: any): void {
    this.indexLoadTime = Date.now() - this.indexLoadStartedAt
    if (metadata) {
      this.indexBuiltAt = metadata.builtAt
      this.indexBuildTime = metadata.buildDuration
      this.symbolCount = metadata.symbolCount || 0
      this.languages = metadata.languages || []
      this.godNodesCount = metadata.godNodes?.length
      this.communityCount = metadata.communities
      this.circularDependencies = metadata.circularDependencies
    }
  }

  recordIndexAge(ageHours: number, stale: boolean): void {
    this.indexAge = ageHours
    this.indexStale = stale
  }

  summary(): string {
    const parts: string[] = [
      `index: ${this.indexedFiles} files (${this.indexSource})`,
      `repo-map: ~${this.repoMapTokens}t`,
      `dep-context: ${this.depContextTriggers}x, ~${this.depContextTotalTokens}t`,
    ]
    if (this.contextFilesCount > 0) parts.push(`ctx-files: ${this.contextFilesCount}`)
    if (this.providerGuidanceCount > 0) parts.push(`guidance: ${this.providerGuidanceCount}`)
    if (this.totalTokensSaved > 0)
      parts.push(`saved ~${this.totalTokensSaved}t (${Math.round(this.savingsRatio * 100)}%)`)
    parts.push(`unique: ${this.injectedFiles.size}`)
    if (this.mentionCounts.size > 0) {
      const top = [...this.mentionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([f, n]) => `${shorten(f)}\u00d7${n}`)
        .join(', ')
      parts.push(`top: ${top}`)
    }
    return parts.join('  |  ')
  }

  report(): string {
    const lines: string[] = ['── pi-scope session stats ───────────────────────────']
    lines.push(`  Index source     : ${this.indexSource}`)
    lines.push(`  Files indexed    : ${this.indexedFiles}`)
    lines.push(`  Dep edges        : ${this.depEdges}`)
    lines.push(`  Repo map         : ~${this.repoMapTokens}t (once)`)
    lines.push(`  Dep-context      : ${this.depContextTriggers}x, ~${this.depContextTotalTokens}t total`)
    if (this.contextFilesCount > 0)
      lines.push(`  Context files    : ${this.contextFilesCount}, ~${this.contextFilesTokens}t (once)`)
    if (this.providerGuidanceCount > 0)
      lines.push(`  Provider guidance: ${this.providerGuidanceCount}, ~${this.providerGuidanceTokens}t (once)`)
    if (this.graphInsightsTokens > 0) lines.push(`  Graph insights    : ~${this.graphInsightsTokens}t`)
    if (this.intelligenceTokens > 0) lines.push(`  Intelligence      : ~${this.intelligenceTokens}t`)
    if (this.smartDepContextTokens > 0) lines.push(`  Smart dep context : ~${this.smartDepContextTokens}t`)
    if (this.graphQualityScore !== undefined) {
      lines.push(`  Graph quality     : ${this.graphQualityScore}/100`)
    }
    if (this.totalTokensSaved > 0) {
      lines.push(
        `  Token savings    : ~${this.totalTokensSaved}t (${Math.round(this.savingsRatio * 100)}% vs full reads)`
      )
    }
    lines.push(`  Unique files seen: ${this.injectedFiles.size}`)
    if (this.mentionCounts.size > 0) {
      lines.push('')
      lines.push('  Most-mentioned files:')
      for (const [f, n] of [...this.mentionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        lines.push(`    ${n}\u00d7  ${shorten(f)}`)
      }
    }
    lines.push('─────────────────────────────────────────────────')
    return lines.join('\n')
  }

  toRecord(): SessionRecord {
    const topFiles = this.getTopFiles(5)
    return {
      sessionId: this.sessionId,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      indexSource: this.indexSource,
      indexedFiles: this.indexedFiles,
      symbolCount: this.symbolCount,
      depEdges: this.depEdges,
      repoMapTokens: this.repoMapTokens,
      depContextTriggers: this.depContextTriggers,
      depContextTotalTokens: this.depContextTotalTokens,
      uniqueFilesInjected: this.injectedFiles.size,
      topFiles,
      contextFilesTokens: this.contextFilesTokens,
      contextFilesCount: this.contextFilesCount,
      providerGuidanceTokens: this.providerGuidanceTokens,
      providerGuidanceCount: this.providerGuidanceCount,
      graphInsightsTokens: this.graphInsightsTokens,
      intelligenceTokens: this.intelligenceTokens,
      smartDepContextTokens: this.smartDepContextTokens,
      totalTokensSaved: this.totalTokensSaved,
      savingsRatio: Math.round(this.savingsRatio * 100) / 100,
      indexBuiltAt: this.indexBuiltAt,
      indexAge: this.indexAge,
      indexStale: this.indexStale,
      indexBuildTime: this.indexBuildTime,
      indexLoadTime: this.indexLoadTime,
      languages: this.languages,
      godNodesCount: this.godNodesCount,
      communityCount: this.communityCount,
      circularDependencies: this.circularDependencies,
      graphQualityScore: this.graphQualityScore,
      graphAnalysisMs: this.graphAnalysisMs,
      graphCacheHit: this.graphCacheHit,
      graphEstimatedSavings: this.graphEstimatedSavings,
      sessionDurationMs: this.sessionDurationMs(),
      totalInjectionTokens: this.totalInjectionTokens(),
      communityPruneCount: this.communityPruneCount > 0 ? this.communityPruneCount : undefined,
      hashlineEdits: this.hashlineEdits > 0 ? this.hashlineEdits : undefined,
      hashlineDryRuns: this.hashlineDryRuns > 0 ? this.hashlineDryRuns : undefined,
      hashlineApplyEdits: this.hashlineApplyEdits > 0 ? this.hashlineApplyEdits : undefined,
      builtinEditSteered: this.builtinEditSteered > 0 ? this.builtinEditSteered : undefined,
      hashlineAnchorInjectTurns:
        this.hashlineAnchorInjectTurns > 0 ? this.hashlineAnchorInjectTurns : undefined,
      hashlineMismatches: this.hashlineMismatches > 0 ? this.hashlineMismatches : undefined,
    }
  }

  async persist(projectRoot: string): Promise<void> {
    const dir = scopeDir(projectRoot)
    await mkdir(dir, { recursive: true })
    const record = this.toRecord()
    const line = `${JSON.stringify(record)}\n`
    await appendFile(PathUtils.joinSafe(dir, 'stats.jsonl'), line, 'utf-8')
    await writeState(projectRoot, { lastSession: record as unknown as Record<string, unknown> })
  }
}

function shorten(p: string): string {
  return p.split('/').slice(-2).join('/')
}
