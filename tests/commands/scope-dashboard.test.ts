import { describe, expect, it } from 'vitest'
import { formatScopeDashboard, formatScopeExplain, formatScopeHistory } from '../../commands/scope-dashboard'
import { buildGraphMetricsSummary } from '../../metrics/graph-metrics'
import type { GraphAnalysis } from '../../context/graph-types'
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
      intelligenceWorkflowInjected: false,
      graphMetrics: undefined,
      retrieval: undefined,
    }
    manager.state.stats.indexedFiles = 1
    const text = formatScopeDashboard(manager)
    expect(text).toContain('Session Dashboard')
    expect(text).toContain('Dep depth')
    expect(text).toContain('2')
    expect(text).toContain('SESSION')
    expect(text).toContain('/scope history')
  })

  it('dashboard contains health section with status line', () => {
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
      intelligenceWorkflowInjected: false,
      graphMetrics: undefined,
      retrieval: undefined,
    }
    manager.state.stats.indexedFiles = 1
    manager.lspServerHealth = [{ id: 'typescript', available: true, installCommand: '' }]
    const text = formatScopeDashboard(manager)
    expect(text).toContain('🏥 HEALTH')
    expect(text).toMatch(/Status\s+:\s+(✓|⚠|✗)/)
  })

  it('shows graph quality and injection breakdown when metrics snapshot exists', () => {
    const manager = new SessionManager()
    const analysis: GraphAnalysis = {
      godNodes: [],
      communities: [],
      surprises: [],
      bottlenecks: [],
      anomalies: [],
      wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
      metrics: {
        totalNodes: 5,
        totalEdges: 4,
        godNodeCount: 0,
        communityCount: 1,
        averageDegree: 1,
        maxDegree: 2,
        graphDensity: 0.1,
        avgClusteringCoeff: 0,
        cycleCount: 2,
        bottleneckCount: 0,
      },
      computedAt: Date.now(),
      version: '1',
    }
    const config = produceDefaults()
    manager.state = {
      index: { skeletons: new Map(), deps: new Map(), reverseDeps: new Map(), symbolIndex: new Map() },
      repoMap: '',
      injector: new ContextInjector('/proj', 8000, 10),
      config,
      stats: new SessionStats('test'),
      projectRoot: '/proj',
      repoMapInjected: false,
      contextFiles: [],
      contextFilesInjected: false,
      providerGuidanceFiles: [],
      providerGuidanceInjected: false,
      graphInsightsInjected: false,
      intelligenceInjected: false,
      intelligenceWorkflowInjected: false,
      graphMetrics: buildGraphMetricsSummary(analysis, 10, false),
      retrieval: undefined,
    }
    manager.state.stats.recordRepoMapInjection(100)
    manager.state.stats.recordDepContextInjection(['/proj/a.ts'], 50, 500)

    const text = formatScopeDashboard(manager)
    expect(text).toContain('GRAPH QUALITY')
    expect(text).toContain('/100')
    expect(text).toContain('Breakdown')
  })

  it('formatScopeExplain shows empty state when no injection', () => {
    const manager = new SessionManager()
    expect(formatScopeExplain(manager)).toContain('no injection last turn')
  })

  it('formatScopeHistory reports empty when no stats file', async () => {
    const manager = new SessionManager()
    const config = produceDefaults()
    manager.state = {
      index: { skeletons: new Map(), deps: new Map(), reverseDeps: new Map(), symbolIndex: new Map() },
      repoMap: '',
      injector: new ContextInjector('/proj', 8000, 10),
      config,
      stats: new SessionStats('test'),
      projectRoot: '/nonexistent-proj-metrics-' + Date.now(),
      repoMapInjected: false,
      contextFiles: [],
      contextFilesInjected: false,
      providerGuidanceFiles: [],
      providerGuidanceInjected: false,
      graphInsightsInjected: false,
      intelligenceInjected: false,
      intelligenceWorkflowInjected: false,
      graphMetrics: undefined,
      retrieval: undefined,
    }
    const text = await formatScopeHistory(manager)
    expect(text).toContain('No session history')
  })
})
