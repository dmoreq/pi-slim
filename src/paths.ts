/**
 * Unified path constants for the smart-context data directory.
 *
 * All persistence paths derive from `SMART_CONTEXT_DIR` so a single
 * change propagates everywhere.
 */

import { join } from 'node:path'

/** Relative path from project root to the smart-context data directory. */
export const SMART_CONTEXT_DIR = join('.pi', 'smart-context')

/** Absolute path to the smart-context data directory for a project. */
export function smartContextDir(projectRoot: string): string {
  return join(projectRoot, SMART_CONTEXT_DIR)
}
