import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatHashlineRead } from '../../commands/hashline-read.js'
import hashlineReadTool from '../../tools/hashline-read-tool.js'

describe('hashline_read', () => {
  let root: string

  beforeEach(async () => {
    root = join(tmpdir(), `pi-scope-hr-tool-${Date.now()}`)
    await mkdir(join(root, 'src'), { recursive: true })
    const lines = Array.from({ length: 10 }, (_, i) => `const line${i + 1} = ${i + 1}`)
    await writeFile(join(root, 'src', 'wide.ts'), lines.join('\n'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('tool schema exposes path and line range params', () => {
    const params = hashlineReadTool.parameters as { properties?: Record<string, unknown> }
    expect(params.properties).toHaveProperty('path')
    expect(params.properties).toHaveProperty('start_line')
    expect(params.properties).toHaveProperty('end_line')
  })

  it('formatHashlineRead returns slice with anchors', async () => {
    const out = await formatHashlineRead(root, 'src/wide.ts', { startLine: 4, endLine: 6, recordOnRead: false })
    expect(out).toContain('lines 4–6')
    expect(out).toMatch(/4[a-z]{2}\|const line4/)
    expect(out).not.toContain('line1 =')
  })
})
