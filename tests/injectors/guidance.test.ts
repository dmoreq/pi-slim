import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadProviderGuidance,
  formatProviderGuidanceSection,
  buildGuidanceNotification,
} from '../../context/guidance.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-prov-guid-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeFileAt(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('loadProviderGuidance', () => {
  it('loads CLAUDE.md for anthropic provider from cwd', async () => {
    // AGENTS.md must exist so core is seen as loading it, not CLAUDE.md as fallback
    await writeFileAt('AGENTS.md', 'Core rules.')
    await writeFileAt('CLAUDE.md', 'Always use tabs.')
    const files = loadProviderGuidance(tmpDir, 'anthropic')
    expect(files).toHaveLength(1)
    expect(files[0].content).toBe('Always use tabs.')
  })

  it('loads CODEX.md for openai provider', async () => {
    await writeFileAt('AGENTS.md', 'Core rules.')
    await writeFileAt('CODEX.md', 'Use async/await.')
    const files = loadProviderGuidance(tmpDir, 'openai')
    expect(files).toHaveLength(1)
    expect(files[0].content).toBe('Use async/await.')
  })

  it('loads GEMINI.md for google provider', async () => {
    await writeFileAt('AGENTS.md', 'Core rules.')
    await writeFileAt('GEMINI.md', 'Prefer batching.')
    const files = loadProviderGuidance(tmpDir, 'google')
    expect(files).toHaveLength(1)
    expect(files[0].content).toBe('Prefer batching.')
  })

  it('returns empty array for unknown provider', () => {
    const files = loadProviderGuidance(tmpDir, 'unknown-provider')
    expect(files).toHaveLength(0)
  })

  it('loads files from ancestor directories', async () => {
    await writeFileAt('AGENTS.md', 'Core rules.')
    await writeFileAt('CLAUDE.md', 'Root guidance.')
    const subdir = join(tmpDir, 'src', 'deep')
    await mkdir(subdir, { recursive: true })

    const files = loadProviderGuidance(subdir, 'anthropic')
    // Should find CLAUDE.md from tmpDir ancestor
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files.some(f => f.content === 'Root guidance.')).toBe(true)
  })

  it('skips files identical to AGENTS.md', async () => {
    const sharedContent = 'Be careful with rm -rf.'
    await writeFileAt('AGENTS.md', sharedContent)
    await writeFileAt('CLAUDE.md', sharedContent)
    const files = loadProviderGuidance(tmpDir, 'anthropic')
    // CLAUDE.md content matches AGENTS.md → should be deduplicated
    expect(files).toHaveLength(0)
  })

  it('loads CLAUDE.md when it differs from AGENTS.md', async () => {
    await writeFileAt('AGENTS.md', 'General rules.')
    await writeFileAt('CLAUDE.md', 'Claude-specific rules.')
    const files = loadProviderGuidance(tmpDir, 'anthropic')
    expect(files).toHaveLength(1)
    expect(files[0].content).toBe('Claude-specific rules.')
  })

  it('skips CLAUDE.md when AGENTS.md is absent (core fallback dedup)', async () => {
    // No AGENTS.md — pi core would load CLAUDE.md as fallback, so we skip it
    await writeFileAt('CLAUDE.md', 'Rules.')
    const files = loadProviderGuidance(tmpDir, 'anthropic')
    expect(files).toHaveLength(0)
  })
})

describe('formatProviderGuidanceSection', () => {
  it('formats files into a section', () => {
    const result = formatProviderGuidanceSection([
      { path: '/project/CLAUDE.md', content: 'Use tabs.' },
    ])
    expect(result).toContain('# Provider-Specific Context')
    expect(result).toContain('## /project/CLAUDE.md')
    expect(result).toContain('Use tabs.')
  })

  it('returns empty string for empty array', () => {
    expect(formatProviderGuidanceSection([])).toBe('')
  })
})

describe('buildGuidanceNotification', () => {
  it('builds notification with file count', () => {
    const result = buildGuidanceNotification(
      [{ path: join(tmpDir, 'CLAUDE.md'), content: 'rules' }],
      tmpDir,
    )
    expect(result).toContain('1 file(s)')
    expect(result).toContain('CLAUDE.md')
  })

  it('returns empty string for empty files', () => {
    expect(buildGuidanceNotification([], '/project')).toBe('')
  })
})
