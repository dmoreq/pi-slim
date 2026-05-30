/**
 * Merge dep-context hashline injection into intelligence insights.
 */

import type { ContextInsights } from '../shared/intelligence-types.js'
import { contentHasHashlineAnchors } from './hashline-inject.js'

export function mergeHashlineInjectionInsights(
  insights: ContextInsights,
  injectedPaths: Set<string>,
  depContextContent: string | null
): ContextInsights {
  const hasAnchors =
    insights.editingIntent.hasHashAnnotations ||
    injectedPaths.size > 0 ||
    (depContextContent != null && contentHasHashlineAnchors(depContextContent))

  if (!hasAnchors) return insights

  return {
    ...insights,
    editingIntent: {
      ...insights.editingIntent,
      hasHashAnnotations: true,
    },
  }
}

export function formatHashlineTurnWorkflowBlock(): string {
  return [
    '## Hashline edit (this turn)',
    '- Anchors are in dep-context above — use `hashline_edit` with `dry_run: true` first.',
    '- Need more lines? Call `hashline_read` with `start_line` / `end_line`.',
    '- Do not use built-in `edit` / `search_replace` on anchored files.',
  ].join('\n')
}
