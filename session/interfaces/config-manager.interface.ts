import type { SessionConfig } from './state-manager.interface.js'

export interface ConfigManager {
  loadConfig(projectRoot: string): Promise<SessionConfig>
  getConfig(): SessionConfig | null
  validateConfig(config: unknown): SessionConfig
}
