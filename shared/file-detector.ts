/**
 * File Detector — multi-source file path detection.
 *
 * Extracts file paths from different content types:
 *   - User/assistant text (regex-based)
 *   - Tool call arguments (read, write, edit, bash)
 *   - Tool output content (compiler errors, logs)
 *
 * Ported from pi-me core-tools/file-collector/extension.ts patterns
 */

import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { detectCompilerErrorLocations } from './compiler-error-locations.js'
import { PathUtils } from './utils/path-utils.js'

// ── Types ─────────────────────────────────────────────────────────────────

export interface FileReference {
  path: string
  startLine?: number
  endLine?: number
  /** 0-based column (e.g. from compiler error output) */
  startColumn?: number
}

export interface DetectorOptions {
  extensions?: string[]
  validateExistence?: boolean
  projectRoot?: string
}

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.py',
  '.rs',
  '.js',
  '.jsx',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
]

// ── Path helpers ──────────────────────────────────────────────────────────

function resolvePath(raw: string, projectRoot?: string): string {
  if (isAbsolute(raw)) return PathUtils.normalizePath(raw)
  if (projectRoot) {
    return PathUtils.normalizePath(PathUtils.ensureAbsolute(raw, projectRoot))
  }
  return PathUtils.normalizePath(raw)
}

function pathExists(raw: string, projectRoot?: string): boolean {
  try {
    const resolved = resolvePath(raw, projectRoot)
    return PathUtils.existsSync(resolved) && statSync(resolved).isFile()
  } catch {
    return false
  }
}

function hasValidExtension(p: string, extensions: string[]): boolean {
  return extensions.some(ext => PathUtils.hasExtension(p, ext))
}

function cleanPath(raw: string): string {
  return raw.replace(/^[\s@`"'<([]+/, '').replace(/[\s`"'>)\],;.]+$/, '')
}

// ── Regex patterns ────────────────────────────────────────────────────────

/**
 * Build a regex matching file paths with known extensions in free text.
 *
 * Uses simple string concatenation (NOT template literals) to avoid
 * double-escaping issues with backslashes in the character classes.
 */
function buildPathRegex(extensions: string[]): RegExp {
  const exts = extensions.map(e => e.slice(1)).join('|')
  const before = '(?:^|[\\s\'"`(<\\[])'
  const dir = '(?:[./\\w@_-]+/)*'
  const file = '[\\w@_-]+\\.(?:'
  const after = '(?=[\\s\'"`>),;.\\]\\n]|$)'
  return new RegExp(`${before}(${dir}${file}${exts}))${after}`, 'g')
}

/**
 * Build a regex matching file:line citations like `foo.ts:42`.
 */
function buildCitationRegex(extensions: string[]): RegExp {
  const exts = extensions.map(e => e.slice(1)).join('|')
  const dir = '(?:[./\\w@_-]+/)*'
  const file = '[\\w@_-]+\\.(?:'
  return new RegExp(`(${dir}${file}${exts})):(\\d+)(?:[\\s-]*(\\d+))?`, 'g')
}

// ── Text scanning ─────────────────────────────────────────────────────────

export function detectPathsInText(text: string, options: DetectorOptions = {}): FileReference[] {
  if (!text) return []

  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const validate = options.validateExistence ?? true
  const projectRoot = options.projectRoot
  const seen = new Set<string>()
  const results: FileReference[] = []

  // Citation regex first (more specific)
  const citeRe = buildCitationRegex(extensions)
  for (const match of text.matchAll(citeRe)) {
    const raw = cleanPath(match[1])
    const startLine = Number.parseInt(match[2], 10)
    const endLine = match[3] ? Number.parseInt(match[3], 10) : startLine
    if (!raw || raw.length < 3 || seen.has(raw)) continue
    seen.add(raw)
    if (validate && !pathExists(raw, projectRoot)) continue
    results.push({
      path: resolvePath(raw, projectRoot),
      startLine: Number.isFinite(startLine) && startLine > 0 ? startLine : undefined,
      endLine: Number.isFinite(endLine) && endLine >= startLine ? endLine : undefined,
    })
  }

  // Path regex second
  const pathRe = buildPathRegex(extensions)
  for (const match of text.matchAll(pathRe)) {
    const raw = cleanPath(match[1])
    if (!raw || raw.length < 3 || seen.has(raw)) continue
    seen.add(raw)
    if (validate && !pathExists(raw, projectRoot)) continue
    results.push({ path: resolvePath(raw, projectRoot) })
  }

  for (const err of detectCompilerErrorLocations(text, options)) {
    const key = `${err.path}:${err.startLine}:${err.startColumn}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      path: err.path,
      startLine: err.startLine,
      endLine: err.startLine,
      startColumn: err.startColumn,
    })
  }

  return results
}

// ── Tool call scanning ────────────────────────────────────────────────────

const FILE_TOOLS = new Set(['read', 'write', 'edit', 'bash', 'grep', 'search', 'ripgrep', 'fd', 'fzf'])

const FILE_PATH_KEYS = new Set(['path', 'filePath', 'file', 'target', 'destination', 'source', 'src', 'dst'])

export function detectPathsInToolCall(
  toolName: string,
  input: Record<string, unknown> | undefined,
  options: DetectorOptions = {}
): FileReference[] {
  if (!input || !FILE_TOOLS.has(toolName)) return []

  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const projectRoot = options.projectRoot
  const results: FileReference[] = []
  const seen = new Set<string>()

  function add(raw: string): void {
    const cleaned = cleanPath(raw)
    if (!cleaned || cleaned.length < 2 || seen.has(cleaned)) return
    seen.add(cleaned)
    const resolved = resolvePath(cleaned, projectRoot)
    if (hasValidExtension(resolved, extensions)) {
      results.push({ path: resolved })
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (FILE_PATH_KEYS.has(key) && typeof value === 'string') {
      add(value)
    }
  }

  if (toolName === 'bash' && typeof input.command === 'string') {
    const paths = detectPathsInText(input.command, {
      ...options,
      extensions,
      validateExistence: false,
    })
    for (const p of paths) {
      if (!seen.has(p.path)) {
        seen.add(p.path)
        results.push(p)
      }
    }
  }

  return results
}

// ── Tool output scanning ──────────────────────────────────────────────────

export function detectPathsInOutput(
  _toolName: string,
  content: unknown,
  options: DetectorOptions = {}
): FileReference[] {
  if (!content) return []

  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((c): c is { type: string; text?: string } => typeof c === 'object' && c !== null)
            .map(c => c.text ?? '')
            .join('\n')
        : ''

  return text ? detectPathsInText(text, options) : []
}

// ── Combined message scan ─────────────────────────────────────────────────

export function detectPathsInMessage(
  message: {
    role?: string
    content?: unknown
    toolName?: string
    input?: Record<string, unknown>
  },
  options: DetectorOptions = {}
): FileReference[] {
  const results: FileReference[] = []

  if (message.role === 'user' || message.role === 'assistant') {
    const text =
      typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((c): c is { type: string; text?: string } => typeof c === 'object' && c !== null)
              .map(c => c.text ?? '')
              .join(' ')
          : ''
    if (text) results.push(...detectPathsInText(text, options))
  }

  if (message.toolName && message.input) {
    results.push(...detectPathsInToolCall(message.toolName, message.input, options))
  }

  if (message.role === 'toolResult' && message.content) {
    results.push(...detectPathsInOutput(message.toolName ?? '', message.content, options))
  }

  return results
}
