/**
 * Provider Guidance — load provider-specific guidance files (CLAUDE.md,
 * CODEX.md, GEMINI.md) based on the active model provider, for injection
 * into the system prompt.
 *
 * Ported from pi-me session-lifecycle/agent-guidance/agent-guidance.ts
 * ──────────────────────────────────────────────────────────────────────
 * Maps the model provider → filename(s), walks ancestor directories
 * (including the global agent dir) to discover matching files, and
 * deduplicates against AGENTS.md.
 *
 * Config overrides via ~/.pi/agent/agent-guidance.json:
 *   { "providers": { "anthropic": ["CUSTOM.md"] },
 *     "models": { "claude-sonnet-*": ["SONNET.md"] } }
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname, relative as relativePath } from 'node:path'
import { homedir } from 'node:os'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProviderGuidanceOptions {
  /** Whether to inject provider-specific guidance. */
  enabled: boolean
}

export interface ProviderGuidanceFile {
  /** Absolute path of the discovered file. */
  path: string
  /** File contents. */
  content: string
}

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_PROVIDER_GUIDANCE_OPTIONS: ProviderGuidanceOptions = {
  enabled: true,
}

// ── Provider file mapping ─────────────────────────────────────────────────

const PROVIDER_FILES: Record<string, string[]> = {
  anthropic: ['CLAUDE.md'],
  openai: ['CODEX.md'],
  'openai-codex': ['CODEX.md'],
  'github-copilot': ['CODEX.md'],
  google: ['GEMINI.md'],
  'google-gemini-cli': ['GEMINI.md'],
  'google-antigravity': ['GEMINI.md'],
  'google-vertex': ['GEMINI.md'],
}

// ── Config loading ────────────────────────────────────────────────────────

interface GuidanceConfig {
  providers?: Record<string, string[]>
  models?: Record<string, string[]>
}

function loadGuidanceConfig(agentDir: string): GuidanceConfig {
  const configPath = join(agentDir, 'agent-guidance.json')
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
}

// ── Glob matching ─────────────────────────────────────────────────────────

function globMatch(pattern: string, value: string): boolean {
  return new RegExp(`^${pattern.replace(/\*/g, '.*')}$`, 'i').test(value)
}

// ── Candidate file resolution ─────────────────────────────────────────────

function getCandidateFiles(
  modelId: string | undefined,
  provider: string,
  config: GuidanceConfig,
): string[] {
  // Model-specific patterns take priority
  if (modelId && config.models) {
    for (const [pattern, files] of Object.entries(config.models)) {
      if (globMatch(pattern, modelId)) return files
    }
  }
  // Then provider config, then defaults
  return config.providers?.[provider] ?? PROVIDER_FILES[provider] ?? []
}

// ── Deduplication ─────────────────────────────────────────────────────────

/**
 * Check whether a file should be loaded, avoiding duplication with
 * AGENTS.md which pi core already injects.
 */
function shouldLoad(dir: string, filename: string): boolean {
  const filePath = join(dir, filename)
  if (!existsSync(filePath)) return false

  const agentsPath = join(dir, 'AGENTS.md')
  const agentsExists = existsSync(agentsPath)
  const claudeExists = existsSync(join(dir, 'CLAUDE.md'))

  // What did core load? (prefers AGENTS.md, falls back to CLAUDE.md)
  const coreLoaded = agentsExists ? 'AGENTS.md' : claudeExists ? 'CLAUDE.md' : null
  if (coreLoaded === filename) return false

  // Skip if identical to AGENTS.md
  if (agentsExists) {
    try {
      const agentsContent = readFileSync(agentsPath, 'utf-8')
      const candidateContent = readFileSync(filePath, 'utf-8')
      if (agentsContent === candidateContent) return false
    } catch {
      // Proceed with loading
    }
  }

  return true
}

// ── Directory scan ────────────────────────────────────────────────────────

function getDirectories(cwd: string, agentDir: string): string[] {
  const dirs: string[] = []
  const seen = new Set<string>()

  // Global agent dir first (so global files appear first in the injected block)
  if (existsSync(agentDir)) {
    dirs.push(agentDir)
    seen.add(agentDir)
  }

  // Walk up from cwd to root
  let current = resolve(cwd)
  const ancestors: string[] = []
  while (true) {
    if (!seen.has(current)) {
      ancestors.unshift(current)
      seen.add(current)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  dirs.push(...ancestors)
  return dirs
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load provider guidance files for the given model provider.
 *
 * @param cwd      Current working directory
 * @param provider Model provider string (e.g. "anthropic", "openai")
 * @param modelId  Model ID (for glob-matching config overrides)
 * @returns Array of loaded files (path + content)
 */
export function loadProviderGuidance(
  cwd: string,
  provider: string,
  modelId?: string,
): ProviderGuidanceFile[] {
  const agentDir = join(homedir(), '.pi', 'agent')
  const config = loadGuidanceConfig(agentDir)
  const candidates = getCandidateFiles(modelId, provider, config)

  if (candidates.length === 0) return []

  const files: ProviderGuidanceFile[] = []

  for (const dir of getDirectories(cwd, agentDir)) {
    for (const filename of candidates) {
      if (shouldLoad(dir, filename)) {
        const filePath = join(dir, filename)
        try {
          files.push({ path: filePath, content: readFileSync(filePath, 'utf-8') })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  return files
}

/**
 * Format loaded provider guidance files into a section suitable for
 * system prompt injection.
 */
export function formatProviderGuidanceSection(files: ProviderGuidanceFile[]): string {
  if (files.length === 0) return ''

  const body = files
    .map((file) => `## ${file.path}\n\n${file.content}`)
    .join('\n\n')

  return `\n\n# Provider-Specific Context\n\n${body}\n`
}

/**
 * Build a startup notification message listing loaded provider guidance files.
 */
export function buildGuidanceNotification(files: ProviderGuidanceFile[], cwd: string): string {
  if (files.length === 0) return ''

  const paths = files
    .map((f) => {
      const rel = relativePath(cwd, f.path)
      return `  ${rel || f.path}`
    })
    .join('\n')

  return `[provider-guidance] ${files.length} file(s) loaded:\n${paths}`
}

// ── Internal helpers ──────────────────────────────────────────────────────
