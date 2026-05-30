import { describe, expect, it } from 'vitest'
import { formatDiagnosticsForFile, formatSignatureHelp } from '../../lsp/diagnostic-format.js'

describe('formatDiagnosticsForFile', () => {
  it('formats empty diagnostics', () => {
    expect(formatDiagnosticsForFile('src/a.ts', [])).toContain('No LSP diagnostics')
  })

  it('formats severity and position', () => {
    const text = formatDiagnosticsForFile('src/a.ts', [
      {
        severity: 1,
        message: 'Cannot find name',
        range: {
          start: { line: 11, character: 4 },
          end: { line: 11, character: 8 },
        },
        code: 'TS2304',
        source: 'typescript',
      },
    ])
    expect(text).toContain('L12:5')
    expect(text).toContain('[error]')
    expect(text).toContain('Cannot find name')
  })
})

describe('formatSignatureHelp', () => {
  it('handles null help', () => {
    expect(formatSignatureHelp(null)).toContain('No signature help')
  })

  it('formats active signature and parameters', () => {
    const text = formatSignatureHelp({
      signatures: [
        {
          label: 'foo(a: string, b: number)',
          parameters: [
            { label: 'a: string' },
            { label: 'b: number' },
          ],
        },
      ],
      activeSignature: 0,
      activeParameter: 1,
    })
    expect(text).toContain('foo(a: string, b: number)')
    expect(text).toContain('→ b: number')
  })
})
