import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { collectLspPathsFromMessages, parseLspPathsFromText } from '../../tools/lsp-result-paths.js'

describe('lsp-result-paths', () => {
  const root = '/project'

  it('parses file:// location lines', () => {
    const text = 'Definitions found:\n  file:///project/src/auth.ts:10:4\n'
    expect(parseLspPathsFromText(text, root)).toEqual(['src/auth.ts'])
  })

  it('collects paths from tool input and structured details', () => {
    const paths = collectLspPathsFromMessages(
      [
        {
          role: 'assistant',
          toolName: 'lsp_go_to_definition',
          input: { path: 'src/foo.ts', line: 1, column: 0 },
        },
        {
          role: 'toolResult',
          toolName: 'lsp_go_to_definition',
          content: '',
          details: { paths: ['src/bar.ts'], ok: true },
        },
      ],
      root
    )
    expect(paths).toContain('src/foo.ts')
    expect(paths).toContain('src/bar.ts')
  })
})
