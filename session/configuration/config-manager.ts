import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionConfig } from '../interfaces/state-manager.interface.js'
import type { ConfigManager as IConfigManager } from '../interfaces/config-manager.interface.js'

export class ConfigManager implements IConfigManager {
  private currentConfig: SessionConfig | null = null

  async loadConfig(projectRoot: string): Promise<SessionConfig> {
    const configPath = join(projectRoot, '.pi-scope.json')

    try {
      await access(configPath)
      const configContent = await readFile(configPath, 'utf-8')
      const rawConfig = JSON.parse(configContent) as unknown
      this.currentConfig = this.validateConfig(rawConfig)
    } catch {
      this.currentConfig = this.getDefaultConfig(projectRoot)
    }

    return this.currentConfig
  }

  getConfig(): SessionConfig | null {
    return this.currentConfig
  }

  validateConfig(config: unknown): SessionConfig {
    const c = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}

    return {
      projectRoot: typeof c.projectRoot === 'string' ? c.projectRoot : '',
      enabled: normalizeEnabled(c.enabled),
      maxTokens: normalizeMaxTokens(c.maxTokens),
      plugins: Array.isArray(c.plugins) ? c.plugins.filter((p): p is string => typeof p === 'string') : [],
      excludePatterns: Array.isArray(c.excludePatterns)
        ? c.excludePatterns.filter((p): p is string => typeof p === 'string')
        : [],
    }
  }

  private getDefaultConfig(projectRoot: string): SessionConfig {
    return {
      projectRoot,
      enabled: true,
      maxTokens: 4000,
      plugins: [],
      excludePatterns: [],
    }
  }
}

function normalizeEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return true
}

function normalizeMaxTokens(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 4000
}
