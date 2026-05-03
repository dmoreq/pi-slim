/**
 * Path utilities for LSP subsystem (adapted from pi-lens).
 *
 * Handles cross-platform path normalization, particularly
 * Windows case-insensitivity issues when using paths as Map keys.
 */

import { existsSync, realpathSync } from 'node:fs'
import { dirname, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Normalize a file path for consistent Map key usage.
 * On Windows: resolves to canonical filesystem casing.
 * On non-Windows: returns path as-is with forward slashes.
 */
export function normalizeFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')

  if (process.platform !== 'win32' && !/^[A-Za-z]:/.test(normalized)) {
    return normalized
  }

  try {
    const canonical = realpathSync.native(filePath)
    return canonical.replace(/\\/g, '/')
  } catch {
    try {
      return resolveNonExisting(filePath)
    } catch {
      const resolved = win32.normalize(win32.resolve(filePath))
      return resolved.replace(/\\/g, '/').toLowerCase()
    }
  }
}

function resolveNonExisting(filePath: string): string {
  const resolved = win32.resolve(filePath)
  let current = resolved
  const nonExistentParts: string[] = []

  while (true) {
    if (existsSync(current)) {
      const canonical = realpathSync.native(current)
      if (nonExistentParts.length === 0) {
        return canonical.replace(/\\/g, '/')
      }
      const tail = nonExistentParts.reverse().join('/').toLowerCase()
      const base = canonical.replace(/\\/g, '/')
      return base.endsWith('/') ? base + tail : `${base}/${tail}`
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error('No existing parent found')
    }

    nonExistentParts.push(win32.basename(current))
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
