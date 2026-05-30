import { describe, expect, it } from 'vitest'
import { SessionStats } from '../../metrics/tracker.js'

describe('SessionStats LSP metrics', () => {
  it('records LSP tool calls and errors', () => {
    const stats = new SessionStats('lsp-1')
    stats.recordLspTool('lsp_go_to_definition', true)
    stats.recordLspTool('lsp_hover', true)
    stats.recordLspTool('lsp_find_references', false, 'No language server')

    const record = stats.toRecord()
    expect(record.lspGoToDef).toBe(1)
    expect(record.lspHover).toBe(1)
    expect(record.lspErrors).toBe(1)
    expect(record.lspLastError).toContain('No language server')
  })
})
