/**
 * Resolve line regions for hashline anchor injection from messages and file refs.
 */

import { resolve } from 'node:path'
import { detectPathsInText, type FileReference } from '../shared/file-detector.js'

export interface LineRegionHint {
  startLine: number
  endLine: number
}

/** Merge overlapping regions per absolute path (wider window wins). */
export function mergeLineRegionHints(
  hints: Map<string, LineRegionHint>,
  absPath: string,
  startLine: number,
  endLine: number
): void {
  const start = Math.max(1, Math.min(startLine, endLine))
  const end = Math.max(start, endLine)
  const existing = hints.get(absPath)
  if (!existing) {
    hints.set(absPath, { startLine: start, endLine: end })
    return
  }
  hints.set(absPath, {
    startLine: Math.min(existing.startLine, start),
    endLine: Math.max(existing.endLine, end),
  })
}

function addFileRef(hints: Map<string, LineRegionHint>, projectRoot: string, ref: FileReference): void {
  const abs = resolve(projectRoot, ref.path)
  if (ref.startLine != null && ref.startLine > 0) {
    mergeLineRegionHints(hints, abs, ref.startLine, ref.endLine ?? ref.startLine)
  }
}

/**
 * Collect line regions from recent message text (file.ts:42 citations) and extra refs.
 */
export function collectLineRegionHints(
  projectRoot: string,
  messages: Array<{ content: string }>,
  extraRefs: FileReference[] = []
): Map<string, LineRegionHint> {
  const hints = new Map<string, LineRegionHint>()
  const text = messages.map(m => m.content).join('\n')

  for (const ref of detectPathsInText(text, { projectRoot, validateExistence: true })) {
    addFileRef(hints, projectRoot, ref)
  }

  for (const ref of extraRefs) {
    addFileRef(hints, projectRoot, ref)
  }

  return hints
}

export function applyLinePadding(
  region: LineRegionHint,
  totalLines: number,
  padding: number
): { startLine: number; endLine: number } {
  const startLine = Math.max(1, region.startLine - padding)
  const endLine = Math.min(totalLines, region.endLine + padding)
  return { startLine, endLine }
}
