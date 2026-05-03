/**
 * Unified path constants for the slim data directory.
 *
 * All persistence paths derive from `SLIM_DIR` so a single
 * change propagates everywhere.
 */

import { join } from 'node:path'

/** Relative path from project root to the slim data directory. */
export const SLIM_DIR = join('.pi', 'slim')

/** Absolute path to the slim data directory for a project. */
export function slimDir(projectRoot: string): string {
  return join(projectRoot, SLIM_DIR)
}
