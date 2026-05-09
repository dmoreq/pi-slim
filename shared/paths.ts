/**
 * Unified path constants for the scope data directory.
 *
 * All persistence paths derive from `SCOPE_DIR` so a single
 * change propagates everywhere.
 */

import { join } from 'node:path'

/** Relative path from project root to the scope data directory. */
export const SCOPE_DIR = join('.pi', 'scope')

/** Absolute path to the scope data directory for a project. */
export function scopeDir(projectRoot: string): string {
  return join(projectRoot, SCOPE_DIR)
}
