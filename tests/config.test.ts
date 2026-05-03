import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../src/config.js'
import { SmartContextConfigSchema } from '../src/config/schema.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-config-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeProjectConfig(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tmpDir)
    expect(config.enabled).toBe(true)
    expect(config.maxRepoMapTokens).toBe(4000)
    expect(config.maxInjectionTokens).toBe(8000)
    expect(config.contextFiles.enabled).toBe(true)
    expect(config.contextFiles.filenames).toEqual(['AGENTS.local.md', 'CLAUDE.local.md'])
    expect(config.providerGuidance.enabled).toBe(true)
  })

  it('reads project-local .pi/smart-context.jsonc', async () => {
    await writeProjectConfig(
      '.pi/smart-context.jsonc',
      JSON.stringify({ maxRepoMapTokens: 6000, contextFiles: { enabled: false } }),
    )
    const config = loadConfig(tmpDir)
    expect(config.maxRepoMapTokens).toBe(6000)
    expect(config.contextFiles.enabled).toBe(false)
    // Unset fields still use defaults
    expect(config.maxInjectionTokens).toBe(8000)
    expect(config.providerGuidance.enabled).toBe(true)
  })

  it('handles JSONC with comments and trailing commas', async () => {
    await writeProjectConfig(
      '.pi/smart-context.jsonc',
      '{\n  // My config\n  "maxRepoMapTokens": 3000,\n  "exclude": ["**/vendor/**",],\n}',
    )
    const config = loadConfig(tmpDir)
    expect(config.maxRepoMapTokens).toBe(3000)
    expect(config.exclude).toContain('**/vendor/**')
  })

  it('applies CLI flag overrides on top of project config', async () => {
    await writeProjectConfig(
      '.pi/smart-context.jsonc',
      JSON.stringify({ maxRepoMapTokens: 5000, contextFiles: { enabled: false } }),
    )
    const config = loadConfig(tmpDir, {
      'smart-context.enabled': false,
      'smart-context.contextFiles.enabled': true,
    })
    // Flag overrides both defaults and project config
    expect(config.enabled).toBe(false)
    expect(config.contextFiles.enabled).toBe(true)
    // Project config still applies for un-overridden values
    expect(config.maxRepoMapTokens).toBe(5000)
  })

  it('validates config and throws on invalid values', async () => {
    await writeProjectConfig(
      '.pi/smart-context.jsonc',
      JSON.stringify({ maxRepoMapTokens: -1 }),
    )
    expect(() => loadConfig(tmpDir)).toThrow()
  })

  it('applies flag overrides on top of defaults alone', () => {
    const config = loadConfig(tmpDir, {
      'smart-context.enabled': false,
      'smart-context.maxRepoMapTokens': 9999,
    })
    expect(config.enabled).toBe(false)
    expect(config.maxRepoMapTokens).toBe(9999)
  })
})

describe('SmartContextConfigSchema', () => {
  it('parses an empty object with all defaults', () => {
    const result = SmartContextConfigSchema.parse({})
    expect(result.enabled).toBe(true)
    expect(result.contextFiles.filenames).toContain('AGENTS.local.md')
    expect(result.providerGuidance.enabled).toBe(true)
  })

  it('merges partial nested objects', () => {
    const result = SmartContextConfigSchema.parse({
      contextFiles: { enabled: false },
    })
    expect(result.contextFiles.enabled).toBe(false)
    // Unset nested fields still default
    expect(result.contextFiles.filenames).toContain('AGENTS.local.md')
  })

  it('rejects negative integers', () => {
    expect(() =>
      SmartContextConfigSchema.parse({ maxInjectionTokens: -100 }),
    ).toThrow()
  })
})
