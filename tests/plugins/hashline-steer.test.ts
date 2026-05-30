import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HashlineSteerPlugin } from '../../plugins/hashline-steer-plugin.js'
import type { SessionState } from '../../manager.js'
import { produceDefaults } from '../../context/schema.js'
import type { RepoIndex } from '../../shared/types.js'

const ROOT = '/project'
const FOO = join(ROOT, 'src/foo.ts')

function makeState(overrides: Partial<SessionState['config']['hashline']> = {}): SessionState {
  const config = produceDefaults()
  config.hashline = { ...config.hashline, ...overrides }
  const index: RepoIndex = {
    skeletons: new Map([[FOO, 'export function foo() {}']]),
    deps: new Map(),
    reverseDeps: new Map(),
    symbolIndex: new Map(),
  }
  return {
    index,
    repoMap: '',
    injector: {} as SessionState['injector'],
    config,
    stats: {} as SessionState['stats'],
    projectRoot: ROOT,
    repoMapInjected: false,
    contextFilesInjected: false,
    providerGuidanceInjected: false,
    graphInsightsInjected: false,
    intelligenceInjected: false,
    intelligenceWorkflowInjected: false,
    retrieval: undefined,
    contextFiles: [],
    providerGuidanceFiles: [],
  }
}

describe('HashlineSteerPlugin', () => {
  it('does nothing when hashline is disabled', async () => {
    const plugin = new HashlineSteerPlugin(() =>
      makeState({ enabled: false, steerFromBuiltinEdit: true })
    )
    const result = await plugin.onToolCall!({ toolName: 'edit', input: { path: 'src/foo.ts' } }, {} as never)
    expect(result).toBeUndefined()
  })

  it('steers built-in edit on indexed files (non-strict)', async () => {
    const plugin = new HashlineSteerPlugin(() =>
      makeState({ enabled: true, steerFromBuiltinEdit: true, strictMode: false })
    )
    const result = await plugin.onToolCall!({ toolName: 'edit', input: { path: 'src/foo.ts' } }, {} as never)
    expect(result?.allowed).toBe(true)
    expect(result?.reason).toContain('hashline_edit')
  })

  it('blocks built-in edit in strict mode', async () => {
    const plugin = new HashlineSteerPlugin(() =>
      makeState({ enabled: true, strictMode: true })
    )
    const result = await plugin.onToolCall!({ toolName: 'write', input: { path: 'src/foo.ts' } }, {} as never)
    expect(result?.allowed).toBe(false)
    expect(result?.reason).toContain('hashline_edit')
  })

  it('ignores unindexed paths', async () => {
    const plugin = new HashlineSteerPlugin(() => makeState({ enabled: true }))
    const result = await plugin.onToolCall!(
      { toolName: 'edit', input: { path: 'src/unknown.ts' } },
      {} as never
    )
    expect(result).toBeUndefined()
  })

  it('blocks edit in contextual strict when path has anchors this turn', async () => {
    const state = makeState({ enabled: true, contextualStrictMode: true, strictMode: false })
    const anchors = new Set([FOO])
    const plugin = new HashlineSteerPlugin(() => state, () => anchors)
    const result = await plugin.onToolCall!({ toolName: 'edit', input: { path: 'src/foo.ts' } }, {} as never)
    expect(result?.allowed).toBe(false)
  })
})
