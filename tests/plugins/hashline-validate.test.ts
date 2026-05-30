import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { initHash } from '../../hashline/line-hash.js'
import { AnchorStateManager } from '../../hashline/state-manager.js'
import { HashlineValidatePlugin } from '../../plugins/hashline-validate-plugin.js'
import type { SessionState } from '../../manager.js'
import { produceDefaults } from '../../context/schema.js'
import type { RepoIndex } from '../../shared/types.js'

const ROOT = '/project'
const FOO = join(ROOT, 'src/foo.ts')

function makeState(): SessionState {
  const config = produceDefaults()
  return {
    index: { skeletons: new Map(), deps: new Map(), reverseDeps: new Map(), symbolIndex: new Map() },
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
    recentToolNames: [],
    contextFiles: [],
    providerGuidanceFiles: [],
  }
}

beforeAll(async () => {
  await initHash()
})

describe('HashlineValidatePlugin', () => {
  it('nudges apply when file was never read with anchors', async () => {
    const plugin = new HashlineValidatePlugin(() => makeState(), () => new Set())
    const result = await plugin.onToolCall!(
      { toolName: 'hashline_edit', input: { path: 'src/foo.ts', dry_run: false } },
      {} as never
    )
    expect(result?.reason).toContain('hashline_read')
  })

  it('allows apply when path has anchors this turn', async () => {
    const plugin = new HashlineValidatePlugin(() => makeState(), () => new Set([FOO]))
    const result = await plugin.onToolCall!(
      { toolName: 'hashline_edit', input: { path: 'src/foo.ts' } },
      {} as never
    )
    expect(result).toBeUndefined()
  })

  it('allows apply when AnchorStateManager has recorded path', async () => {
    AnchorStateManager.record(FOO, 'const x = 1\n')
    const plugin = new HashlineValidatePlugin(() => makeState(), () => new Set())
    const result = await plugin.onToolCall!(
      { toolName: 'hashline_edit', input: { path: 'src/foo.ts' } },
      {} as never
    )
    expect(result).toBeUndefined()
  })
})
