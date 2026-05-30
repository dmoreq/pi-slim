import { describe, expect, it } from 'vitest'
import { formatScopeDashboard } from '../../commands/scope-dashboard'
import { SessionManager } from '../../manager'
import { produceDefaults } from '../../context/schema'
import { SessionStats } from '../../metrics/tracker'
import { ContextInjector } from '../../context/dep-context'
import type { RepoIndex } from '../../shared/types'

describe('formatScopeDashboard', () => {
  it('reports inactive when session has no state', () => {
    const manager = new SessionManager()
    expect(formatScopeDashboard(manager)).toContain('not active')
  })

  it('includes index and dependency depth when session is bootstrapped', () => {
    const manager = new SessionManager()
    const index: RepoIndex = {
      skeletons: new Map([['/proj/a.ts', 'export const a = 1']]),
      deps: new Map(),
      reverseDeps: new Map(),
      symbolIndex: new Map(),
    }
    const config = produceDefaults()
    manager.state = {
      index,
      repoMap: '',
      injector: new ContextInjector('/proj', 8000, 10),
      config: { ...config, dependencyDepth: 2 },
      stats: new SessionStats('test'),
      projectRoot: '/proj',
      repoMapInjected: false,
      contextFiles: [],
      contextFilesInjected: false,
      providerGuidanceFiles: [],
      providerGuidanceInjected: false,
      graphInsightsInjected: false,
      intelligenceInjected: false,
      retrieval: undefined,
    }
    manager.state.stats.indexedFiles = 1
    const text = formatScopeDashboard(manager)
    expect(text).toContain('Session Dashboard')
    expect(text).toContain('Dep depth')
    expect(text).toContain('2')
  })
})
