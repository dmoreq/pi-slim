/**
 * Resolve whether LSP should run for a session based on config and PATH probes.
 */

import { formatLspSessionDisabledNotice, probeLspServers, type LspServerHealth } from './health.js'

export interface LspSessionResolution {
  /** Effective LSP for this session (config enabled and at least one server on PATH). */
  active: boolean
  health: LspServerHealth[]
  /** User-facing message when LSP was auto-disabled (notify + tools). */
  installSuggestion?: string
}

/**
 * When `configEnabled` is true but no server binaries are on PATH, returns `active: false`
 * so pi-scope skips LSP tools, steer, and spawn (no uncaughtException).
 */
export function resolveLspSession(configEnabled: boolean): LspSessionResolution {
  if (!configEnabled) {
    return { active: false, health: [] }
  }

  const health = probeLspServers()
  if (!health.some(h => h.available)) {
    return {
      active: false,
      health,
      installSuggestion: formatLspSessionDisabledNotice(health),
    }
  }

  return { active: true, health }
}
