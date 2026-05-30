/**
 * `/hashline-read` and shared formatter for `hashline_read` tool.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AnchorStateManager } from '../hashline/state-manager.js'
import { formatHashLines, initHash } from '../hashline/line-hash.js'

export interface HashlineReadOptions {
  recordOnRead?: boolean
  maxLines?: number
  /** 1-based inclusive start line */
  startLine?: number
  /** 1-based inclusive end line */
  endLine?: number
}

function resolveSliceBounds(
  totalLines: number,
  options: HashlineReadOptions
): { start: number; end: number; label: string } {
  const start1 = options.startLine != null ? Math.max(1, Math.min(options.startLine, totalLines)) : 1
  let end1 =
    options.endLine != null
      ? Math.max(start1, Math.min(options.endLine, totalLines))
      : options.maxLines != null
        ? Math.min(totalLines, start1 + options.maxLines - 1)
        : totalLines

  if (options.startLine == null && options.endLine == null && options.maxLines != null) {
    end1 = Math.min(totalLines, options.maxLines)
  }

  return {
    start: start1,
    end: end1,
    label:
      start1 === 1 && end1 === totalLines
        ? `lines 1–${totalLines}`
        : `lines ${start1}–${end1} of ${totalLines}`,
  }
}

export async function formatHashlineRead(
  projectRoot: string,
  fileArg: string,
  options: HashlineReadOptions = {}
): Promise<string> {
  const trimmed = fileArg.trim()
  if (!trimmed) {
    return 'Usage: /hashline-read <path> [start] [end]\nExample: /hashline-read src/auth.ts 40 60'
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
  const { start, end, label } = resolveSliceBounds(lines.length, options)
  const slice = lines.slice(start - 1, end)
  const annotated = formatHashLines(slice.join('\n'), start)

  const header = [
    `## Hashline read: ${trimmed}`,
    `${lines.length} line(s) — showing ${label}.`,
    'Edit with `hashline_edit` using anchors like `42nd` (line + bigram). Use `dry_run: true` to preview.',
    '',
    '```',
    annotated,
    '```',
  ]

  if (end < lines.length) {
    header.push(
      '',
      `_(File continues to line ${lines.length}. Use \`hashline_read\` with start_line/end_line or \`/hashline-read ${trimmed} <start> <end>\`.)_`
    )
  }

  return header.join('\n')
}

/** Parse `/hashline-read path [start] [end]` command args. */
export function parseHashlineReadArgs(args: string): HashlineReadOptions & { path: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const path = parts[0] ?? ''
  const startLine = parts[1] ? Number.parseInt(parts[1], 10) : undefined
  const endLine = parts[2] ? Number.parseInt(parts[2], 10) : undefined
  return {
    path,
    startLine: Number.isFinite(startLine) && startLine! > 0 ? startLine : undefined,
    endLine: Number.isFinite(endLine) && endLine! > 0 ? endLine : undefined,
    recordOnRead: true,
  }
}

export function formatHashlineReadFromArgs(projectRoot: string, args: string, recordOnRead: boolean): Promise<string> {
  const parsed = parseHashlineReadArgs(args)
  if (!parsed.path) {
    return Promise.resolve('Usage: /hashline-read <path> [startLine] [endLine]\nExample: /hashline-read src/auth.ts 40 60')
  }
  return formatHashlineRead(projectRoot, parsed.path, {
    startLine: parsed.startLine,
    endLine: parsed.endLine,
    recordOnRead,
  })
}
