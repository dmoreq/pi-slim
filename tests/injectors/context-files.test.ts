import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadContextFiles,
  formatContextSection,
  formatDisplayPath,
  buildStartupNotification,
} from '../../src/injectors/context-files.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-ctx-files-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeFileAt(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('loadContextFiles', () => {
  it('loads a single AGENTS.local.md from cwd', async () => {
    await writeFileAt('AGENTS.local.md', 'Use tabs, not spaces.')
    const files = loadContextFiles(tmpDir, { filenames: ['AGENTS.local.md'] })
    expect(files).toHaveLength(1)
    expect(files[0].content).toBe('Use tabs, not spaces.')
  })

  it('loads files from ancestor directories', async () => {
    await writeFileAt('AGENTS.local.md', 'Root policy.')
    const subdir = join(tmpDir, 'src', 'deep')
    await mkdir(subdir, { recursive: true })
    await writeFile(join(subdir, 'CLAUDE.local.md'), 'Project rules.')

    const files = loadContextFiles(subdir, { filenames: ['AGENTS.local.md', 'CLAUDE.local.md'] })
    expect(files).toHaveLength(2)
    const contents = files.map(f => f.content)
    expect(contents).toContain('Root policy.')
    expect(contents).toContain('Project rules.')
  })

  it('returns empty array when no files exist', async () => {
    const files = loadContextFiles(tmpDir, { filenames: ['NONEXISTENT.md'] })
    expect(files).toHaveLength(0)
  })

  it('skips directories that match context file names', async () => {
    await mkdir(join(tmpDir, 'CLAUDE.local.md'), { recursive: true })
    const files = loadContextFiles(tmpDir, { filenames: ['CLAUDE.local.md'] })
    expect(files).toHaveLength(0)
  })

  it('uses default filenames when options omitted', async () => {
    await writeFileAt('AGENTS.local.md', 'Default policy.')
    const files = loadContextFiles(tmpDir)
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files[0].content).toBe('Default policy.')
  })
})

describe('formatContextSection', () => {
  it('formats a single file into a section', () => {
    const result = formatContextSection(
      [{ path: '/project/AGENTS.local.md', content: 'Use tabs.' }],
      { sectionTitle: 'Extra Context Files' },
    )
    expect(result).toContain('# Extra Context Files')
    expect(result).toContain('## /project/AGENTS.local.md')
    expect(result).toContain('Use tabs.')
  })

  it('returns empty string for empty files array', () => {
    expect(formatContextSection([])).toBe('')
  })

  it('joins multiple files with blank lines', () => {
    const result = formatContextSection([
      { path: '/a/1.md', content: 'One' },
      { path: '/b/2.md', content: 'Two' },
    ])
    expect(result).toContain('## /a/1.md')
    expect(result).toContain('## /b/2.md')
    // Files should be separated by blank lines
    const sections = result.split('## /')
    expect(sections.length).toBe(3) // preamble + 2 files
  })
})

describe('formatDisplayPath', () => {
  it('returns relative path when file is under cwd', () => {
    const result = formatDisplayPath('/project/src/file.md', '/project')
    expect(result).toBe('src/file.md')
  })

  it('returns absolute path when file is outside cwd', () => {
    const result = formatDisplayPath('/other/file.md', '/project')
    expect(result).toBe('/other/file.md')
  })
})

describe('buildStartupNotification', () => {
  it('builds notification message with file paths', () => {
    const result = buildStartupNotification(
      [{ path: '/project/AGENTS.local.md', content: 'rules' }],
      '/project',
    )
    expect(result).toContain('1 file(s)')
    expect(result).toContain('AGENTS.local.md')
  })

  it('returns empty string for empty files', () => {
    expect(buildStartupNotification([], '/project')).toBe('')
  })
})
