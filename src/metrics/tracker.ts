/**
 * Session-scoped usage statistics for the smart-context extension.
 *
 * Tracks every injection and persists a summary to
 * .pi/smart-context/stats.jsonl (one JSON line per session) so you can
 * review historical usage across sessions.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { smartContextDir } from '../paths.js'
import { writeState } from '../persistence/runtime-state.js'

// ── Stored record (one per session in stats.jsonl) ────────────────────────

export interface SessionRecord {
  sessionId: string
  startedAt: string          // ISO timestamp
  endedAt: string            // ISO timestamp
  indexSource: 'cache' | 'fresh'
  indexedFiles: number
  depEdges: number
  repoMapTokens: number
  depContextTriggers: number          // LLM calls that had dep-context injected
  depContextTotalTokens: number       // cumulative tokens across all triggers
  uniqueFilesInjected: number         // distinct files ever injected
  topFiles: { file: string; mentions: number }[]  // top-5 most-mentioned
  contextFilesTokens: number          // tokens used for context-files injection
  contextFilesCount: number           // number of context files loaded
  providerGuidanceTokens: number      // tokens used for provider-guidance injection
  providerGuidanceCount: number       // number of provider guidance files loaded
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
  private mentionCounts = new Map<string, number>()   // file → times mentioned
  private injectedFiles = new Set<string>()           // ever injected this session

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /** Call when the repo map is injected into the system prompt. */
  recordRepoMapInjection(tokens: number): void {
    this.repoMapTokens = tokens
  }

  /**
   * Call each time dep-context is injected before an LLM call.
   * @param injectedFilePaths  Absolute or relative paths of files in the block.
   * @param tokens             Estimated token count of the injected block.
   */
  recordDepContextInjection(injectedFilePaths: string[], tokens: number): void {
    this.depContextTriggers++
    this.depContextTotalTokens += tokens

    for (const f of injectedFilePaths) {
      this.injectedFiles.add(f)
      this.mentionCounts.set(f, (this.mentionCounts.get(f) ?? 0) + 1)
    }
  }

  /**
   * Call when context files (AGENTS.local.md, CLAUDE.md) are injected
   * into the system prompt.
   * @param tokens  Estimated token count of the injected block.
   * @param count   Number of context files loaded.
   */
  recordContextFilesInjection(tokens: number, count: number): void {
    this.contextFilesTokens = tokens
    this.contextFilesCount = count
  }

  /**
   * Call when provider-specific guidance files (CLAUDE.md, CODEX.md,
   * GEMINI.md) are injected into the system prompt.
   * @param tokens  Estimated token count of the injected block.
   * @param count   Number of provider guidance files loaded.
   */
  recordProviderGuidanceInjection(tokens: number, count: number): void {
    this.providerGuidanceTokens = tokens
    this.providerGuidanceCount = count
  }

  /** Returns a one-line human-readable summary of the current session. */
  summary(): string {
    const parts: string[] = []
    parts.push(`index: ${this.indexedFiles} files (${this.indexSource})`)
    parts.push(`repo-map: ~${this.repoMapTokens} tokens`)
    parts.push(`dep-context: ${this.depContextTriggers} injections, ~${this.depContextTotalTokens} tokens total`)
    if (this.contextFilesCount > 0) {
      parts.push(`context-files: ${this.contextFilesCount} file(s), ~${this.contextFilesTokens} tokens`)
    }
    if (this.providerGuidanceCount > 0) {
      parts.push(`provider-guidance: ${this.providerGuidanceCount} file(s), ~${this.providerGuidanceTokens} tokens`)
    }
    parts.push(`unique files injected: ${this.injectedFiles.size}`)
    if (this.mentionCounts.size > 0) {
      const top = [...this.mentionCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([f, n]) => `${shorten(f)}×${n}`)
        .join(', ')
      parts.push(`top files: ${top}`)
    }
    return parts.join('  |  ')
  }

  /** Returns a multi-line formatted report for display. */
  report(): string {
    const lines: string[] = ['── smart-context session stats ──────────────────']

    lines.push(`  Index source     : ${this.indexSource}`)
    lines.push(`  Files indexed    : ${this.indexedFiles}`)
    lines.push(`  Dep edges        : ${this.depEdges}`)
    lines.push(`  Repo map         : ~${this.repoMapTokens} tokens (injected into system prompt)`)
    lines.push(`  Dep-context      : ${this.depContextTriggers} LLM call(s) enriched`)
    lines.push(`  Dep-context tkns : ~${this.depContextTotalTokens} total across all calls`)
    if (this.contextFilesCount > 0) {
      lines.push(`  Context files    : ${this.contextFilesCount} file(s), ~${this.contextFilesTokens} tokens (injected once)`)
    }
    if (this.providerGuidanceCount > 0) {
      lines.push(`  Provider guidance: ${this.providerGuidanceCount} file(s), ~${this.providerGuidanceTokens} tokens (injected once)`)
    }
    lines.push(`  Unique files seen: ${this.injectedFiles.size}`)

    if (this.mentionCounts.size > 0) {
      lines.push('')
      lines.push('  Most-mentioned files:')
      const top = [...this.mentionCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
      for (const [f, n] of top) {
        lines.push(`    ${n}×  ${shorten(f)}`)
      }
    }

    lines.push('─────────────────────────────────────────────────')
    return lines.join('\n')
  }

  /** Serialise to a StoredRecord for persistence. */
  toRecord(): SessionRecord {
    const topFiles = [...this.mentionCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
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
    }
  }

  /**
   * Append this session's record to .pi/smart-context/stats.jsonl and
   * save the latest session state to state.json for cross-session access.
   */
  async persist(projectRoot: string): Promise<void> {
    const dir = smartContextDir(projectRoot)
    await mkdir(dir, { recursive: true })

    // Append to historical log
    const line = JSON.stringify(this.toRecord()) + '\n'
    await appendFile(join(dir, 'stats.jsonl'), line, 'utf-8')

    // Save latest session state for cross-session /smart-context command
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
      },
    })
  }
}

function shorten(filePath: string): string {
  // Show only the last two path segments for readability
  return filePath.split('/').slice(-2).join('/')
}
