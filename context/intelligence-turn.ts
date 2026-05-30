/**
 * Per-turn intelligence mode — drives what guidance blocks are injected.
 */

import type { ContextInsights } from '../shared/intelligence-types.js'

export type IntelligenceTurnMode = 'editing' | 'navigation' | 'overview' | 'idle'

export interface IntelligenceGuidanceOptions {
  /** Include the full WORKFLOW OPTIMIZATION block (hashline/LSP overview). */
  includeWorkflow?: boolean
  /** Turn mode from intent classification. */
  mode?: IntelligenceTurnMode
  /** Extra markdown sections appended after graph-aware blocks. */
  extraSections?: string[]
}

export function classifyIntelligenceTurnMode(
  insights: ContextInsights,
  isBroadCodebaseQuery: boolean
): IntelligenceTurnMode {
  if (isBroadCodebaseQuery) return 'overview'
  if (insights.editingIntent.detected) return 'editing'
  if (insights.navigationRequests.detected) return 'navigation'
  return 'idle'
}
