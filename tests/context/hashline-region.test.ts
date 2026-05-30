import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildHashlineAnchorBlock } from '../../context/hashline-inject.js'
import { collectLineRegionHints } from '../../context/hashline-region.js'
import { initHash } from '../../hashline/line-hash.js'

describe('hashline region injection', () => {
  let root: string
  let filePath: string

  beforeEach(async () => {
    await initHash()
    root = join(tmpdir(), `pi-scope-hl-region-${Date.now()}`)
    await mkdir(root, { recursive: true })
    filePath = join(root, 'src', 'target.ts')
    await mkdir(join(root, 'src'), { recursive: true })
    const lines = Array.from({ length: 50 }, (_, i) => `// line ${i + 1}\nexport const v${i + 1} = ${i + 1}`)
    await writeFile(filePath, lines.join('\n'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('collectLineRegionHints parses file:line citations', () => {
    const hints = collectLineRegionHints(root, [
      { content: 'Fix error at src/target.ts:25 please' },
    ])
    const abs = resolve(root, 'src/target.ts')
    expect(hints.get(abs)).toEqual({ startLine: 25, endLine: 25 })
  })

  it('buildHashlineAnchorBlock annotates around citation not file head', () => {
    const abs = resolve(root, 'src/target.ts')
    const hints = new Map([[abs, { startLine: 25, endLine: 25 }]])
    const block = buildHashlineAnchorBlock(abs, root, {
      enabled: true,
      maxLinesPerFile: 80,
      annotateBySymbolRange: true,
      annotateRangePaddingLines: 2,
      recordOnRead: false,
      regionHints: hints,
    })
    expect(block).toContain('around citation')
    expect(block).toMatch(/25[a-z]{2}\|/)
    expect(block).not.toMatch(/1[a-z]{2}\|\/\/ line 1/)
  })
})
