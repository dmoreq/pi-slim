/**
 * Inject hashline anchor snippets into dep-context for in-focus files.
 */

import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { AnchorStateManager } from '../hashline/state-manager.js'
import { formatHashLines } from '../hashline/line-hash.js'
import { estimateTokens } from '../shared/token.js'

export interface HashlineInjectOptions {
  enabled: boolean
  maxLinesPerFile: number
  recordOnRead: boolean
}

/**
 * Build a fenced hashline block for the first N lines of a file (sync; requires initHash at session start).
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
    const lineCount = Math.min(opts.maxLinesPerFile, lines.length)
    if (lineCount === 0) return null

    const annotated = formatHashLines(lines.slice(0, lineCount).join('\n'))
    const rel = relative(projectRoot, absPath)
    return (
      `#### Hashline anchors (lines 1–${lineCount})\n` +
      `Use \`LINE+bigram\` refs with \`hashline_edit\` (\`dry_run: true\` first). ` +
      `Full file: \`/hashline-read ${rel}\`.\n` +
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
