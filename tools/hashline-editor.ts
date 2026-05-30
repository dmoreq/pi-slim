/**
 * Hashline Editor Tool — precise line-targeted edits via hash-verified anchors.
 *
 * Registers a `hashline_edit` tool that the LLM can call instead of the built-in
 * `edit` tool. Uses line-hash anchors (e.g. "42nd") so edits don't require
 * re-reading the file — the skeleton already has the anchors.
 *
 * @module
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'

import { applyHashlineEdits, hashlineParseText, parseTag } from '../hashline/core.js'
import type { HashlineEdit } from '../hashline/core.js'
import { buildCompactHashlineDiffPreview } from '../hashline/diff-preview.js'
import { generateDiffString } from '../hashline/diff.js'
import { initHash } from '../hashline/line-hash.js'
import { detectLineEnding, normalizeToLF, restoreLineEndings, stripBom } from '../hashline/normalize.js'

let _initialized = false

async function ensureInit(): Promise<void> {
  if (!_initialized) {
    await initHash()
    _initialized = true
  }
}

/** Tool result details */
interface HashlineEditDetails {
  path: string
  addedLines: number
  removedLines: number
  firstChangedLine: number | undefined
  warnings?: string[]
  noopEdits?: Array<{ editIndex: number; loc: string; current: string }>
}

/** Editor return type */
interface HashlineEditResult {
  content: Array<{ type: 'text'; text: string }>
  details: HashlineEditDetails
}

async function readOrCreate(
  absPath: string,
  edits: Array<{ loc?: unknown }>
): Promise<{ rawContent: string; isNew: boolean }> {
  try {
    const rawContent = await readFile(absPath, 'utf-8')
    return { rawContent, isNew: false }
  } catch {
    const createOnly = edits.every(
      e => (e as Record<string, unknown>)?.loc === 'append' || (e as Record<string, unknown>)?.loc === 'prepend'
    )
    if (!createOnly) {
      throw new Error(`File not found: ${absPath}. Use loc 'append' or 'prepend' to create a new file.`)
    }
    return { rawContent: '', isNew: true }
  }
}

async function makeEdit(
  dryRun: boolean,
  path: string,
  edits: Array<{ loc?: unknown; content?: string[] | null }>,
  cwd: string
): Promise<HashlineEditResult> {
  await ensureInit()
  const absPath = resolve(cwd, path)

  const { rawContent, isNew } = await readOrCreate(absPath, edits)

  const { bom, text } = stripBom(rawContent)
  const originalEnding = text.length > 0 ? detectLineEnding(text) : '\n'
  const normalizedContent = normalizeToLF(text)

  const resolvedEdits = edits.map(e => {
    const lines = hashlineParseText(e.content ?? null)
    const loc = e.loc

    if (loc === 'append') return { op: 'append_file' as const, lines }
    if (loc === 'prepend') return { op: 'prepend_file' as const, lines }
    if (typeof loc !== 'object' || loc === null) {
      throw new Error(`Invalid loc value: ${JSON.stringify(loc)}.`)
    }
    const lo = loc as Record<string, unknown>
    if ('append' in lo && typeof lo.append === 'string')
      return { op: 'append_at' as const, pos: parseTag(lo.append), lines }
    if ('prepend' in lo && typeof lo.prepend === 'string')
      return { op: 'prepend_at' as const, pos: parseTag(lo.prepend), lines }
    if ('range' in lo && typeof lo.range === 'object' && lo.range !== null) {
      const r = lo.range as { pos: string; end: string }
      return { op: 'replace_range' as const, pos: parseTag(r.pos), end: parseTag(r.end), lines }
    }
    throw new Error(`Unknown loc shape: ${JSON.stringify(loc)}.`)
  }) as HashlineEdit[]

  const result = applyHashlineEdits(normalizedContent, resolvedEdits, absPath)

  const details: HashlineEditDetails = {
    path,
    addedLines: 0,
    removedLines: 0,
    firstChangedLine: result.firstChangedLine,
    warnings: result.warnings,
    noopEdits: result.noopEdits,
  }

  const textContent = dryRun ? `[DRY RUN] Would update ${path}` : isNew ? `Created ${path}` : `Updated ${path}`

  if (result.lines === normalizedContent) {
    let msg = `No changes made to ${path}.`
    if (result.noopEdits?.length) {
      msg += `\n\n${result.noopEdits.length} edit(s) produced identical content.`
    }
    return { content: [{ type: 'text' as const, text: msg }], details }
  }

  const finalContent = bom + restoreLineEndings(result.lines, originalEnding)
  if (!dryRun) {
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, finalContent, 'utf-8')
  }

  const diffResult = generateDiffString(normalizedContent, result.lines)
  const preview = buildCompactHashlineDiffPreview(diffResult.diff)

  details.addedLines = preview.addedLines
  details.removedLines = preview.removedLines

  const summaryLine = `Changes: +${preview.addedLines} -${preview.removedLines}`
  const wb = result.warnings?.length ? `\n\nWarnings:\n${result.warnings.join('\n')}` : ''
  const pb = preview.preview ? `\n\nDiff preview:\n${preview.preview}` : ''

  return {
    content: [{ type: 'text' as const, text: `${textContent}\n${summaryLine}${pb}${wb}` }],
    details,
  }
}

const hashlineTool = defineTool({
  name: 'hashline_edit',
  label: 'Hashline Edit',
  description:
    "Edit files using hashline anchors (LINE+bigram references like '42nd'). " +
    'Set dry_run: true to validate anchors and preview the diff without writing. ' +
    'Read the file first via the read tool to see anchor-annotated content, then ' +
    'reference specific lines by their LINE+BIGRAM anchor. No file re-read needed. ' +
    'Supports replace_line, replace_range, append_at, prepend_at, append_file, prepend_file.',

  parameters: Type.Object({
    path: Type.String({ description: 'File path to edit (relative to cwd or absolute)' }),
    dry_run: Type.Optional(
      Type.Boolean({
        description: 'When true, validate anchors and return a diff preview without writing the file',
      })
    ),
    edits: Type.Array(
      Type.Object({
        loc: Type.Optional(
          Type.Union([
            Type.Literal('append'),
            Type.Literal('prepend'),
            Type.Object({ append: Type.String({ description: 'anchor to append after (e.g. "42nd")' }) }),
            Type.Object({ prepend: Type.String({ description: 'anchor to prepend before (e.g. "42nd")' }) }),
            Type.Object({
              range: Type.Object({
                pos: Type.String({ description: 'first anchor of range (inclusive, e.g. "10ab")' }),
                end: Type.String({ description: 'last anchor of range (inclusive, e.g. "20cd")' }),
              }),
            }),
          ])
        ),
        content: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
      }),
      { description: 'Array of edit operations' }
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { path: string; edits: Array<{ loc?: unknown; content?: string[] | null }>; dry_run?: boolean | string },
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown
  ) {
    const cwd = (_ctx as { cwd?: string })?.cwd ?? process.cwd()
    return makeEdit(!!params.dry_run, params.path, params.edits, cwd)
  },
})

export function registerHashlineTool(pi: ExtensionAPI): void {
  pi.registerTool(hashlineTool as unknown as Parameters<ExtensionAPI['registerTool']>[0])
}

export default hashlineTool
