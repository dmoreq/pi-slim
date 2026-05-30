import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LspSteerPlugin } from '../../plugins/lsp-steer-plugin.js'
import type { SessionState } from '../../manager.js'
import { produceDefaults } from '../../context/schema.js'

const ROOT = '/project'
const AUTH = join(ROOT, 'src/auth.ts')

function makeState(): SessionState {
  const config = produceDefaults()
  return {
    index: {
      skeletons: new Map([[AUTH, 'export function x() {}']]),
      deps: new Map(),
      reverseDeps: new Map(),
      symbolIndex: new Map(),
    },
    repoMap: '',
    injector: {} as SessionState['injector'],
    config,
    stats: {} as SessionState['stats'],
    projectRoot: ROOT,
    repoMapInjected: false,
    contextFilesInjected: false,
    providerGuidanceInjected: false,
    graphInsightsInjected: false,
    graphInsightGodLabels: [],
    intelligenceInjected: false,
    intelligenceWorkflowInjected: false,
    retrieval: undefined,
    contextFiles: [],
    providerGuidanceFiles: [],
    recentToolNames: [],
  }
}

describe('LspSteerPlugin', () => {
  it('nudges grep toward LSP navigation', async () => {
    const plugin = new LspSteerPlugin(() => makeState())
    const result = await plugin.onToolCall!({ toolName: 'grep', input: { pattern: 'authenticate' } }, {} as never)
    expect(result?.reason).toContain('lsp_go_to_definition')
    expect(result?.allowed).toBe(true)
  })

  it('blocks grep when strictNavigation', async () => {
    const state = makeState()
    state.config.lsp.strictNavigation = true
    const plugin = new LspSteerPlugin(() => state)
    const result = await plugin.onToolCall!({ toolName: 'grep', input: { pattern: 'foo' } }, {} as never)
    expect(result?.allowed).toBe(false)
  })

  it('nudges partial read with line offset toward lsp_hover', async () => {
    const plugin = new LspSteerPlugin(() => makeState())
    const result = await plugin.onToolCall!(
      { toolName: 'read', input: { path: 'src/auth.ts', offset: 10, limit: 20 } },
      {} as never
    )
    expect(result?.reason).toContain('lsp_hover')
  })
})
