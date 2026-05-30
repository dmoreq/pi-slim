/**
 * Compiler / linter error location extraction from tool output text.
 *
 * Supports common TypeScript (tsc), ESLint-style, and Rust (rustc) formats.
 * Line numbers in returned refs are 1-based (human); startColumn is 0-based (LSP).
 */

import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { PathUtils } from './utils/path-utils.js'
import type { DetectorOptions } from './file-detector.js'
import { DEFAULT_EXTENSIONS } from './file-detector.js'

export interface CompilerErrorLocation {
  path: string
  /** 1-based line (matches compiler output) */
  startLine: number
  /** 0-based column for LSP */
  startColumn: number
  message?: string
}

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

function cleanPath(raw: string): string {
  return raw.replace(/^[\s@`"'<([]+/, '').replace(/[\s`"'>)\],;.]+$/, '')
}

function buildFileGroup(extensions: string[]): string {
  const exts = extensions.map(e => e.slice(1)).join('|')
  const dir = '(?:[./\\w@_-]+/)*'
  return `${dir}[\\w@_-]+\\.(?:${exts})`
}

/**
 * TypeScript: `src/foo.ts(12,5): error TS2304: ...`
 * ESLint/tsc alt: `src/foo.ts:12:5 - error ...`
 * Rust: ` --> src/foo.rs:12:5`
 */
export function detectCompilerErrorLocations(
  text: string,
  options: DetectorOptions = {}
): CompilerErrorLocation[] {
  if (!text) return []

  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const validate = options.validateExistence ?? false
  const projectRoot = options.projectRoot
  const file = buildFileGroup(extensions)
  const seen = new Set<string>()
  const results: CompilerErrorLocation[] = []

  const patterns: Array<{ re: RegExp; lineIdx: number; colIdx: number; msgIdx?: number }> = [
    {
      re: new RegExp(`(${file})\\((\\d+),(\\d+)\\):\\s*(?:error|warning)[^\\n]*`, 'gi'),
      lineIdx: 2,
      colIdx: 3,
    },
    {
      re: new RegExp(`(${file}):(\\d+):(\\d+)\\s*-\\s*(?:error|warning)[^\\n]*`, 'gi'),
      lineIdx: 2,
      colIdx: 3,
    },
    {
      re: new RegExp(`-->\\s+(${file}):(\\d+):(\\d+)`, 'g'),
      lineIdx: 2,
      colIdx: 3,
    },
    {
      re: new RegExp(`(${file}):(\\d+):(\\d+):\\s*(?:error|warning)`, 'gi'),
      lineIdx: 2,
      colIdx: 3,
    },
  ]

  for (const { re, lineIdx, colIdx } of patterns) {
    for (const match of text.matchAll(re)) {
      const raw = cleanPath(match[1])
      const line1 = Number.parseInt(match[lineIdx], 10)
      const col1 = Number.parseInt(match[colIdx], 10)
      if (!raw || !Number.isFinite(line1) || line1 < 1 || !Number.isFinite(col1) || col1 < 0) continue

      const key = `${raw}:${line1}:${col1}`
      if (seen.has(key)) continue
      seen.add(key)

      if (validate && !pathExists(raw, projectRoot)) continue

      results.push({
        path: resolvePath(raw, projectRoot),
        startLine: line1,
        startColumn: Math.max(0, col1 - 1),
      })
    }
  }

  return results
}
