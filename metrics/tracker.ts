/**
 * Session-scoped usage statistics for the slim extension.
 *
 * Tracks every injection, computes token savings vs full file reads,
 * and persists a summary to stats.jsonl + state.json.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { slimDir } from '../shared/paths.js'
import { writeState } from '../shared/runtime-state.js'

// ── Stored record ────────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId: string
  startedAt: string
  endedAt: string
  indexSource: 'cache' | 'fresh'
  indexedFiles: number
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
  totalTokensSaved: number
  savingsRatio: number
}

// ── Live tracker ──────────────────────────────────────────────────────────

export class SessionStats {
  readonly sessionId: string
  readonly startedAt = Date.now()

  indexSource: 'cache' | 'fresh' = 'fresh'
  indexedFiles = 0
  depEdges = 0
  repoMapTokens = 0
  contextFilesTokens = 0
  contextFilesCount = 0
  providerGuidanceTokens = 0
  providerGuidanceCount = 0
  depContextTriggers = 0
  depContextTotalTokens = 0
  totalTokensSaved = 0
  savingsRatio = 0

  private mentionCounts = new Map<string, number>()
  private injectedFiles = new Set<string>()

  constructor(sessionId: string) { this.sessionId = sessionId }

  recordRepoMapInjection(tokens: number): void { this.repoMapTokens = tokens }

  recordDepContextInjection(paths: string[], tokens: number, fullFileTokens?: number): void {
    this.depContextTriggers++
    this.depContextTotalTokens += tokens
    if (fullFileTokens !== undefined && fullFileTokens > tokens) {
      this.totalTokensSaved += fullFileTokens - tokens
      this.savingsRatio = this.depContextTotalTokens > 0
        ? 1 - (this.depContextTotalTokens / (this.depContextTotalTokens + this.totalTokensSaved))
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
    this.contextFilesTokens = tokens; this.contextFilesCount = count
  }

  recordProviderGuidanceInjection(tokens: number, count: number): void {
    this.providerGuidanceTokens = tokens; this.providerGuidanceCount = count
  }

  summary(): string {
    const parts: string[] = [
      `index: ${this.indexedFiles} files (${this.indexSource})`,
      `repo-map: ~${this.repoMapTokens}t`,
      `dep-context: ${this.depContextTriggers}x, ~${this.depContextTotalTokens}t`,
    ]
    if (this.contextFilesCount > 0) parts.push(`ctx-files: ${this.contextFilesCount}`)
    if (this.providerGuidanceCount > 0) parts.push(`guidance: ${this.providerGuidanceCount}`)
    if (this.totalTokensSaved > 0) parts.push(`saved ~${this.totalTokensSaved}t (${Math.round(this.savingsRatio * 100)}%)`)
    parts.push(`unique: ${this.injectedFiles.size}`)
    if (this.mentionCounts.size > 0) {
      const top = [...this.mentionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([f, n]) => `${shorten(f)}\u00d7${n}`).join(', ')
      parts.push(`top: ${top}`)
    }
    return parts.join('  |  ')
  }

  report(): string {
    const lines: string[] = ['── slim session stats ───────────────────────────']
    lines.push(`  Index source     : ${this.indexSource}`)
    lines.push(`  Files indexed    : ${this.indexedFiles}`)
    lines.push(`  Dep edges        : ${this.depEdges}`)
    lines.push(`  Repo map         : ~${this.repoMapTokens}t (once)`)
    lines.push(`  Dep-context      : ${this.depContextTriggers}x, ~${this.depContextTotalTokens}t total`)
    if (this.contextFilesCount > 0) lines.push(`  Context files    : ${this.contextFilesCount}, ~${this.contextFilesTokens}t (once)`)
    if (this.providerGuidanceCount > 0) lines.push(`  Provider guidance: ${this.providerGuidanceCount}, ~${this.providerGuidanceTokens}t (once)`)
    if (this.totalTokensSaved > 0) {
      lines.push(`  Token savings    : ~${this.totalTokensSaved}t (${Math.round(this.savingsRatio * 100)}% vs full reads)`)
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
    const topFiles = [...this.mentionCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([file, mentions]) => ({ file, mentions }))
    return {
      sessionId: this.sessionId,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      indexSource: this.indexSource,
      indexedFiles: this.indexedFiles,
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
      totalTokensSaved: this.totalTokensSaved,
      savingsRatio: Math.round(this.savingsRatio * 100) / 100,
    }
  }

  async persist(projectRoot: string): Promise<void> {
    const dir = slimDir(projectRoot)
    await mkdir(dir, { recursive: true })
    const line = JSON.stringify(this.toRecord()) + '\n'
    await appendFile(join(dir, 'stats.jsonl'), line, 'utf-8')
    await writeState(projectRoot, {
      lastSession: {
        sessionId: this.sessionId,
        startedAt: this.startedAt,
        indexSource: this.indexSource,
        indexedFiles: this.indexedFiles,
        repoMapTokens: this.repoMapTokens,
        depContextTriggers: this.depContextTriggers,
        depContextTotalTokens: this.depContextTotalTokens,
        contextFilesCount: this.contextFilesCount,
        providerGuidanceCount: this.providerGuidanceCount,
        totalTokensSaved: this.totalTokensSaved,
        savingsRatio: this.savingsRatio,
      },
    })
  }
}

function shorten(p: string): string {
  return p.split('/').slice(-2).join('/')
}
