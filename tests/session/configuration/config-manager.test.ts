import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigManager } from '../../../session/configuration/config-manager.js'
import * as fs from 'node:fs/promises'

vi.mock('node:fs/promises')

describe('ConfigManager', () => {
  let configManager: ConfigManager

  beforeEach(() => {
    configManager = new ConfigManager()
    vi.clearAllMocks()
  })

  it('should load default config when no file exists', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('File not found'))

    const config = await configManager.loadConfig('/test')

    expect(config).toEqual({
      projectRoot: '/test',
      enabled: true,
      maxTokens: 4000,
      plugins: [],
      excludePatterns: [],
    })
  })

  it('should load config from file when it exists', async () => {
    const mockConfig = { projectRoot: '/test', enabled: false, maxTokens: 8000 }
    vi.mocked(fs.access).mockResolvedValue(undefined as void)
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig))

    const config = await configManager.loadConfig('/test')

    expect(config).toEqual({
      projectRoot: '/test',
      enabled: false,
      maxTokens: 8000,
      plugins: [],
      excludePatterns: [],
    })
  })

  it('should validate and normalize config', async () => {
    const mockConfig = {
      projectRoot: '/test',
      enabled: 'true',
      maxTokens: '8000',
      plugins: 'plugin1',
      extraField: 'ignored',
    }
    vi.mocked(fs.access).mockResolvedValue(undefined as void)
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig))

    const config = await configManager.loadConfig('/test')

    expect(config).toEqual({
      projectRoot: '/test',
      enabled: true,
      maxTokens: 4000,
      plugins: [],
      excludePatterns: [],
    })
  })

  it('should handle malformed JSON gracefully', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined as void)
    vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }')

    const config = await configManager.loadConfig('/test')

    expect(config).toEqual({
      projectRoot: '/test',
      enabled: true,
      maxTokens: 4000,
      plugins: [],
      excludePatterns: [],
    })
  })

  it('should cache loaded config', async () => {
    const mockConfig = { projectRoot: '/test', enabled: true, maxTokens: 6000 }
    vi.mocked(fs.access).mockResolvedValue(undefined as void)
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig))

    await configManager.loadConfig('/test')
    const cachedConfig = configManager.getConfig()

    expect(cachedConfig).toEqual({
      projectRoot: '/test',
      enabled: true,
      maxTokens: 6000,
      plugins: [],
      excludePatterns: [],
    })
  })

  it('should return null when no config loaded', () => {
    const config = configManager.getConfig()
    expect(config).toBe(null)
  })

  it('should handle config with all fields', async () => {
    const fullConfig = {
      projectRoot: '/test',
      enabled: false,
      maxTokens: 10000,
      plugins: ['plugin1', 'plugin2'],
      excludePatterns: ['*.test.ts', '*.spec.js'],
    }
    vi.mocked(fs.access).mockResolvedValue(undefined as void)
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fullConfig))

    const config = await configManager.loadConfig('/test')

    expect(config).toEqual(fullConfig)
  })
})
