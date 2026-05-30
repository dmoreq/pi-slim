import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  appendHashlineHoverSection,
  setHashlineHoverEnabled,
} from '../../hashline/lsp-hover-anchor.js'
import { computeLineHash, initHash } from '../../hashline/line-hash.js'

beforeAll(async () => {
  await initHash()
})

describe('appendHashlineHoverSection', () => {
  it('appends hashline anchor section for a valid line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hashline-hover-'))
    const file = join(dir, 'sample.ts')
    await writeFile(file, 'alpha\nbeta\ngamma\n', 'utf-8')

    const body = '### Hover\n`function beta`'
    const out = await appendHashlineHoverSection(file, 2, dir, body)

    expect(out).toContain('### Hashline anchor')
    expect(out).toContain('hashline_read')
    expect(out).toContain('hashline_edit')
    expect(out).toContain(`2${computeLineHash(2, 'beta')}`)
  })

  it('returns body unchanged when hover is disabled', async () => {
    setHashlineHoverEnabled(false)
    const body = 'plain hover'
    const out = await appendHashlineHoverSection('/nope.ts', 1, '/', body)
    expect(out).toBe(body)
    setHashlineHoverEnabled(true)
  })

  it('returns body unchanged for invalid line numbers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hashline-hover-'))
    const file = join(dir, 'one.ts')
    await writeFile(file, 'only\n', 'utf-8')
    const body = 'hover'
    expect(await appendHashlineHoverSection(file, 0, dir, body)).toBe(body)
    expect(await appendHashlineHoverSection(file, 99, dir, body)).toBe(body)
  })
})
