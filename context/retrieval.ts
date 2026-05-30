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

import { relative } from 'node:path'
import { godNodeMatchesFilePath } from './graph-node-id.js'
import { godNodeMatchesSymbol } from './god-node-match.js'
import type { GraphAnalysis } from './graph-types.js'
import { fileInCommunity } from './graph-community-files.js'
import type { RepoIndex } from '../shared/types.js'

export interface RetrievalGraphOptions {
  graph?: GraphAnalysis | null
  activeCommunityId?: string | null
  boostGodNodes?: boolean
  boostActiveCommunity?: boolean
  projectRoot?: string
}

export interface ScoredFile {
  file: string
  score: number
  signals: string[]
}

export class RetrievalEngine {
  constructor(private index: RepoIndex) {}

  /**
   * Extract potential symbol names from query text.
   * Looks for camelCase, snake_case, and kebab-case identifiers.
   */
  private extractQueryTokens(query: string): Set<string> {
    const tokens = new Set<string>()
    // Split on whitespace and common delimiters, then extract identifiers
    const words = query.split(/[\s.,;:(){}[\]"'`/\\<>|+=*&^%$#@!?~-]+/)

    for (const word of words) {
      if (word.length > 1) {
        tokens.add(word.toLowerCase())

        // Extract camelCase components (e.g., "getUserData" → ["get", "user", "data"])
        // Look for capital letters to split on
        const camelParts = word.split(/(?=[A-Z])/).filter(s => s.length > 1)
        for (const part of camelParts) {
          tokens.add(part.toLowerCase())
        }

        // Also try to split on common word boundaries
        const underscoreParts = word.split('_').filter(s => s.length > 1)
        for (const part of underscoreParts) {
          tokens.add(part.toLowerCase())
        }
      }
    }

    return tokens
  }

  /**
   * Score a single file against query tokens and active dependency set.
   * Optimized version that doesn't iterate over all symbols.
   */
  private scoreFile(query: string, file: string, activeDeps: Set<string>, queryTokens?: Set<string>): ScoredFile {
    const signals: string[] = []
    let score = 0

    const tokens = queryTokens || this.extractQueryTokens(query)

    // Symbol match: find symbols this file exports that match query tokens
    const matchedSymbols = new Set<string>()

    for (const token of tokens) {
      // Exact symbol matches
      const exportingFiles = this.index.symbolIndex.get(token)
      if (exportingFiles?.includes(file) && !matchedSymbols.has(token)) {
        score += 3
        signals.push(`symbol:${token}`)
        matchedSymbols.add(token)
      }
    }

    // Partial symbol matches (more expensive, so only if we haven't found exact matches)
    if (matchedSymbols.size === 0) {
      for (const [symbol, files] of this.index.symbolIndex) {
        if (!files.includes(file)) continue
        const symbolLower = symbol.toLowerCase()

        for (const token of tokens) {
          if (symbolLower.includes(token) && token.length > 2) {
            // Avoid short token noise
            score += 2 // Lower score for partial matches
            signals.push(`partial-symbol:${symbol}`)
            matchedSymbols.add(symbol)
            break
          }
        }

        if (matchedSymbols.size > 0) break // Only need one partial match per file
      }
    }

    // Filename match
    const name =
      file
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? ''
    if (name.length > 1) {
      for (const token of tokens) {
        if (name.toLowerCase().includes(token)) {
          score += 2
          signals.push(`filename:${name}`)
          break // Only count filename match once
        }
      }
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
   * Optimized to avoid O(files × symbols) complexity.
   *
   * @param query - User message or combined context text
   * @param k - Maximum files to return
   * @param activeDeps - Set of files currently in focus (for proximity scoring)
   * @returns Ranked file paths, highest score first
   */
  retrieveTopK(
    query: string,
    k = 20,
    activeDeps: Set<string> = new Set(),
    graphOpts?: RetrievalGraphOptions
  ): ScoredFile[] {
    const candidates = new Map<string, ScoredFile>()
    const queryTokens = this.extractQueryTokens(query)

    // Phase 1: Symbol-based retrieval (most important signal)
    for (const token of queryTokens) {
      const files = this.index.symbolIndex.get(token)
      if (files) {
        for (const file of files) {
          if (!candidates.has(file)) {
            const scored = this.scoreFile(query, file, activeDeps, queryTokens)
            if (scored.score > 0) {
              candidates.set(file, scored)
            }
          }
        }
      }
    }

    // Phase 2: Filename-based retrieval and dependency proximity for remaining files
    for (const file of this.index.skeletons.keys()) {
      if (!candidates.has(file)) {
        const scored = this.scoreFile(query, file, activeDeps, queryTokens)
        if (scored.score > 0) {
          candidates.set(file, scored)
        }
      }
    }

    let results = Array.from(candidates.values()).sort((a, b) => b.score - a.score)

    if (graphOpts?.graph && graphOpts.projectRoot) {
      results = this.applyGraphBoosts(results, graphOpts)
    }

    return results.slice(0, k)
  }

  private applyGraphBoosts(files: ScoredFile[], opts: RetrievalGraphOptions): ScoredFile[] {
    const graph = opts.graph
    const root = opts.projectRoot
    if (!graph || !root) return files

    const boosted = files.map(f => {
      let score = f.score
      const signals = [...f.signals]
      const rel = relative(root, f.file).replace(/\\/g, '/')

      if (opts.boostGodNodes && graph.godNodes.length > 0) {
        const matchesGod = graph.godNodes.some(gn => godNodeMatchesFilePath(rel, gn))
        if (matchesGod) {
          score += 2
          signals.push('graph:god-node')
        }
        for (const gn of graph.godNodes) {
          if (godNodeMatchesSymbol(gn, rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '')) {
            score += 2
            signals.push('graph:god-symbol')
            break
          }
        }
      }

      if (opts.boostActiveCommunity && opts.activeCommunityId) {
        if (fileInCommunity(f.file, opts.activeCommunityId, graph, root)) {
          score += 1
          signals.push('graph:community')
        }
      }

      return { file: f.file, score, signals }
    })

    return boosted.sort((a, b) => b.score - a.score)
  }

  /**
   * Search by symbol name — find all files exporting a given symbol.
   */
  findBySymbol(name: string): string[] {
    return this.index.symbolIndex.get(name) ?? []
  }
}
