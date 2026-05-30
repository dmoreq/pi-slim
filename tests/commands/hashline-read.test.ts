import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatHashlineRead } from '../../commands/hashline-read.js'
import { initHash } from '../../hashline/line-hash.js'

describe('formatHashlineRead', () => {
  let root: string

  beforeEach(async () => {
    await initHash()
    root = join(tmpdir(), `pi-scope-hashline-read-${Date.now()}`)
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'sample.ts'), 'export const x = 1\nexport const y = 2\n')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns usage when path is empty', async () => {
    const out = await formatHashlineRead(root, '')
    expect(out).toContain('Usage: /hashline-read')
  })

  it('formats file with hashline anchors', async () => {
    const out = await formatHashlineRead(root, 'src/sample.ts', { recordOnRead: false })
    expect(out).toContain('## Hashline read: src/sample.ts')
    expect(out).toContain('hashline_edit')
    expect(out).toMatch(/\d+[a-z]{2}\|/)
  })

  it('formats line range when startLine and endLine set', async () => {
    const out = await formatHashlineRead(root, 'src/sample.ts', {
      startLine: 1,
      endLine: 1,
      recordOnRead: false,
    })
    expect(out).toMatch(/lines 1–1 of \d+/)
    expect(out).toContain('const x = 1')
  })

  it('reports missing file', async () => {
    const out = await formatHashlineRead(root, 'missing.ts')
    expect(out).toContain('Could not read file')
  })

  it('streams anchors when slice exceeds threshold', async () => {
    const bigPath = join(root, 'src', 'big.ts')
    const lines = Array.from({ length: 120 }, (_, i) => `export const v${i} = ${i}`)
    await writeFile(bigPath, lines.join('\n') + '\n')

    const out = await formatHashlineRead(root, 'src/big.ts', {
      recordOnRead: false,
      streamAnnotateThresholdLines: 100,
      streamChunkLines: 40,
    })
    expect(out).toContain('streamed in')
    expect(out).toMatch(/\d+[a-z]{2}\|/)
    expect(out).toContain('export const v0')
    expect(out).toContain('export const v119')
  })
})
