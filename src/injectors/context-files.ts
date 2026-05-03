/**
 * Context Files — load and format project-local context files (AGENTS.local.md,
 * CLAUDE.local.md, etc.) for injection into the system prompt.
 *
 * Ported from pi-me foundation/extra-context-files.ts
 * ─────────────────────────────────────────────────────
 * Walks from cwd up to the filesystem root, collecting matching filenames
 * at each directory level. Filters out files that pi core already loaded
 * (e.g., AGENTS.md → skip if AGENTS.local.md is the same content).
 *
 * Usage:
 *   const files = loadContextFiles(cwd)
 *   const block = formatContextSection(files)
 *   // → "# Extra Context Files\n\n## /path/to/AGENTS.local.md\n\n..."
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { relative as relativePath, resolve, dirname } from 'node:path'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ContextFileOptions {
  /** Filenames to search for at every ancestor directory level. */
  filenames?: string[]
  /** Section title in the injected block. */
  sectionTitle?: string
}

export interface ContextFile {
  /** Absolute path of the discovered file. */
  path: string
  /** File contents. */
  content: string
}

export type ResolvedContextFileOptions = Required<ContextFileOptions>

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_CONTEXT_FILE_OPTIONS: ResolvedContextFileOptions = {
  filenames: ['AGENTS.local.md', 'CLAUDE.local.md'],
  sectionTitle: 'Extra Context Files',
}

// ── Ancestor directory walk ───────────────────────────────────────────────

function getAncestorDirs(cwd: string): string[] {
  const dir = resolve(cwd)
  const parent = dirname(dir)
  if (parent === dir) {
    return [dir]
  }
  return [...getAncestorDirs(parent), dir]
}

// ── Single file loading ───────────────────────────────────────────────────

function loadFile(filePath: string): ContextFile | null {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return null
    }
    return { path: filePath, content: readFileSync(filePath, 'utf8') }
  } catch {
    return null
  }
}

// ── Load all context files ────────────────────────────────────────────────

/**
 * Walk ancestors of `cwd` and collect all matching filenames.
 * Each directory is checked for every filename in `options.filenames`.
 */
export function loadContextFiles(
  cwd: string,
  options: Pick<ResolvedContextFileOptions, 'filenames'> = DEFAULT_CONTEXT_FILE_OPTIONS,
): ContextFile[] {
  const filenames = options.filenames ?? DEFAULT_CONTEXT_FILE_OPTIONS.filenames
  const result: ContextFile[] = []

  for (const dir of getAncestorDirs(cwd)) {
    for (const filename of filenames) {
      const filePath = resolve(dir, filename)
      const loaded = loadFile(filePath)
      if (loaded) {
        result.push(loaded)
      }
    }
  }

  return result
}

// ── Format section ────────────────────────────────────────────────────────

/**
 * Format loaded context files into a section suitable for system prompt
 * injection.
 */
export function formatContextSection(
  files: ContextFile[],
  options: Pick<ResolvedContextFileOptions, 'sectionTitle'> = DEFAULT_CONTEXT_FILE_OPTIONS,
): string {
  if (files.length === 0) return ''

  const sectionTitle = options.sectionTitle ?? DEFAULT_CONTEXT_FILE_OPTIONS.sectionTitle
  const body = files
    .map((file) => `## ${file.path}\n\n${file.content}`)
    .join('\n\n')

  return `\n\n# ${sectionTitle}\n\nAdditional project instructions and guidelines:\n\n${body}\n`
}

// ── Notification formatting ───────────────────────────────────────────────

/**
 * Format a display path (relative to cwd if possible) for notification output.
 */
export function formatDisplayPath(filePath: string, cwd: string): string {
  const rel = relativePath(cwd, filePath)
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
    return filePath
  }
  return rel
}

/**
 * Build a notification message listing loaded context files.
 * Returns empty string if no files loaded.
 */
export function buildStartupNotification(
  files: ContextFile[],
  cwd: string,
  options: Pick<ResolvedContextFileOptions, 'sectionTitle'> = DEFAULT_CONTEXT_FILE_OPTIONS,
): string {
  if (files.length === 0) return ''

  const sectionTitle = options.sectionTitle ?? DEFAULT_CONTEXT_FILE_OPTIONS.sectionTitle
  const paths = files
    .map((f) => `  ${formatDisplayPath(f.path, cwd)}`)
    .join('\n')

  return `[context-files] ${files.length} file(s) loaded for "${sectionTitle}":\n${paths}`
}
