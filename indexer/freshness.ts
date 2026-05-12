/**
 * Freshness checking for cached indices
 *
 * Detects if an index is stale by checking:
 * 1. Age (how long since it was built)
 * 2. Git commit (if code has changed)
 * 3. File modification times (if specific files changed)
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { StoredIndexV2 } from '../shared/schema-v2.js'
import { PathUtils } from '../shared/utils/path-utils.js'

export interface StalenessResult {
  stale: boolean
  reasons: string[]
  severity: 'none' | 'warning' | 'critical'
}

export async function checkIndexFreshness(
  projectRoot: string,
  storedIndex: StoredIndexV2,
  options?: {
    maxAgeHours?: number
    checkGit?: boolean
    checkFiles?: boolean
  }
): Promise<StalenessResult> {
  const { maxAgeHours = 24, checkGit = true, checkFiles = true } = options ?? {}
  const reasons: string[] = []

  // Check 1: Age-based staleness
  const builtAt = new Date(storedIndex.builtAt).getTime()
  const ageHours = (Date.now() - builtAt) / (1000 * 60 * 60)

  if (ageHours > maxAgeHours) {
    reasons.push(`Index is ${ageHours.toFixed(1)} hours old (max ${maxAgeHours})`)
  }

  // Check 2: Git commit changed (if available)
  if (checkGit && storedIndex.gitCommit) {
    try {
      const currentCommit = getGitCommit(projectRoot)
      if (currentCommit && currentCommit !== storedIndex.gitCommit) {
        reasons.push(`Git commit changed (was ${storedIndex.gitCommit.slice(0, 7)}, now ${currentCommit.slice(0, 7)})`)
      }
    } catch {
      // Not a git repo or git not available, skip
    }
  }

  // Check 3: File modification times (if we have checksums)
  if (checkFiles && Object.keys(storedIndex.checksums.files).length > 0) {
    try {
      const changedFiles = await detectChangedFiles(projectRoot, storedIndex.checksums.files)
      if (changedFiles.length > 0) {
        reasons.push(
          `${changedFiles.length} files changed since index (${changedFiles.slice(0, 3).join(', ')}${changedFiles.length > 3 ? '...' : ''})`
        )
      }
    } catch {
      // Error checking files, continue without this check
    }
  }

  const stale = reasons.length > 0
  const severity = ageHours > maxAgeHours * 2 ? 'critical' : stale ? 'warning' : 'none'

  return { stale, reasons, severity }
}

/**
 * Get current git commit hash (or branch if detached)
 */
export function getGitCommit(projectRoot: string): string | null {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    return commit || null
  } catch {
    return null
  }
}

/**
 * Get current git branch
 */
export function getGitBranch(projectRoot: string): string | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    return branch || null
  } catch {
    return null
  }
}

/**
 * Compute SHA256 hash of a file (for staleness detection)
 */
async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

/**
 * Detect which files have changed since index was built
 */
async function detectChangedFiles(projectRoot: string, storedHashes: Record<string, string>): Promise<string[]> {
  const changed: string[] = []

  for (const [filePath, storedHash] of Object.entries(storedHashes)) {
    const fullPath = PathUtils.joinSafe(projectRoot, filePath)
    const currentHash = await hashFile(fullPath)

    if (currentHash && currentHash !== storedHash) {
      changed.push(filePath)
    }
  }

  return changed
}

/**
 * Build checksums for current state (called during index build)
 */
export async function buildChecksums(projectRoot: string, filePaths: string[]): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {}

  // Only hash a sample of files to avoid slowing down build
  const sampleSize = Math.min(filePaths.length, 100)
  const sampleIndices = Array.from({ length: sampleSize }, (_, i) => Math.floor((i * filePaths.length) / sampleSize))

  for (const idx of sampleIndices) {
    const filePath = filePaths[idx]
    const fullPath = PathUtils.joinSafe(projectRoot, filePath)
    checksums[filePath] = await hashFile(fullPath)
  }

  return checksums
}

/**
 * Format freshness result for user display
 */
export function formatStalenessResult(result: StalenessResult, builtAt: string): string {
  if (!result.stale) {
    return `✅ Fresh (${new Date(builtAt).toLocaleString()})`
  }

  const iconMap: Record<string, string> = {
    none: '✅',
    warning: '⚠️',
    critical: '🔴',
  }

  const lines = [`${iconMap[result.severity]} Index may be stale:`, ...result.reasons.map(r => `  • ${r}`)]

  return lines.join('\n')
}
