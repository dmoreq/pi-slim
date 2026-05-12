import { existsSync, realpathSync } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PathUtilsInterface } from '../interfaces/path-utils.interface.js'

export class PathUtils implements PathUtilsInterface {
  private static readonly SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'])

  private static readonly TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__/]

  static normalizePath(p: string): string {
    if (p === '') return ''
    return path.posix.normalize(p.replace(/\\/g, '/'))
  }

  static ensureAbsolute(targetPath: string, workspaceRoot: string): string {
    if (path.isAbsolute(targetPath)) {
      return targetPath
    }
    return path.resolve(workspaceRoot, targetPath)
  }

  static makeRelative(absolutePath: string, workspaceRoot: string): string {
    return PathUtils.normalizePath(path.relative(workspaceRoot, absolutePath))
  }

  static async exists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  static existsSync(targetPath: string): boolean {
    return existsSync(targetPath)
  }

  static async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await stat(targetPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  static getExtension(targetPath: string): string {
    return path.extname(targetPath)
  }

  static hasExtension(targetPath: string, extensions: string | string[]): boolean {
    const ext = PathUtils.getExtension(targetPath)
    const exts = Array.isArray(extensions) ? extensions : [extensions]
    return exts.includes(ext)
  }

  static isSourceFile(targetPath: string): boolean {
    const ext = PathUtils.getExtension(targetPath)
    return PathUtils.SOURCE_EXTENSIONS.has(ext)
  }

  static isTestFile(targetPath: string): boolean {
    return PathUtils.TEST_PATTERNS.some(pattern => pattern.test(targetPath))
  }

  static getDirectories(paths: string[]): string[] {
    const directories = new Set<string>()

    for (const filePath of paths) {
      const dir = path.dirname(filePath)
      if (dir !== '.') {
        directories.add(PathUtils.normalizePath(dir))
      }
    }

    return Array.from(directories).sort()
  }

  static joinSafe(...segments: string[]): string {
    return PathUtils.normalizePath(path.join(...segments))
  }

  normalizePath = PathUtils.normalizePath
  ensureAbsolute = PathUtils.ensureAbsolute
  makeRelative = PathUtils.makeRelative
  exists = PathUtils.exists
  existsSync = PathUtils.existsSync
  isDirectory = PathUtils.isDirectory
  getExtension = PathUtils.getExtension
  hasExtension = PathUtils.hasExtension
  isSourceFile = PathUtils.isSourceFile
  isTestFile = PathUtils.isTestFile
  getDirectories = PathUtils.getDirectories
  joinSafe = PathUtils.joinSafe
}

// ── LSP Path Utilities (from lsp/path-utils.ts) ────────────────────────────

/**
 * Normalize a file path for consistent Map key usage.
 * On Windows: resolves to canonical filesystem casing.
 * On non-Windows: returns path as-is with forward slashes.
 */
export function normalizeFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\\\/g, '/')

  if (process.platform !== 'win32' && !/^[A-Za-z]:/.test(normalized)) {
    return normalized
  }

  try {
    const canonical = realpathSync.native(filePath)
    return canonical.replace(/\\\\/g, '/')
  } catch {
    try {
      return resolveNonExisting(filePath)
    } catch {
      const resolved = path.win32.normalize(path.win32.resolve(filePath))
      return resolved.replace(/\\\\/g, '/').toLowerCase()
    }
  }
}

function resolveNonExisting(filePath: string): string {
  const resolved = path.win32.resolve(filePath)
  let current = resolved
  const nonExistentParts: string[] = []

  while (true) {
    if (PathUtils.existsSync(current)) {
      const canonical = realpathSync.native(current)
      if (nonExistentParts.length === 0) {
        return canonical.replace(/\\\\/g, '/')
      }
      const tail = nonExistentParts.reverse().join('/').toLowerCase()
      const base = canonical.replace(/\\\\/g, '/')
      return base.endsWith('/') ? base + tail : `${base}/${tail}`
    }

    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('No existing parent found')
    }

    nonExistentParts.push(path.win32.basename(current))
    current = parent
  }
}

/** Convert a file:// URI to a normalized path. */
export function uriToPath(uri: string): string {
  try {
    return normalizeFilePath(fileURLToPath(uri))
  } catch {
    return normalizeFilePath(uri)
  }
}

/** Convert a path to a file:// URI. */
export function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).href
}

/** Normalize a Map key lookup for file paths. */
export function normalizeMapKey(filePath: string): string {
  return normalizeFilePath(filePath)
}

/** Compare two file paths for equality. */
export function pathsEqual(a: string, b: string): boolean {
  return normalizeFilePath(a) === normalizeFilePath(b)
}

/** Check if `child` is under `parent` directory. */
export function isUnderDir(child: string, parent: string): boolean {
  const normChild = normalizeFilePath(child)
  const normParent = normalizeFilePath(parent)
  const parentPrefix = normParent.endsWith('/') ? normParent : `${normParent}/`
  return normChild === normParent || normChild.startsWith(parentPrefix)
}
