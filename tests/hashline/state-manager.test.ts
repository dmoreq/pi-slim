import { beforeAll, describe, expect, it } from 'vitest'
import { AnchorStateManager } from '../../hashline/state-manager.js'
import { computeLineHash, initHash } from '../../hashline/line-hash.js'

beforeAll(async () => {
  await initHash()
})

describe('AnchorStateManager', () => {
  it('records file state and statefully reconciles edits under shifting', () => {
    const filePath = '/dummy/path/file.ts'
    const originalContent = 'line one\nline two\nline three'
    
    // Record initial read content
    AnchorStateManager.record(filePath, originalContent)

    // Simulate shifts (inserting 2 lines at the top of the file)
    const shiftedContent = 'new top 1\nnew top 2\nline one\nline two\nline three'

    // The agent specifies edits based on the original content (line 2, which shifted to line 4)
    const originalLine2Hash = computeLineHash(2, 'line two')
    const edits = [
      {
        pos: { line: 2, hash: originalLine2Hash },
        lines: ['modified line two']
      }
    ]

    // Reconcile
    const result = AnchorStateManager.reconcile(filePath, shiftedContent, edits)

    // Should successfully map line 2 -> line 4 (shift of +2)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Auto-rebased anchor 2' + originalLine2Hash + ' \u2192 4' + originalLine2Hash)
    expect(edits[0].pos.line).toBe(4)
  })

  it('falls back to window search if Myers Diff mapping is not found', () => {
    const filePath = '/dummy/path/file_fallback.ts'
    const originalContent = 'line one\nline two\nline three'
    AnchorStateManager.record(filePath, originalContent)

    // Simulating a mismatch where Myers Diff cannot map because the line is marked as deleted/changed,
    // but the exact line is actually found in a nearby window on disk
    const shiftedContent = 'different content 1\ndifferent content 2\nline two\ndifferent content 3'
    const originalLine2Hash = computeLineHash(2, 'line two')
    
    // We pass an edit with an index that Myers Diff won't map (line 99 which is out of old line bounds)
    const edits = [
      {
        pos: { line: 99, hash: originalLine2Hash },
        lines: ['modified line two']
      }
    ]

    const result = AnchorStateManager.reconcile(filePath, shiftedContent, edits)
    expect(result.warnings[0]).toContain('mapped via fallback window search')
    expect(edits[0].pos.line).toBe(3) // found on line 3 on disk
  })
})
