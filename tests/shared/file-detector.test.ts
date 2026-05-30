import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectPathsInMessage,
  detectPathsInOutput,
  detectPathsInText,
  detectPathsInToolCall,
} from '../../shared/file-detector.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-detect-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeFileAt(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

// ── detectPathsInText ─────────────────────────────────────────────────────

describe('detectPathsInText', () => {
  it('detects relative paths with extension', () => {
    const results = detectPathsInText('Check src/foo.ts', { projectRoot: '/project', validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('foo.ts')
  })

  it('detects absolute paths', () => {
    const results = detectPathsInText('Check /home/user/src/main.py', { validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('main.py')
  })

  it('detects paths in code fences', () => {
    const results = detectPathsInText('```\n// src/bar.rs\n```', { validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('bar.rs')
  })

  it('detects line citations (file.ts:42)', () => {
    const results = detectPathsInText('Error at src/app.ts:42', { validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].startLine).toBe(42)
  })

  it('detects line range citations (file.ts:42-50)', () => {
    const results = detectPathsInText('See src/app.ts:42-50', { validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].startLine).toBe(42)
    expect(results[0].endLine).toBe(50)
  })

  it('validates file existence when enabled', async () => {
    await writeFileAt('src/exists.ts', 'export const x = 1')
    const results = detectPathsInText('Check src/exists.ts and src/missing.ts', {
      projectRoot: tmpDir,
      validateExistence: true,
    })
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('exists.ts')
  })

  it('returns empty array for text with no paths', () => {
    const results = detectPathsInText('Hello, how are you?', { validateExistence: false })
    expect(results).toHaveLength(0)
  })

  it('uses custom extensions when provided', () => {
    const results = detectPathsInText('Check file.go', {
      extensions: ['.go'],
      validateExistence: false,
    })
    expect(results).toHaveLength(1)
  })

  it('ignores paths without known extensions', () => {
    const results = detectPathsInText('Check file.txt', { validateExistence: false })
    expect(results).toHaveLength(0)
  })
})

// ── detectPathsInToolCall ─────────────────────────────────────────────────

describe('detectPathsInToolCall', () => {
  it('detects path from read tool', () => {
    const results = detectPathsInToolCall(
      'read',
      { path: 'src/foo.ts' },
      { projectRoot: '/p', validateExistence: false }
    )
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('foo.ts')
  })

  it('detects path from edit tool', () => {
    const results = detectPathsInToolCall(
      'edit',
      { path: 'src/bar.ts' },
      { projectRoot: '/p', validateExistence: false }
    )
    expect(results).toHaveLength(1)
  })

  it('detects paths from bash command string', () => {
    const results = detectPathsInToolCall(
      'bash',
      { command: 'cat src/foo.ts' },
      { projectRoot: '/p', validateExistence: false }
    )
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.path.includes('foo.ts'))).toBe(true)
  })

  it('returns empty for non-file tools', () => {
    const results = detectPathsInToolCall('web_search', { query: 'hello' }, { projectRoot: '/p' })
    expect(results).toHaveLength(0)
  })
})

// ── detectPathsInOutput ───────────────────────────────────────────────────

describe('detectPathsInOutput', () => {
  it('detects paths in error-like output', () => {
    const text = 'src/main.ts:25: error: Cannot find name'
    const results = detectPathsInOutput('bash', text, { validateExistence: false })
    expect(results).toHaveLength(1)
    expect(results[0].path).toContain('main.ts')
  })

  it('extracts column from tsc compiler output', () => {
    const text = 'src/main.ts(25,8): error TS2304: Cannot find name'
    const results = detectPathsInOutput('bash', text, { validateExistence: false })
    expect(results.some(r => r.path.includes('main.ts') && r.startLine === 25 && r.startColumn === 7)).toBe(
      true
    )
  })

  it('detects paths from array content', () => {
    const results = detectPathsInOutput('bash', [{ type: 'text', text: 'Error in src/foo.ts' }], {
      validateExistence: false,
    })
    expect(results).toHaveLength(1)
  })

  it('returns empty for empty content', () => {
    const results = detectPathsInOutput('bash', '', { validateExistence: false })
    expect(results).toHaveLength(0)
  })
})

// ── detectPathsInMessage ──────────────────────────────────────────────────

describe('detectPathsInMessage', () => {
  it('scans user message text', () => {
    const results = detectPathsInMessage({ role: 'user', content: 'Edit src/foo.ts' }, { validateExistence: false })
    expect(results).toHaveLength(1)
  })

  it('scans tool call arguments', () => {
    const results = detectPathsInMessage(
      { role: 'assistant', toolName: 'read', input: { path: 'src/bar.ts' }, content: '' },
      { validateExistence: false }
    )
    expect(results).toHaveLength(1)
  })

  it('scans tool result output', () => {
    const results = detectPathsInMessage(
      { role: 'toolResult', toolName: 'bash', content: 'src/baz.ts:10: error' },
      { validateExistence: false }
    )
    expect(results).toHaveLength(1)
  })
})
