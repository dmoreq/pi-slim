export interface FileIndex {
  path: string
  skeleton: string
  imports: string[]
  exports: string[]
  contentHash: string
}

export interface RepoIndex {
  skeletons: Map<string, string>
  deps: Map<string, Set<string>>
  reverseDeps: Map<string, Set<string>>
  symbolIndex: Map<string, string[]>
}

// ── Context Monitor Types (merged from context-intel) ──────────────────────

/** Token usage tracking for LLM context windows. */
export interface TokenUsage {
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  contextWindow: number
}

/** Session statistics for monitoring and reporting. */
export interface SessionStats {
  sessionId: string
  cwd: string
  startedAt: number
  messageCount: number
  turnCount: number
  toolCallCount: number
  bashCallCount: number
  prunedCount: number
  totalProcessed: number
  touchedFiles: string[]
  tokenUsage: TokenUsage | null
}

// ── Slim Config ────────────────────────────────────────────────────────────

export interface SlimConfig {
  enabled: boolean
  maxRepoMapTokens: number
  maxInjectionTokens: number
  scanLastNMessages: number
  dependencyDepth: number
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

  /** Context intelligence engine (workflow tips, risk, pattern hints). */
  intelligence: {
    enabled: boolean
    repeatWorkflowGuidance: boolean
  }
}

// Defaults and schema live in config/schema.ts — import from there

// ── Cache ──────────────────────────────────────────────────────────────────

export interface CacheFile {
  version: number
  entries: Record<string, FileIndex>
}

export const CACHE_VERSION = 1
