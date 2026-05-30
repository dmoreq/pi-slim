import { describe, expect, it } from 'vitest'
import {
  clearDryRunPreview,
  consumeDryRunFollowUpBlock,
  formatDryRunFollowUpBlock,
  recordDryRunPreview,
} from '../../context/hashline-dry-run-followup.js'

describe('hashline dry-run follow-up', () => {
  it('formats and consumes a single pending preview', () => {
    clearDryRunPreview()
    recordDryRunPreview({
      path: 'src/a.ts',
      preview: '+2ab|new line',
      addedLines: 1,
      removedLines: 0,
    })

    const block = consumeDryRunFollowUpBlock()
    expect(block).toContain('Hashline dry-run preview')
    expect(block).toContain('src/a.ts')
    expect(block).toContain('dry_run: false')
    expect(block).toContain('+2ab|new line')
    expect(consumeDryRunFollowUpBlock()).toBeNull()
  })

  it('builds follow-up block text', () => {
    const text = formatDryRunFollowUpBlock({
      path: 'lib/x.ts',
      preview: 'diff',
      addedLines: 2,
      removedLines: 1,
    })
    expect(text).toContain('+2 / -1')
    expect(text).toContain('lib/x.ts')
  })
})
