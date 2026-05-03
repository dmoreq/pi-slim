/**
 * Cost estimator — estimates token savings from skeleton-based context.
 *
 * Compares the token cost of using file skeletons vs. full file content
 * and tracks avoided reads to quantify cost reduction.
 */

import { readFileSync } from 'node:fs'
import { estimateTokens } from '../utils/token.js'

export interface CostEstimate {
  /** Tokens used for skeleton content. */
  skeletonTokens: number
  /** Estimated tokens if full files were used instead. */
  fullFileTokens: number
  /** Token savings ratio (0-1). 0.9 = 90% saved. */
  savingsRatio: number
  /** Number of full file reads avoided this session. */
  avoidedReads: number
}

/**
 * Estimate the token cost of reading a full file vs. its skeleton.
 * The "full file" estimate assumes the LLM would have read the entire
 * file content if skeletons weren't available.
 */
export function estimateFileSavings(
  filePath: string,
  skeleton: string,
): { skeletonTokens: number; fullTokens: number } {
  const skeletonTokens = estimateTokens(skeleton)
  let fullTokens = skeletonTokens

  try {
    const content = readFileSync(filePath, 'utf-8')
    fullTokens = estimateTokens(content)
  } catch {
    // File may not exist (virtual paths in dep graph) — use skeleton * 8 as heuristic
    fullTokens = skeletonTokens * 8
  }

  return { skeletonTokens, fullTokens }
}

/**
 * Build a session-level cost estimate from per-file contributions.
 */
export function buildCostEstimate(
  fileEstimates: Array<{ skeletonTokens: number; fullTokens: number }>,
  avoidedReads: number,
): CostEstimate {
  const skeletonTokens = fileEstimates.reduce((s, e) => s + e.skeletonTokens, 0)
  const fullFileTokens = fileEstimates.reduce((s, e) => s + e.fullTokens, 0)
  const savingsRatio = fullFileTokens > 0
    ? 1 - (skeletonTokens / fullFileTokens)
    : 0

  return { skeletonTokens, fullFileTokens, savingsRatio, avoidedReads }
}
