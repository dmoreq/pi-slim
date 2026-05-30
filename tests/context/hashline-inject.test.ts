import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildHashlineAnchorBlock, contentHasHashlineAnchors } from '../../context/hashline-inject.js'
import { initHash } from '../../hashline/line-hash.js'

describe('buildHashlineAnchorBlock', () => {
  let root: string
  let filePath: string

  beforeEach(async () => {
    await initHash()
    root = join(tmpdir(), `pi-scope-hashline-inject-${Date.now()}`)
    await mkdir(root, { recursive: true })
    filePath = join(root, 'foo.ts')
    await writeFile(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns null when disabled', () => {
    const block = buildHashlineAnchorBlock(filePath, root, {
      enabled: false,
      maxLinesPerFile: 80,
      recordOnRead: false,
    })
    expect(block).toBeNull()
  })

  it('includes anchors and hashline-read hint when enabled', () => {
    const block = buildHashlineAnchorBlock(filePath, root, {
      enabled: true,
      maxLinesPerFile: 2,
      recordOnRead: false,
    })
    expect(block).not.toBeNull()
    expect(block).toContain('Hashline anchors')
    expect(block).toContain('hashline_read')
    expect(block).toMatch(/\d+[a-z]{2}\|/)
  })

  it('contentHasHashlineAnchors detects anchor lines', () => {
    expect(contentHasHashlineAnchors('1tz|import x')).toBe(true)
    expect(contentHasHashlineAnchors('plain text')).toBe(false)
  })
})
