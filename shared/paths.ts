/**
 * Unified path constants for the scope data directory.
 *
 * All persistence paths derive from `SCOPE_DIR` so a single
 * change propagates everywhere.
 */

import { PathUtils } from './utils/path-utils.js'

/** Relative path from project root to the scope data directory. */
export const SCOPE_DIR = PathUtils.joinSafe('.pi', 'pi-scope')

/** Absolute path to the scope data directory for a project. */
export function scopeDir(projectRoot: string): string {
  return PathUtils.joinSafe(projectRoot, SCOPE_DIR)
}
