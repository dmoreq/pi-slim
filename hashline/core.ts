/**
 * Hashline core logic — pure functions for parsing, validating, and applying
 * hashline edits. Extracted from oh-my-pi with no runtime-specific dependencies.
 * @module
 */

import { HASHLINE_BIGRAM_RE_SRC, computeLineHash, formatHashLine } from './line-hash.js'
import { AnchorStateManager } from './state-manager.js'

// ── Types ─────────────────────────────────────────────────────────────────

export interface HashMismatch {
  line: number
  expected: string
  actual: string
}

export interface Anchor {
  line: number
  hash: string
  contentHint?: string
}

export type HashlineEdit =
  | { op: 'replace_line'; pos: Anchor; lines: string[] }
  | { op: 'replace_range'; pos: Anchor; end: Anchor; lines: string[] }
  | { op: 'append_at'; pos: Anchor; lines: string[] }
  | { op: 'prepend_at'; pos: Anchor; lines: string[] }
  | { op: 'append_file'; lines: string[] }
  | { op: 'prepend_file'; lines: string[] }

// ── Constants ─────────────────────────────────────────────────────────────

export const ANCHOR_REBASE_WINDOW = 5
const MISMATCH_CONTEXT = 3

const HASHLINE_CONTENT_SEPARATOR_RE = '[:|]'
const HASHLINE_PREFIX_RE = new RegExp(
  `^\\s*(?:>>>|>>)?\\s*(?:[+*]\\s*)?\\d+${HASHLINE_BIGRAM_RE_SRC}${HASHLINE_CONTENT_SEPARATOR_RE}`
)
const HASHLINE_PREFIX_PLUS_RE = new RegExp(
  `^\\s*(?:>>>|>>)?\\s*\\+\\s*\\d+${HASHLINE_BIGRAM_RE_SRC}${HASHLINE_CONTENT_SEPARATOR_RE}`
)
const DIFF_PLUS_RE = /^[+](?![+])/
const READ_TRUNCATION_NOTICE_RE = /^\[(?:Showing lines \d+-\d+ of \d+|\d+ more lines? in (?:file|\S+))\b.*\bsel=L?\d+/

// ── Prefix stripping ──────────────────────────────────────────────────────

type LinePrefixStats = {
  nonEmpty: number
  hashPrefixCount: number
  diffPlusHashPrefixCount: number
  diffPlusCount: number
}

function collectLinePrefixStats(lines: string[]): LinePrefixStats {
  const stats: LinePrefixStats = { nonEmpty: 0, hashPrefixCount: 0, diffPlusHashPrefixCount: 0, diffPlusCount: 0 }
  for (const line of lines) {
    if (line.length === 0 || READ_TRUNCATION_NOTICE_RE.test(line)) continue
    stats.nonEmpty++
    if (HASHLINE_PREFIX_RE.test(line)) stats.hashPrefixCount++
    if (HASHLINE_PREFIX_PLUS_RE.test(line)) stats.diffPlusHashPrefixCount++
    if (DIFF_PLUS_RE.test(line)) stats.diffPlusCount++
  }
  return stats
}

function stripLeadingHashlinePrefixes(line: string): string {
  let result = line
  let prev: string
  do {
    prev = result
    result = result.replace(HASHLINE_PREFIX_RE, '')
  } while (result !== prev)
  return result
}

export function stripNewLinePrefixes(lines: string[]): string[] {
  const { nonEmpty, hashPrefixCount, diffPlusHashPrefixCount, diffPlusCount } = collectLinePrefixStats(lines)
  if (nonEmpty === 0) return lines
  const stripHash = hashPrefixCount > 0 && hashPrefixCount === nonEmpty
  const stripPlus = !stripHash && diffPlusHashPrefixCount === 0 && diffPlusCount > 0 && diffPlusCount >= nonEmpty * 0.5
  if (!stripHash && !stripPlus && diffPlusHashPrefixCount === 0) return lines
  return lines
    .filter(line => !READ_TRUNCATION_NOTICE_RE.test(line))
    .map(line => {
      if (stripHash) return stripLeadingHashlinePrefixes(line)
      if (stripPlus) return line.replace(DIFF_PLUS_RE, '')
      if (diffPlusHashPrefixCount > 0 && HASHLINE_PREFIX_PLUS_RE.test(line)) return line.replace(HASHLINE_PREFIX_RE, '')
      return line
    })
}

export function stripHashlinePrefixes(lines: string[]): string[] {
  const { nonEmpty, hashPrefixCount } = collectLinePrefixStats(lines)
  if (nonEmpty === 0 || hashPrefixCount !== nonEmpty) return lines
  return lines.filter(line => !READ_TRUNCATION_NOTICE_RE.test(line)).map(stripLeadingHashlinePrefixes)
}

// ── Text normalization for edits ──────────────────────────────────────────

export function hashlineParseText(edit: string[] | string | null | undefined): string[] {
  if (edit == null) return []
  if (typeof edit === 'string') {
    const normalizedEdit = edit.endsWith('\n') ? edit.slice(0, -1) : edit
    edit = normalizedEdit.replaceAll('\r', '').split('\n')
  }
  return stripNewLinePrefixes(edit)
}

// ── User-friendly error hints ─────────────────────────────────────────────

export function formatFullAnchorRequirement(raw?: string): string {
  const suffix = typeof raw === 'string' ? raw.trim() : ''
  const hashOnlyHint = /^[A-Za-z]{2}$/.test(suffix)
    ? ` It looks like you supplied only the 2-letter suffix (${JSON.stringify(suffix)}). Copy the full anchor exactly as shown (for example, "160${suffix}").`
    : ''
  const received = raw === undefined ? '' : ` Received ${JSON.stringify(raw)}.`
  return `the full anchor exactly as shown by read/grep (line number + 2-letter suffix, for example "160sr")${received}${hashOnlyHint}`
}

// ── Anchor parsing ────────────────────────────────────────────────────────

export function parseTag(ref: string): { line: number; hash: string } {
  const match = ref.match(new RegExp(`^\\s*[>+\\-*]*\\s*(\\d+)(${HASHLINE_BIGRAM_RE_SRC})`))
  if (!match) throw new Error(`Invalid line reference. Expected ${formatFullAnchorRequirement(ref)}.`)
  const line = Number.parseInt(match[1], 10)
  if (line < 1) throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`)
  return { line, hash: match[2] }
}

// ── Code frame formatting ─────────────────────────────────────────────────

export function formatCodeFrameLine(marker: string, lineNum: number, text: string, lineWidth: number): string {
  return `${marker} ${String(lineNum).padStart(lineWidth, ' ')} \u2502 ${text}`
}

// ── Hashline Mismatch Error ──────────────────────────────────────────────

export class HashlineMismatchError extends Error {
  readonly remaps: ReadonlyMap<string, string>
  constructor(
    public readonly mismatches: HashMismatch[],
    public readonly fileLines: string[]
  ) {
    super(HashlineMismatchError.formatMessage(mismatches, fileLines))
    this.name = 'HashlineMismatchError'
    const remaps = new Map<string, string>()
    for (const m of mismatches)
      remaps.set(`${m.line}${m.expected}`, `${m.line}${computeLineHash(m.line, fileLines[m.line - 1])}`)
    this.remaps = remaps
  }

  get displayMessage(): string {
    return HashlineMismatchError.formatDisplayMessage(this.mismatches, this.fileLines)
  }

  static formatDisplayMessage(
    mismatches: HashMismatch[],
    fileLines: string[],
    filePath?: string
  ): string {
    const mismatchSet = new Set(mismatches.map(m => m.line))
    const displayLines = buildDisplayLineSet(mismatches, fileLines.length)
    const sorted = [...displayLines].sort((a, b) => a - b)
    const w = sorted.reduce((mw, n) => Math.max(mw, String(n).length), 0)
    const out: string[] = [
      `Edit rejected: ${mismatches.length} line${mismatches.length > 1 ? 's have' : ' has'} changed since the last read (marked *).`,
      'The edit was NOT applied. Re-read with `hashline_read` (or `/hashline-read <path>`), then retry `hashline_edit` using the anchors below.',
    ]
    const firstMismatchLine = mismatches[0]?.line
    if (filePath && firstMismatchLine != null) {
      const start = Math.max(1, firstMismatchLine - MISMATCH_CONTEXT)
      const end = Math.min(fileLines.length, firstMismatchLine + MISMATCH_CONTEXT)
      out.push(
        `Quick re-read: \`hashline_read\` path=\`${filePath}\` start_line=${start} end_line=${end}`
      )
    }
    out.push('')
    let prev = -1
    for (const n of sorted) {
      if (prev !== -1 && n > prev + 1) out.push('...')
      prev = n
      out.push(formatCodeFrameLine(mismatchSet.has(n) ? '*' : ' ', n, fileLines[n - 1] ?? '', w))
    }
    return out.join('\n')
  }

  static formatMessage(mismatches: HashMismatch[], fileLines: string[]): string {
    const mismatchSet = new Set(mismatches.map(m => m.line))
    const displayLines = buildDisplayLineSet(mismatches, fileLines.length)
    const sorted = [...displayLines].sort((a, b) => a - b)
    const out: string[] = [
      `Edit rejected: ${mismatches.length} line${mismatches.length > 1 ? 's have' : ' has'} changed since the last read (marked *).`,
      'The edit was NOT applied, please use the updated file content shown below.',
    ]
    let prev = -1
    for (const n of sorted) {
      if (prev !== -1 && n > prev + 1) out.push('...')
      prev = n
      const hash = computeLineHash(n, fileLines[n - 1])
      out.push(`${mismatchSet.has(n) ? '*' : ' '}${n}${hash}|${fileLines[n - 1]}`)
    }
    return out.join('\n')
  }
}

function buildDisplayLineSet(mismatches: HashMismatch[], fileLen: number): Set<number> {
  const s = new Set<number>()
  for (const m of mismatches) {
    for (let i = Math.max(1, m.line - MISMATCH_CONTEXT); i <= Math.min(fileLen, m.line + MISMATCH_CONTEXT); i++)
      s.add(i)
  }
  return s
}

// ── Validation ────────────────────────────────────────────────────────────

export function validateLineRef(ref: { line: number; hash: string }, fileLines: string[]): void {
  if (ref.line < 1 || ref.line > fileLines.length) {
    throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`)
  }
  const actual = computeLineHash(ref.line, fileLines[ref.line - 1])
  if (actual !== ref.hash) throw new HashlineMismatchError([{ line: ref.line, expected: ref.hash, actual }], fileLines)
}

// ── Anchor Rebase ────────────────────────────────────────────────────────

export function tryRebaseAnchor(
  anchor: { line: number; hash: string },
  fileLines: string[],
  window: number = ANCHOR_REBASE_WINDOW
): number | null {
  const lo = Math.max(1, anchor.line - window)
  const hi = Math.min(fileLines.length, anchor.line + window)
  let found: number | null = null
  for (let line = lo; line <= hi; line++) {
    if (line === anchor.line) continue
    if (computeLineHash(line, fileLines[line - 1]) !== anchor.hash) continue
    if (found !== null) return null
    found = line
  }
  return found
}

// ── Edit Application Helpers ──────────────────────────────────────────────

function ensureContent(edit: HashlineEdit): void {
  if (edit.lines.length === 0) edit.lines = ['']
}

function collectBoundaryWarning(edit: HashlineEdit, originalFileLines: string[], warnings: string[]): void {
  const endLine = edit.op === 'replace_line' ? edit.pos.line : edit.op === 'replace_range' ? edit.end.line : -1
  if (endLine < 0 || edit.lines.length === 0 || endLine >= originalFileLines.length) return
  const nextLine = originalFileLines[endLine]
  const lastInserted = edit.lines[edit.lines.length - 1]
  if (lastInserted.trim().length > 0 && lastInserted.trim() === nextLine.trim()) {
    warnings.push(
      `Possible boundary duplication: your last replacement line \`${lastInserted.trim()}\` is identical to the next surviving line ${formatHashLine(endLine + 1, nextLine)}. ` +
        `If you meant to replace the entire block, set \`end\` to ${formatHashLine(endLine + 1, nextLine)} instead.`
    )
  }
}

function dedupeEdits(edits: HashlineEdit[]): void {
  const seen = new Map<string, number>()
  const drop = new Set<number>()
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i]
    const key = `${e.op}:${'pos' in e ? `${e.pos.line}:${e.pos.hash}` : ''}${'end' in e ? `:${e.end.line}:${e.end.hash}` : ''}:${e.lines.join('\n')}`
    if (seen.has(key)) drop.add(i)
    else seen.set(key, i)
  }
  for (let i = edits.length - 1; i >= 0; i--) {
    if (drop.has(i)) edits.splice(i, 1)
  }
}

function sortKey(edit: HashlineEdit, lineCount: number): { sortLine: number; precedence: number } {
  switch (edit.op) {
    case 'replace_line':
      return { sortLine: edit.pos.line, precedence: 0 }
    case 'replace_range':
      return { sortLine: edit.end.line, precedence: 0 }
    case 'append_at':
      return { sortLine: edit.pos.line, precedence: 1 }
    case 'prepend_at':
      return { sortLine: edit.pos.line, precedence: 2 }
    case 'append_file':
      return { sortLine: lineCount + 1, precedence: 1 }
    case 'prepend_file':
      return { sortLine: 0, precedence: 2 }
  }
}

function applyEdit(
  edit: HashlineEdit,
  fileLines: string[],
  originalFileLines: string[],
  editIndex: number,
  noopEdits: Array<{ editIndex: number; loc: string; current: string }>,
  track: (line: number) => void
): void {
  const op = edit.op
  if (op === 'replace_line') {
    const orig = originalFileLines.slice(edit.pos.line - 1, edit.pos.line)
    if (orig.length === edit.lines.length && orig.every((l, i) => l === edit.lines[i])) {
      noopEdits.push({ editIndex, loc: `${edit.pos.line}${edit.pos.hash}`, current: orig.join('\n') })
    } else {
      fileLines.splice(edit.pos.line - 1, 1, ...edit.lines)
      track(edit.pos.line)
    }
  } else if (op === 'replace_range') {
    const count = edit.end.line - edit.pos.line + 1
    const orig = originalFileLines.slice(edit.pos.line - 1, edit.pos.line - 1 + count)
    if (count === edit.lines.length && orig.every((l, i) => l === edit.lines[i])) {
      noopEdits.push({
        editIndex,
        loc: `${edit.pos.line}${edit.pos.hash}-${edit.end.line}${edit.end.hash}`,
        current: orig.join('\n'),
      })
    } else {
      fileLines.splice(edit.pos.line - 1, count, ...edit.lines)
      track(edit.pos.line)
    }
  } else if (op === 'append_at') {
    if (edit.lines.length === 0) {
      noopEdits.push({
        editIndex,
        loc: `${edit.pos.line}${edit.pos.hash}`,
        current: originalFileLines[edit.pos.line - 1],
      })
    } else {
      fileLines.splice(edit.pos.line, 0, ...edit.lines)
      track(edit.pos.line + 1)
    }
  } else if (op === 'prepend_at') {
    if (edit.lines.length === 0) {
      noopEdits.push({
        editIndex,
        loc: `${edit.pos.line}${edit.pos.hash}`,
        current: originalFileLines[edit.pos.line - 1],
      })
    } else {
      fileLines.splice(edit.pos.line - 1, 0, ...edit.lines)
      track(edit.pos.line)
    }
  } else if (op === 'append_file') {
    if (edit.lines.length === 0) {
      noopEdits.push({ editIndex, loc: 'EOF', current: '' })
    } else {
      if (fileLines.length === 1 && fileLines[0] === '') {
        fileLines.splice(0, 1, ...edit.lines)
        track(1)
      } else {
        fileLines.splice(fileLines.length, 0, ...edit.lines)
        track(fileLines.length - edit.lines.length + 1)
      }
    }
  } else if (op === 'prepend_file') {
    if (edit.lines.length === 0) {
      noopEdits.push({ editIndex, loc: 'BOF', current: '' })
    } else {
      if (fileLines.length === 1 && fileLines[0] === '') fileLines.splice(0, 1, ...edit.lines)
      else fileLines.splice(0, 0, ...edit.lines)
      track(1)
    }
  }
}

function validateRefs(edits: HashlineEdit[], fileLines: string[], warnings: string[]): HashMismatch[] {
  const mismatches: HashMismatch[] = []
  const check = (ref: { line: number; hash: string }) => {
    if (ref.line < 1 || ref.line > fileLines.length)
      throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`)
    const actual = computeLineHash(ref.line, fileLines[ref.line - 1])
    if (actual === ref.hash) return
    const rebased = tryRebaseAnchor(ref, fileLines)
    if (rebased !== null) {
      warnings.push(
        `Auto-rebased anchor ${ref.line}${ref.hash} \u2192 ${rebased}${ref.hash} (line shifted within \u00b1${ANCHOR_REBASE_WINDOW}; hash matched).`
      )
      ref.line = rebased
    } else {
      mismatches.push({ line: ref.line, expected: ref.hash, actual })
    }
  }
  for (const edit of edits) {
    switch (edit.op) {
      case 'replace_line':
        check(edit.pos)
        break
      case 'replace_range':
        check(edit.pos)
        check(edit.end)
        if (edit.pos.line > edit.end.line) throw new Error(`Range start ${edit.pos.line} > end ${edit.end.line}`)
        break
      case 'append_at':
      case 'prepend_at':
        check(edit.pos)
        ensureContent(edit)
        break
      case 'append_file':
      case 'prepend_file':
        ensureContent(edit)
        break
    }
  }
  return mismatches
}

function buildResult(
  fileLines: string[],
  fc: number | undefined,
  warnings: string[],
  noopEdits: Array<{ editIndex: number; loc: string; current: string }>
) {
  return {
    lines: fileLines.join('\n'),
    firstChangedLine: fc,
    ...(warnings.length ? { warnings } : {}),
    ...(noopEdits.length ? { noopEdits } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Edit Application
// ═══════════════════════════════════════════════════════════════════════════

export function applyHashlineEdits(
  text: string,
  edits: HashlineEdit[],
  filePath?: string
): {
  lines: string
  firstChangedLine: number | undefined
  warnings?: string[]
  noopEdits?: Array<{ editIndex: number; loc: string; current: string }>
} {
  if (edits.length === 0) return { lines: text, firstChangedLine: undefined }
  const fileLines = text.split('\n')
  const originalFileLines = [...fileLines]
  let fc: number | undefined
  const noopEdits: Array<{ editIndex: number; loc: string; current: string }> = []
  const warnings: string[] = []

  if (filePath) {
    const reconciliation = AnchorStateManager.reconcile(filePath, text, edits)
    warnings.push(...reconciliation.warnings)
  }

  const mismatches = validateRefs(edits, fileLines, warnings)
  if (mismatches.length > 0) throw new HashlineMismatchError(mismatches, fileLines)

  for (const edit of edits) collectBoundaryWarning(edit, originalFileLines, warnings)
  dedupeEdits(edits)

  const sorted = edits
    .map((e, i) => ({ edit: e, idx: i, ...sortKey(e, fileLines.length) }))
    .sort((a, b) => b.sortLine - a.sortLine || a.precedence - b.precedence || a.idx - b.idx)

  for (const { edit, idx } of sorted)
    applyEdit(edit, fileLines, originalFileLines, idx, noopEdits, l => {
      if (fc === undefined || l < fc) fc = l
    })

  const result = buildResult(fileLines, fc, warnings, noopEdits)
  if (filePath) {
    AnchorStateManager.record(filePath, result.lines)
  }
  return result
}
