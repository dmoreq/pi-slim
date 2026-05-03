/**
 * Token estimation utilities.
 *
 * Provides a rough token-count estimator used across the codebase
 * for budget management. Uses the standard heuristic of 4 chars/token.
 */

/**
 * Estimate the number of tokens in a text string.
 * Uses the standard heuristic: chars ÷ 4.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}
