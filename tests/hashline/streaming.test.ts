import { describe, expect, it } from 'vitest'
import { initHash } from '../../hashline/line-hash.js'
import { streamHashLinesFromLines } from '../../hashline/streaming.js'

describe('streamHashLinesFromLines', () => {
  it('yields multiple chunks for large line arrays', async () => {
    await initHash()
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`)
    const chunks: string[] = []
    for await (const chunk of streamHashLinesFromLines(lines, { startLine: 1, maxChunkLines: 100 })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('\n')).toMatch(/\d+[a-z]{2}\|line 1/)
    expect(chunks.join('\n')).toMatch(/\d+[a-z]{2}\|line 250/)
  })
})
