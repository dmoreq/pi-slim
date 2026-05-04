/**
 * Retrieval Engine — scored file retrieval for context injection.
 *
 * Replaces regex-based file detection with multi-signal scoring:
 *   - Symbol match (3x) — agent mentions a symbol, file exports it
 *   - Filename match (2x) — agent mentions the filename
 *   - Dependency proximity (1x) — file is imported by an active file
 *
 * Pure functions on RepoIndex — no side effects.
 * @module
 */

import type { RepoIndex } from '../shared/types.js'

export interface ScoredFile {
  file: string
  score: number
  signals: string[]
}

export class RetrievalEngine {
  constructor(private index: RepoIndex) {}

  /**
   * Score a single file against a query and active dependency set.
   */
  private scoreFile(query: string, file: string, activeDeps: Set<string>): ScoredFile {
    const signals: string[] = []
    let score = 0

    // Symbol match: check if any exported symbol matches query tokens
    const symbols = this.index.symbolIndex
    if (symbols.size > 0) {
      const queryLower = query.toLowerCase()
      // Check symbol index for matches
      for (const [sym, files] of symbols) {
        if (!files.includes(file)) continue
        if (queryLower.includes(sym.toLowerCase())) {
          score += 3
          signals.push(`symbol:${sym}`)
        }
      }
    }

    // Filename match
    const name = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    const queryLower = query.toLowerCase()
    if (queryLower.includes(name.toLowerCase()) && name.length > 1) {
      score += 2
      signals.push(`filename:${name}`)
    }

    // Dependency proximity (this file is a transitive dep of an active file)
    if (activeDeps.has(file)) {
      score += 1
      signals.push('dep-proximity')
    }

    return { file, score, signals }
  }

  /**
   * Retrieve top-K files by relevance score.
   *
   * @param query - User message or combined context text
   * @param k - Maximum files to return
   * @param activeDeps - Set of files currently in focus (for proximity scoring)
   * @returns Ranked file paths, highest score first
   */
  retrieveTopK(query: string, k: number = 20, activeDeps: Set<string> = new Set()): ScoredFile[] {
    const candidates: ScoredFile[] = []

    for (const file of this.index.skeletons.keys()) {
      const scored = this.scoreFile(query, file, activeDeps)
      if (scored.score > 0) {
        candidates.push(scored)
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }

  /**
   * Search by symbol name — find all files exporting a given symbol.
   */
  findBySymbol(name: string): string[] {
    return this.index.symbolIndex.get(name) ?? []
  }
}
