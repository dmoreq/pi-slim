/**
 * Inject hashline anchor snippets into dep-context for in-focus files.
 */

import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { AnchorStateManager } from '../hashline/state-manager.js'
import { formatHashLines } from '../hashline/line-hash.js'
import { applyLinePadding, type LineRegionHint } from './hashline-region.js'
import { estimateTokens } from '../shared/token.js'

export interface HashlineInjectOptions {
  enabled: boolean
  maxLinesPerFile: number
  recordOnRead: boolean
  annotateBySymbolRange?: boolean
  annotateRangePaddingLines?: number
  /** absPath → region from citations / tool refs */
  regionHints?: Map<string, LineRegionHint>
}

export const HASHLINE_ANCHOR_LINE_RE = /\b\d+[a-z]{2}\|/

export function contentHasHashlineAnchors(text: string): boolean {
  return HASHLINE_ANCHOR_LINE_RE.test(text)
}

function resolveAnnotateBounds(
  lineCount: number,
  opts: HashlineInjectOptions,
  region?: LineRegionHint
): { start: number; end: number; label: string } {
  const padding = opts.annotateRangePaddingLines ?? 15

  if (opts.annotateBySymbolRange !== false && region) {
    const padded = applyLinePadding(region, lineCount, padding)
    let end = padded.endLine
    const span = end - padded.startLine + 1
    if (span > opts.maxLinesPerFile) {
      const center = Math.floor((padded.startLine + padded.endLine) / 2)
      const half = Math.floor(opts.maxLinesPerFile / 2)
      const start = Math.max(1, center - half)
      end = Math.min(lineCount, start + opts.maxLinesPerFile - 1)
      return {
        start,
        end,
        label: `lines ${start}–${end} (around citation ${region.startLine})`,
      }
    }
    return {
      start: padded.startLine,
      end,
      label: `lines ${padded.startLine}–${end} (around citation)`,
    }
  }

  const end = Math.min(opts.maxLinesPerFile, lineCount)
  return { start: 1, end, label: `lines 1–${end}` }
}

/**
 * Build a fenced hashline block (sync; requires initHash at session start).
 */
export function buildHashlineAnchorBlock(
  absPath: string,
  projectRoot: string,
  opts: HashlineInjectOptions
): string | null {
  if (!opts.enabled) return null

  try {
    const raw = readFileSync(absPath, 'utf-8')
    if (opts.recordOnRead) {
      AnchorStateManager.record(absPath, raw)
    }

    const lines = raw.split('\n')
    if (lines.length === 0) return null

    const region = opts.regionHints?.get(absPath)
    const { start, end, label } = resolveAnnotateBounds(lines.length, opts, region)
    if (end < start) return null

    const annotated = formatHashLines(lines.slice(start - 1, end).join('\n'), start)
    const rel = relative(projectRoot, absPath)
    return (
      `#### Hashline anchors (${label})\n` +
      `Use \`LINE+bigram\` refs with \`hashline_edit\` (\`dry_run: true\` first). ` +
      `Full file or range: \`hashline_read\` or \`/hashline-read ${rel}\`.\n` +
      '```\n' +
      `${annotated}\n` +
      '```'
    )
  } catch {
    return null
  }
}

export function appendHashlineToEntry(
  entry: string,
  absPath: string,
  projectRoot: string,
  opts: HashlineInjectOptions,
  tokenBudget: number
): { entry: string; cost: number; hasAnchors: boolean } {
  const block = buildHashlineAnchorBlock(absPath, projectRoot, opts)
  if (!block) return { entry, cost: estimateTokens(entry), hasAnchors: false }

  const combined = `${entry}\n\n${block}`
  const cost = estimateTokens(combined)
  if (cost > tokenBudget) return { entry, cost: estimateTokens(entry), hasAnchors: false }

  return { entry: combined, cost, hasAnchors: true }
}

/** Resolve a tool path against project root when relative. */
export function resolveProjectPath(projectRoot: string, filePath: string): string {
  return resolve(projectRoot, filePath)
}

/** Extract file path from common built-in read/edit tool inputs. */
export function extractToolPath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined
  for (const key of ['path', 'filePath', 'file', 'target', 'file_path', 'relativePath']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}
