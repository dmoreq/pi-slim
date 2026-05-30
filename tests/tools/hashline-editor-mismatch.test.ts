import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initHash } from '../../hashline/line-hash.js'
import hashlineTool from '../../tools/hashline-editor.js'

const reportSpy = vi.hoisted(() => vi.fn())

vi.mock('../../metrics/hashline-reporter.js', () => ({
  reportHashlineMismatch: reportSpy,
}))

beforeAll(async () => {
  await initHash()
})

describe('hashline_edit mismatch handling', () => {
  it('returns displayMessage and reports mismatch metric hook', async () => {
    reportSpy.mockClear()
    const dir = await mkdtemp(join(tmpdir(), 'hashline-edit-'))
    const rel = 'target.ts'
    await writeFile(join(dir, rel), 'keep\nthis line\n', 'utf-8')

    const result = await hashlineTool.execute(
      'tc-1',
      {
        path: rel,
        dry_run: true,
        edits: [{ loc: { append: '1xx' }, content: ['x'] }],
      },
      undefined,
      undefined,
      { cwd: dir }
    )

    const text = result.content[0]?.text ?? ''
    expect(text).toContain('hashline_read')
    expect(text).toContain('Edit rejected')
    expect(result.details.addedLines).toBe(0)
    expect(result.details.removedLines).toBe(0)
    expect(reportSpy).toHaveBeenCalledTimes(1)
  })
})
