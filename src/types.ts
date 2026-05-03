export interface FileIndex {
  path: string
  skeleton: string
  imports: string[]
  contentHash: string
}

export interface RepoIndex {
  skeletons: Map<string, string>
  deps: Map<string, Set<string>>
  reverseDeps: Map<string, Set<string>>
}

export interface SlimConfig {
  enabled: boolean
  maxRepoMapTokens: number
  maxInjectionTokens: number
  scanLastNMessages: number
  exclude: string[]

  /** Context files (AGENTS.local.md, CLAUDE.md, etc.) injected into system prompt. */
  contextFiles: {
    enabled: boolean
    /** Filenames to search for at every ancestor directory level. */
    filenames: string[]
    /** Section title in the injected block. */
    sectionTitle: string
  }

  /**
   * Provider-specific guidance files (CLAUDE.md, CODEX.md, GEMINI.md)
   * injected based on the active model provider.
   */
  providerGuidance: {
    enabled: boolean
  }
}

// Defaults and schema live in config/schema.ts — import from there

// ── Cache ──────────────────────────────────────────────────────────────────

export interface CacheFile {
  version: number
  entries: Record<string, FileIndex>
}

export const CACHE_VERSION = 1
