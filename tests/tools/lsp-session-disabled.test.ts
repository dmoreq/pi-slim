import { afterEach, describe, expect, it } from 'vitest'
import { setLspSessionEnabled } from '../../tools/lsp-navigation.js'

describe('LSP session guard', () => {
  afterEach(() => {
    setLspSessionEnabled(true)
  })

  it('go_to_definition returns install commands when session LSP is disabled', async () => {
    setLspSessionEnabled(
      false,
      'LSP off. Install:\n  npm install -g typescript typescript-language-server'
    )

    const mod = await import('../../tools/lsp-navigation.js')
    const tools = mod as unknown as {
      default: (pi: { registerTool: (t: { name: string; execute: (...a: unknown[]) => unknown }) => void }) => void
    }

    const registered: Array<{ name: string; execute: (...a: unknown[]) => Promise<unknown> }> = []
    tools.default({
      registerTool: t => {
        registered.push(t as (typeof registered)[0])
      },
    })

    const goto = registered.find(t => t.name === 'lsp_go_to_definition')
    expect(goto).toBeDefined()

    const result = await goto!.execute(
      '1',
      { path: 'src/foo.ts', line: 0, column: 0 },
      undefined,
      undefined,
      { cwd: '/tmp' }
    )

    expect(result).toMatchObject({
      details: { ok: false },
    })
    const text = (result as { content: Array<{ text: string }> }).content[0]?.text ?? ''
    expect(text).toContain('npm install -g typescript typescript-language-server')
  })
})
