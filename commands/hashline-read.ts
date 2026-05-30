/**
 * `/hashline-read` — read a file with hashline LINE+BIGRAM anchors.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AnchorStateManager } from '../hashline/state-manager.js'
import { formatHashLines, initHash } from '../hashline/line-hash.js'

export interface HashlineReadOptions {
  recordOnRead?: boolean
  maxLines?: number
}

export async function formatHashlineRead(
  projectRoot: string,
  fileArg: string,
  options: HashlineReadOptions = {}
): Promise<string> {
  const trimmed = fileArg.trim()
  if (!trimmed) {
    return 'Usage: /hashline-read <path>\nExample: /hashline-read src/auth.ts'
  }

  await initHash()
  const absPath = resolve(projectRoot, trimmed)

  let raw: string
  try {
    raw = await readFile(absPath, 'utf-8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Could not read file: ${trimmed}\n${msg}`
  }

  if (options.recordOnRead !== false) {
    AnchorStateManager.record(absPath, raw)
  }

  const lines = raw.split('\n')
  const maxLines = options.maxLines
  const truncated = maxLines != null && lines.length > maxLines
  const slice = maxLines != null ? lines.slice(0, maxLines) : lines
  const annotated = formatHashLines(slice.join('\n'))

  const header = [
    `## Hashline read: ${trimmed}`,
    `${lines.length} line(s)${truncated ? ` (showing first ${maxLines})` : ''}.`,
    'Edit with `hashline_edit` using anchors like `42nd` (line + bigram). Use `dry_run: true` to preview.',
    '',
    '```',
    annotated,
    '```',
  ]

  if (truncated) {
    header.push('', `_(Truncated — file has ${lines.length} lines. Increase limit or read in sections.)_`)
  }

  return header.join('\n')
}
