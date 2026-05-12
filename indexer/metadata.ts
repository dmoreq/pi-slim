/**
 * Metadata collection during index build
 *
 * Gathers information about the build process:
 * - Language coverage (how many files per language)
 * - Build timing
 * - Git information (commit, branch)
 * - Configuration snapshot
 */

import { execSync } from 'node:child_process'
import type { LanguageCoverage } from '../shared/schema-v2.js'
import type { RepoIndex } from '../shared/types.js'
import type { SlimConfig } from '../shared/types.js'

export interface BuildMetadata {
  buildDuration: number // milliseconds
  gitCommit?: string
  gitBranch?: string
  languages: Record<string, LanguageCoverage>
  config: {
    scanPatterns: string[]
    ignorePatterns: string[]
    languages: string[]
  }
}

/**
 * Collect metadata during index build
 */
export function collectMetadata(
  projectRoot: string,
  index: RepoIndex,
  config: SlimConfig,
  buildStartTime: number
): BuildMetadata {
  const buildDuration = Date.now() - buildStartTime

  // Collect git info
  let gitCommit: string | undefined
  let gitBranch: string | undefined

  try {
    gitCommit = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not a git repo
  }

  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not a git repo
  }

  // Analyze language coverage
  const languages: Record<string, LanguageCoverage> = {}
  const filesByLanguage: Record<string, Set<string>> = {}

  // Group files by language extension
  for (const filePath of index.skeletons.keys()) {
    const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown'

    // Map extensions to languages
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      kt: 'kotlin',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
    }

    const lang = langMap[ext] || ext

    if (!filesByLanguage[lang]) {
      filesByLanguage[lang] = new Set()
    }
    filesByLanguage[lang].add(filePath)
  }

  // Calculate stats per language
  for (const [lang, files] of Object.entries(filesByLanguage)) {
    const filePaths = Array.from(files)
    let symbolCount = 0
    let edgeCount = 0

    for (const filePath of filePaths) {
      // Count symbols
      const symbols = index.symbolIndex.get(filePath)
      if (symbols) {
        symbolCount += symbols.length
      }

      // Count edges
      const deps = index.deps.get(filePath)
      if (deps) {
        edgeCount += deps.size
      }
    }

    languages[lang] = {
      fileCount: filePaths.length,
      symbolCount,
      edgeCount,
    }
  }

  return {
    buildDuration,
    gitCommit: gitCommit || undefined,
    gitBranch: gitBranch || undefined,
    languages,
    config: {
      scanPatterns: config.exclude ? ['src/**', 'lib/**', 'index.ts'] : [],
      ignorePatterns: config.exclude || [],
      languages: Object.keys(languages),
    },
  }
}

/**
 * Format metadata for display
 */
export function formatMetadata(metadata: BuildMetadata): string {
  const lines: string[] = [`Build completed in ${metadata.buildDuration}ms`]

  if (metadata.gitCommit) {
    lines.push(`Git: ${metadata.gitCommit.slice(0, 7)}${metadata.gitBranch ? ` (${metadata.gitBranch})` : ''}`)
  }

  if (Object.keys(metadata.languages).length > 0) {
    lines.push('Languages:')
    for (const [lang, coverage] of Object.entries(metadata.languages)) {
      lines.push(`  ${lang}: ${coverage.fileCount} files, ${coverage.symbolCount} symbols, ${coverage.edgeCount} edges`)
    }
  }

  return lines.join('\n')
}
