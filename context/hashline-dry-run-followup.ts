/**
 * Pending hashline_edit dry-run preview for injection on the next context turn.
 */

export interface PendingDryRunPreview {
  path: string
  preview: string
  addedLines: number
  removedLines: number
}

let pending: PendingDryRunPreview | null = null

export function recordDryRunPreview(entry: PendingDryRunPreview): void {
  pending = entry
}

export function clearDryRunPreview(): void {
  pending = null
}

export function consumeDryRunFollowUpBlock(): string | null {
  if (!pending) return null
  const entry = pending
  pending = null
  return formatDryRunFollowUpBlock(entry)
}

export function formatDryRunFollowUpBlock(entry: PendingDryRunPreview): string {
  return [
    '#### Hashline dry-run preview',
    `File \`${entry.path}\` — changes +${entry.addedLines} / -${entry.removedLines}.`,
    'Review the diff below, then call `hashline_edit` with `dry_run: false` to apply.',
    '```',
    entry.preview,
    '```',
  ].join('\n')
}
