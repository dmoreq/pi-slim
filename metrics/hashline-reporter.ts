/**
 * Optional session hook for hashline_edit mismatch events.
 */

let onMismatch: (() => void) | null = null

export function setHashlineMismatchReporter(fn: (() => void) | null): void {
  onMismatch = fn
}

export function reportHashlineMismatch(): void {
  onMismatch?.()
}
