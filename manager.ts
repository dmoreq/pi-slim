import { formatScopeCommand, formatScopeDashboard } from './commands/scope-dashboard.js'
import { consumeDryRunFollowUpBlock } from './context/hashline-dry-run-followup.js'
import { extractToolPath, resolveProjectPath } from './context/hashline-inject.js'
import { collectLineRegionHints } from './context/hashline-region.js'
import { formatHashlineTurnWorkflowBlock, mergeHashlineInjectionInsights } from './context/hashline-signals.js'
import { type ContextFile, formatContextSection, loadContextFiles } from './context/context-files.js'
import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { ContextInjector } from './context/dep-context.js'
import { cycleWarningForFiles, formatCycleIntelligenceBlock } from './context/graph-cycle-warn.js'
import { formatGraphInsightsSection, topGodLabels } from './context/graph-insights-format.js'
import { formatGraphPulse } from './context/graph-pulse.js'
import type { GraphAnalysis } from './context/graph-types.js'
import { type ProviderGuidanceFile, formatProviderGuidanceSection, loadProviderGuidance } from './context/guidance.js'
import {
  ContextIntelligenceEngine,
  classifyIntelligenceTurnMode,
  type IntelligenceGuidanceOptions,
} from './context/intelligence-engine.js'
import { loadConfig } from './context/loader.js'
import { InjectionPipeline } from './context/pipeline.js'
import type { PipelineSource } from './context/pipeline.js'
import { RetrievalEngine } from './context/retrieval.js'
import { produceDefaults } from './context/schema.js'
import { SmartDependencyContextGenerator } from './context/smart-dep-context.js'
import { SmartRepositoryMapGenerator } from './context/smart-repo-map.js'
import { estimateFileSavings } from './metrics/cost-estimator.js'
import {
  buildGraphMetricsSummary,
  computeGraphTokenMetrics,
  formatGraphQualityOneLine,
  type GraphMetricsSummary,
} from './metrics/graph-metrics.js'
import { SessionStats } from './metrics/tracker.js'
import { initHash } from './hashline/line-hash.js'
import { AnchorStateManager } from './hashline/state-manager.js'
import { CommunityPruningPlugin } from './plugins/community-pruning-plugin.js'
import { ContextPruningPlugin } from './plugins/context-pruning.js'
import { HashlineSteerPlugin } from './plugins/hashline-steer-plugin.js'
import { HashlineValidatePlugin } from './plugins/hashline-validate-plugin.js'
import { GraphSteerPlugin } from './plugins/graph-steer-plugin.js'
import { LspSteerPlugin } from './plugins/lsp-steer-plugin.js'
import { PluginManager } from './plugins/plugin-manager.js'
import { GraphService } from './services/graph-service.js'
import { IndexService } from './services/index-service.js'
import type { AgentMessage } from './shared/agent-message.js'
import { detectPathsInOutput, detectPathsInToolCall, type FileReference } from './shared/file-detector.js'
import type { ContextInsights } from './shared/intelligence-types.js'
import { extractInjectedFilePaths, extractText } from './shared/message.js'
import { scopeDir } from './shared/paths.js'
import { isBroadCodebaseQuery } from './shared/query-intent.js'
import type { RepoIndex, SlimConfig } from './shared/types.js'
import { setHashlineMismatchReporter } from './metrics/hashline-reporter.js'
import { collectLspPathsFromMessages } from './tools/lsp-result-paths.js'
import { resolveLspSession } from './lsp/availability.js'
import { setGraphImpactAnalysis } from './tools/graph-impact-tool.js'
import {
  setHashlineLspHoverEnabled,
  setLspGraphAnalysis,
  setLspRepoIndex,
  setLspSessionEnabled,
  setLspToolOptions,
} from './tools/lsp-navigation.js'

export { formatGraphInsightsSection, topGodLabels } from './context/graph-insights-format.js'
import { type StatusBarState, clearStatusBar, info as nInfo, success as nSuccess, updateStatusBar, warn as nWarn } from './ui/notifications.js'
import { isValidCodebase } from './shared/utils/path-utils.js'

// ── Types ──────────────────────────────────────────────────────────────

export type { AgentMessage } from './shared/agent-message.js'

export interface ExtensionContext {
  cwd: string
  ui: { notify: (msg: string, level?: string) => void; setStatus: (k: string, v?: string) => void }
  hasUI: boolean
  getSystemPrompt(): string
  sessionManager: { getSessionId(): string }
  model?: { provider?: string; id?: string }
}

export interface BeforeAgentStartEvent {
  type: 'before_agent_start'
  systemPrompt: string
  prompt: string
}

export interface ContextEvent {
  type?: 'context'
  messages: AgentMessage[]
  /** Optional host metadata — ignored today; tolerated for forwards compatibility. */
  files?: string[]
  symbols?: string[]
}

// ── Session state ──────────────────────────────────────────────────────

export interface SessionState {
  index: RepoIndex
  repoMap: string
  injector: ContextInjector
  config: SlimConfig
  stats: SessionStats
  projectRoot: string
  repoMapInjected: boolean
  contextFiles: ContextFile[]
  contextFilesInjected: boolean
  providerGuidanceFiles: ProviderGuidanceFile[]
  providerGuidanceInjected: boolean
  graphInsightsInjected: boolean
  /** God node labels already shown in full graph insights (for smart-dep dedupe). */
  graphInsightGodLabels: string[]
  intelligenceInjected: boolean
  intelligenceWorkflowInjected: boolean
  graphMetrics?: GraphMetricsSummary
  retrieval: RetrievalEngine | undefined
  /** Recent tool names for graph/LSP steer plugins (rolling window). */
  recentToolNames: string[]
}

// ── Exported helpers ───────────────────────────────────────────────────

/**
 * Build a PipelineSource for the repo map.
 * Applies graph-prioritized enhancement when analysis is available;
 * falls back to the raw map otherwise.
 */
export function buildRepoMapSource(
  baseMap: string,
  insights: ContextInsights,
  graph: GraphAnalysis | null
): PipelineSource {
  return {
    name: 'repo-map',
    priority: 1,
    produce(): string | null {
      if (!baseMap) return null
      if (graph) {
        return new SmartRepositoryMapGenerator().generatePrioritizedRepoMap(baseMap, insights, graph)
      }
      return baseMap
    },
  }
}

// ── Manager ────────────────────────────────────────────────────────────

export class SessionManager {
  /** Default host context when the runtime omits an `ExtensionContext` (tests). */
  private static readonly DEFAULT_EXTENSION_CONTEXT: ExtensionContext = {
    cwd: typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.',
    ui: { notify: () => {}, setStatus: () => {} },
    hasUI: false,
    getSystemPrompt: () => '',
    sessionManager: { getSessionId: () => 'pi-scope-default' },
  }

  /**
   * Max messages retained for pattern detection / guidance.
   * `handleContext` replaces the buffer from the host (authoritative transcript);
   * `addMessages` appends (tests / tooling) — both paths enforce this cap.
   */
  private static readonly MAX_CONVERSATION_MESSAGES = 100

  readonly name = 'pi-scope'
  readonly version = '0.7.0'
  state: SessionState | null = null

  /** Services (single-responsibility) */
  readonly indexService = new IndexService()
  readonly graphService = new GraphService()
  readonly pluginManager = new PluginManager()

  /** Context for UI notifications (set during start(), cleared on shutdown) */
  private _notifyCtx: ExtensionContext | null = null

  /** Graph analysis result (cached for telemetry + status bar) */
  private _graphNodeCount = 0
  private _graphEdgeCount = 0
  private _graphCommunityCount = 0

  private intelligenceEngine: ContextIntelligenceEngine
  private smartDepGenerator = new SmartDependencyContextGenerator()
  private autoReindexWatcher: FSWatcher | null = null
  private autoReindexTimer: ReturnType<typeof setTimeout> | null = null
  private autoReindexInFlight: Promise<void> | null = null
  private autoReindexQueued = false
  /**
   * Conversation buffer for intelligence analysis.
   *
   * **`handleContext`** — replaces with `event.messages` (host owns the canonical transcript).
   * **`addMessages`** — appends (programmatic ingest). Both paths truncate to {@link SessionManager.MAX_CONVERSATION_MESSAGES}
   * (oldest removed first).
   */
  private conversationMessages: AgentMessage[] = []

  /** Paths with hashline anchors injected or read during the current context turn. */
  hashlineAnchorPathsThisTurn = new Set<string>()
  /** Project-relative paths resolved from LSP tools this context turn. */
  lspResolvedPathsThisTurn = new Set<string>()
  private hashlineDryRunSeenForPath = new Set<string>()
  /** PATH probe results from session start (includes install commands per server). */
  lspServerHealth: Array<{
    id: string
    command: string
    available: boolean
    installCommand: string
    label: string
  }> = []
  /** Set when LSP was auto-disabled; shown in `/scope` and LSP tool errors. */
  lspInstallSuggestion: string | undefined = undefined

  /** Per-turn cache so before_agent_start + context share one intelligence snapshot. */
  private intelligenceSnapshotCache: {
    fingerprint: string
    insights: ContextInsights
    graph: GraphAnalysis | null
  } | null = null

  constructor(_projectRoot?: string) {
    this.intelligenceEngine = new ContextIntelligenceEngine()
    this.pluginManager.register(new ContextPruningPlugin())
    this.pluginManager.register(new CommunityPruningPlugin(this.graphService, () => this.state, (msg) => this._notify(msg, 'info')))
    this.pluginManager.register(
      new HashlineSteerPlugin(() => this.state, () => this.hashlineAnchorPathsThisTurn)
    )
    this.pluginManager.register(
      new HashlineValidatePlugin(() => this.state, () => this.hashlineAnchorPathsThisTurn)
    )
    this.pluginManager.register(new LspSteerPlugin(() => this.state))
    this.pluginManager.register(
      new GraphSteerPlugin(
        () => this.state,
        () => this.graphService.analysis ?? null,
        () => {
          const ins = this.intelligenceSnapshotCache?.insights
          if (!ins) return []
          return [
            ...ins.editingIntent.targetSymbols,
            ...ins.editingIntent.affectedGodNodes,
          ]
        }
      )
    )
  }

  private communityPruningPlugin(): CommunityPruningPlugin | undefined {
    return this.pluginManager.getAll().find(
      (p): p is CommunityPruningPlugin => p.name === 'community-pruning'
    )
  }

  /**
   * Append messages to the intelligence transcript buffer (does not replace the host copy).
   * Oldest rows are dropped when length exceeds {@link SessionManager.MAX_CONVERSATION_MESSAGES}.
   */
  addMessages(messages: AgentMessage[]): void {
    this.invalidateIntelligenceSnapshotCache()
    for (const m of messages) {
      this.conversationMessages.push({
        ...m,
        content: extractText(m.content),
      })
    }
    this.trimConversationMessagesToCapacity()
  }

  /** Run pattern + graph-aware analysis over the current conversation buffer. */
  async analyzeCurrentContext(): Promise<ContextInsights> {
    return (await this.getIntelligenceSnapshot()).insights
  }

  /** Natural-language steering block for agents (graph when available, otherwise basic tips). */
  async generateIntelligentGuidance(): Promise<string> {
    const { insights, graph } = await this.getIntelligenceSnapshot()
    return this.intelligenceEngine.generateActionableGuidance(insights, graph, this.graphService.graph)
  }

  /** In-session dashboard text for `/scope`. */
  scopeDashboard(): string {
    return formatScopeDashboard(this)
  }

  /** `/scope` with optional `history` argument. */
  async scopeCommand(args?: string): Promise<string> {
    return formatScopeCommand(this, args)
  }

  /** Same guidance string suitable for injecting alongside dep-context or tool hints. */
  async getEnhancedContextResponse(): Promise<string> {
    return this.generateIntelligentGuidance()
  }

  /**
   * Computes insights and the graph correlation used together in {@link generateActionableGuidance}.
   * On resolver or analyzer failure, repeats analysis **without** graph so callers always get usable output.
   */
  private conversationFingerprint(): string {
    const last = this.conversationMessages[this.conversationMessages.length - 1]
    return `${this.conversationMessages.length}:${extractText(last?.content ?? '').length}`
  }

  private invalidateIntelligenceSnapshotCache(): void {
    this.intelligenceSnapshotCache = null
  }

  private async getIntelligenceSnapshot(): Promise<{
    insights: ContextInsights
    graph: GraphAnalysis | null
  }> {
    const fingerprint = this.conversationFingerprint()
    if (this.intelligenceSnapshotCache?.fingerprint === fingerprint) {
      return {
        insights: this.intelligenceSnapshotCache.insights,
        graph: this.intelligenceSnapshotCache.graph,
      }
    }
    const snapshot = await this.buildIntelligenceSnapshot()
    this.intelligenceSnapshotCache = { fingerprint, ...snapshot }
    return snapshot
  }

  private async buildIntelligenceSnapshot(): Promise<{
    insights: ContextInsights
    graph: GraphAnalysis | null
  }> {
    try {
      const graph = await this.resolveGraphAnalysisForIntelligence()
      const insights = this.intelligenceEngine.analyzeConversationContext(this.conversationMessages, graph)
      return { insights, graph }
    } catch (error) {
      console.warn(
        'pi-scope: buildIntelligenceSnapshot primary path failed; retrying analysis without resolved graph:',
        error
      )
      const graph = null
      const insights = this.intelligenceEngine.analyzeConversationContext(this.conversationMessages, null)
      return { insights, graph }
    }
  }

  /**
   * Replace buffer with the host's current transcript slice (typically full conversation).
   * Always trim after replace — pi may send arbitrarily long payloads.
   */
  private syncConversationMessages(messages: AgentMessage[]): void {
    this.invalidateIntelligenceSnapshotCache()
    this.conversationMessages = messages.map(m => ({
      ...m,
      content: extractText(m.content),
    }))
    this.trimConversationMessagesToCapacity()
  }

  private trimConversationMessagesToCapacity(): void {
    const max = SessionManager.MAX_CONVERSATION_MESSAGES
    if (this.conversationMessages.length <= max) return
    const excess = this.conversationMessages.length - max
    this.conversationMessages.splice(0, excess)
  }

  private async resolveGraphAnalysisForIntelligence(): Promise<GraphAnalysis | null> {
    return this.graphService.analysis
  }

  /**
   * Minimal session bootstrap for integration tests / graph-mocked intelligence.
   * Enables `handleContext` with an empty index and default scope config.
   */
  private async bootstrapMinimalIntelligenceSession(): Promise<void> {
    const projectRoot = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.'
    const config = produceDefaults()
    if (!config.enabled) return
    const stats = new SessionStats(SessionManager.DEFAULT_EXTENSION_CONTEXT.sessionManager.getSessionId())
    const injector = new ContextInjector(projectRoot, config.maxInjectionTokens, config.scanLastNMessages)
    const emptyIndex: RepoIndex = {
      skeletons: new Map(),
      deps: new Map(),
      reverseDeps: new Map(),
      symbolIndex: new Map(),
    }
    await this.pluginManager.runHook('onSessionStart', SessionManager.DEFAULT_EXTENSION_CONTEXT)
    this.intelligenceEngine.setProjectRoot(projectRoot)

    this.state = this.initState({
      index: emptyIndex,
      repoMap: '',
      injector,
      config,
      stats,
      projectRoot,
      contextFiles: [],
    })
  }

  /** Start indexer + graph orchestration (`pi` hosts), or bootstrap a minimal enabled session (`start()` with no args — tests). */
  async start(): Promise<void>
  async start(projectRoot: string, getFlag: (name: string) => unknown, ctx: ExtensionContext): Promise<void>
  async start(projectRoot?: string, getFlag?: (name: string) => unknown, ctx?: ExtensionContext): Promise<void> {
    if (arguments.length === 0) {
      await this.bootstrapMinimalIntelligenceSession()
      return
    }
    if (typeof projectRoot !== 'string' || typeof getFlag !== 'function' || ctx === undefined) {
      throw new Error('session start requires (projectRoot, getFlag, ctx) when bootstrap mode is disabled')
    }

    this._notifyCtx = ctx

    // 1. Guard against running in system/home/non-codebase directories
    if (!isValidCodebase(projectRoot)) {
      console.log(`[pi-scope] Directory "${projectRoot}" is not a valid codebase. pi-scope remains dormant.`)
      return
    }


    let config: SlimConfig = loadConfig(projectRoot, {
      'scope.enabled': getFlag('scope.enabled'),
      'scope.maxRepoMapTokens': getFlag('scope.maxRepoMapTokens'),
      'scope.maxInjectionTokens': getFlag('scope.maxInjectionTokens'),
      'scope.scanLastNMessages': getFlag('scope.scanLastNMessages'),
      'scope.contextFiles.enabled': getFlag('scope.contextFiles.enabled'),
      'scope.providerGuidance.enabled': getFlag('scope.providerGuidance.enabled'),
    })
    if (!config.enabled) return

    if (config.hashline.enabled) {
      await initHash().catch(err => {
        console.warn('[pi-scope] hashline initHash failed:', err)
      })
    }
    setHashlineLspHoverEnabled(config.hashline.enabled && config.hashline.anchorOnLspHover)
    setHashlineMismatchReporter(() => {
      this.state?.stats.recordHashlineMismatch()
    })

    const lspSession = resolveLspSession(config.lsp.enabled)
    this.lspServerHealth = lspSession.health
    this.lspInstallSuggestion = lspSession.installSuggestion
    if (lspSession.installSuggestion) {
      console.warn(`[pi-scope] ${lspSession.installSuggestion.replace(/\n/g, ' ')}`)
      ctx.ui.notify(lspSession.installSuggestion, 'warning')
    }
    if (!lspSession.active) {
      setLspSessionEnabled(false, lspSession.installSuggestion)
      config = { ...config, lsp: { ...config.lsp, enabled: false } }
    } else {
      this.lspInstallSuggestion = undefined
      setLspSessionEnabled(true)
      setLspToolOptions({
        enrichHoverWithGraph: config.lsp.enrichHoverWithGraph,
        hoverMaxReferencesListed: config.lsp.hoverMaxReferencesListed,
      })
    }

    const stats = new SessionStats(ctx.sessionManager.getSessionId())
    const injector = new ContextInjector(projectRoot, config.maxInjectionTokens, config.scanLastNMessages)

    // Run plugin hooks
    await this.pluginManager.runHook('onSessionStart', ctx)

    // Try cache
    const cached = await this.indexService.loadFromCacheIfFresh(projectRoot)
    if (cached.loaded) {
      const idx = this.indexService.index!
      stats.indexSource = 'cache'
      stats.indexedFiles = idx.skeletons.size
      stats.depEdges = [...idx.deps.values()].reduce((s, v) => s + v.size, 0)
      stats.recordIndexLoaded(this.indexService.metadata as any)

      if (this.indexService.metadata?.builtAt) {
        const ageHours = (Date.now() - new Date(this.indexService.metadata.builtAt).getTime()) / (1000 * 60 * 60)
        stats.recordIndexAge(ageHours, ageHours > 24)
      }

      this._notify(nSuccess(`Loaded ${idx.skeletons.size} files from cache`), 'success')

      const retrieval = new RetrievalEngine(idx)
      this.intelligenceEngine.setProjectRoot(projectRoot)

    this.state = this.initState({
        index: idx,
        repoMap: this.indexService.repoMap!,
        injector,
        config,
        stats,
        projectRoot,
      })
      this.state.retrieval = retrieval

      // Load graph from cache
      await this.loadGraph(projectRoot, this.state)
      this.startAutoReindexWatcher(ctx)
      this.updateStatusBar(ctx)
      if (config.metrics.notifyWelcome) {
        this._notify(
          nSuccess(
            this._buildWelcomeMessage(
              idx.skeletons.size,
              'cache',
              this.state.stats.indexBuildTime,
              this.state.stats.languages,
              this.state.graphMetrics?.quality.score
            )
          ),
          'success'
        )
      }
      return
    }

    if (cached.stale?.stale) {
      ctx.ui.notify(nWarn(`Cached index stale, rebuilding (${cached.stale.reasons.join('; ')})`), 'warning')
    }

    // Fresh build
    ctx.ui.notify(nInfo('Building index...'), 'info')
    try {
      const result = await this.indexService.buildFresh(projectRoot, config)
      stats.indexSource = 'fresh'
      stats.indexedFiles = result.fileCount
      stats.depEdges = [...result.index.deps.values()].reduce((s, v) => s + v.size, 0)
      stats.recordIndexLoaded(result.metadata as any)
      stats.recordIndexAge(0, false)

      this._notify(nSuccess(`Indexed ${result.fileCount} files in ${(result.buildTimeMs / 1000).toFixed(1)}s`), 'success')

      const contextFiles = config.contextFiles.enabled
        ? loadContextFiles(projectRoot, { filenames: config.contextFiles.filenames })
        : []

      const retrieval = new RetrievalEngine(result.index)
      this.intelligenceEngine.setProjectRoot(projectRoot)

    this.state = this.initState({
        index: result.index,
        repoMap: result.repoMap,
        injector,
        config,
        stats,
        projectRoot,
        contextFiles,
      })
      this.state.retrieval = retrieval

      await this.loadGraph(projectRoot, this.state)
      this.startAutoReindexWatcher(ctx)
      this.updateStatusBar(ctx)
      if (config.metrics.notifyWelcome) {
        this._notify(
          nSuccess(
            this._buildWelcomeMessage(
              result.fileCount,
              'fresh',
              result.buildTimeMs,
              this.state.stats.languages,
              this.state.graphMetrics?.quality.score
            )
          ),
          'success'
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this._notify(nError(`Error: ${msg}`), 'error')
      this.state = null
    }
  }

  /**
   * Run native index-based graph analysis.
   */
  private async loadGraph(projectRoot: string, session: SessionState): Promise<void> {
    const cacheDir = scopeDir(projectRoot)
    const stats = session.stats
    setLspGraphAnalysis(null)
    setGraphImpactAnalysis(null)
    setLspRepoIndex(null)
    setHashlineLspHoverEnabled(false)
    setHashlineMismatchReporter(null)

    const index = this.indexService.index
    if (!index || index.skeletons.size === 0) {
      setLspGraphAnalysis(null)
      setGraphImpactAnalysis(null)
      setLspRepoIndex(null)
      session.graphMetrics = undefined
      return
    }

    const analysisStart = Date.now()
    if (session.config.metrics.notifyGraphProgress) {
      this._notify(nInfo('Analyzing codebase graph…'), 'info')
    }
    const nativeResult = await this.graphService.analyzeFromIndex(index, projectRoot, cacheDir)
    const analysisMs = Date.now() - analysisStart

    this._graphNodeCount = nativeResult.graph.nodes.length
    this._graphEdgeCount = nativeResult.graph.edges.length
    this._graphCommunityCount = nativeResult.analysis.communities.length

    stats.godNodesCount = nativeResult.analysis.godNodes.length
    stats.communityCount = nativeResult.analysis.communities.length
    stats.circularDependencies = nativeResult.analysis.metrics.cycleCount

    const cacheLabel = nativeResult.cacheHit ? ' (from cache)' : ` — ${analysisMs}ms`
    const detail =
      this._graphCommunityCount && this._graphCommunityCount > 1
        ? `${this._graphNodeCount} nodes, ${this._graphEdgeCount} edges, ${this._graphCommunityCount} communities${cacheLabel}`
        : `${this._graphNodeCount} nodes, ${this._graphEdgeCount} edges${cacheLabel}`
    this._notify(nInfo(`Graph: ${detail}`), 'info')
    setLspGraphAnalysis(nativeResult.analysis)
    setGraphImpactAnalysis(nativeResult.analysis)
    setLspRepoIndex(index)

    const graphSummary = buildGraphMetricsSummary(nativeResult.analysis, analysisMs, nativeResult.cacheHit, 1)
    session.graphMetrics = graphSummary
    stats.recordGraphMetrics(graphSummary)

    if (graphSummary.quality.cycleCount > 0) {
      const n = graphSummary.quality.cycleCount
      console.warn(`[pi-scope] Graph: ${n} circular dependenc${n === 1 ? 'y' : 'ies'} detected`)
    }

    const m = session.config.metrics
    if (m.enabled && m.notifyQualityOnStart) {
      const line = formatGraphQualityOneLine(graphSummary)
      const { quality } = graphSummary
      if (quality.score < m.warnQualityBelow || quality.cycleCount > m.warnCyclesAbove) {
        this._notify(nWarn(line), 'warning')
      } else if (quality.score >= 80) {
        this._notify(nInfo(line), 'info')
      }
    }
  }

  private _buildWelcomeMessage(
    fileCount: number,
    source: 'cache' | 'fresh',
    buildTimeMs: number | undefined,
    languages: string[],
    graphScore: number | undefined
  ): string {
    const sourceLabel =
      source === 'cache'
        ? '(cache)'
        : `(${buildTimeMs != null ? (buildTimeMs / 1000).toFixed(1) + 's' : 'fresh'})`
    const langLabel = languages.slice(0, 3).join(', ') || 'code'
    const qualLabel = graphScore != null ? ` · Q${graphScore}` : ''
    return `pi-scope v${this.version} active · ${fileCount} files ${sourceLabel} · ${langLabel}${qualLabel}`
  }

  private initState(opts: {
    index: RepoIndex
    repoMap: string
    injector: ContextInjector
    config: SlimConfig
    stats: SessionStats
    projectRoot: string
    contextFiles?: ContextFile[]
  }): SessionState {
    return {
      index: opts.index,
      repoMap: opts.repoMap,
      injector: opts.injector,
      config: opts.config,
      stats: opts.stats,
      projectRoot: opts.projectRoot,
      repoMapInjected: false,
      contextFiles: opts.contextFiles ?? [],
      contextFilesInjected: false,
      providerGuidanceFiles: [],
      providerGuidanceInjected: false,
      graphInsightsInjected: false,
      graphInsightGodLabels: [],
      intelligenceInjected: false,
      intelligenceWorkflowInjected: false,
      retrieval: undefined,
      recentToolNames: [],
    }
  }

  private intelligenceGuidanceOptions(
    s: SessionState,
    insights: ContextInsights,
    isBroadCodebaseQuery: boolean
  ): IntelligenceGuidanceOptions {
    if (!s.config.intelligence.enabled) {
      return { mode: 'idle', includeWorkflow: false }
    }
    const mode = classifyIntelligenceTurnMode(insights, isBroadCodebaseQuery)
    const includeWorkflow =
      s.config.intelligence.repeatWorkflowGuidance || !s.intelligenceWorkflowInjected
    return { mode, includeWorkflow }
  }

  private markIntelligenceWorkflowInjected(s: SessionState, guidance: string): void {
    if (guidance.includes('WORKFLOW OPTIMIZATION')) {
      s.intelligenceWorkflowInjected = true
    }
  }

  // ── Before agent start ────────────────────────────────────────────

  async handleBeforeAgentStart(
    event: BeforeAgentStartEvent,
    ctx: ExtensionContext
  ): Promise<{ systemPrompt: string } | undefined> {
    const s = this.state
    if (!s) return undefined
    if (
      s.repoMapInjected &&
      s.contextFilesInjected &&
      s.providerGuidanceInjected &&
      s.graphInsightsInjected &&
      s.intelligenceInjected
    )
      return undefined

    const snapshot = await this.getIntelligenceSnapshot()
    const graph = snapshot.graph ?? this.graphService.analysis ?? null

    const pipeline = new InjectionPipeline()
    const combinedBudget = s.config.maxRepoMapTokens + s.config.maxInjectionTokens

    if (!s.repoMapInjected && s.repoMap) {
      pipeline.register(buildRepoMapSource(s.repoMap, snapshot.insights, graph))
    }

    if (!s.providerGuidanceInjected && s.config.providerGuidance.enabled) {
      const provider = ctx.model?.provider as string | undefined
      const modelId = ctx.model?.id as string | undefined
      if (provider) {
        pipeline.register({
          name: 'provider-guidance',
          priority: 2,
          produce: () => {
            const files = loadProviderGuidance(s.projectRoot, provider, modelId)
            if (files.length > 0) {
              s.providerGuidanceFiles = files
              const names = files.map(f => f.path.split('/').pop() ?? f.path).join(', ')
              this._notify(nInfo(`Provider guidance: ${names}`), 'info')
              return formatProviderGuidanceSection(files)
            }
            return null
          },
        })
      }
    }

    if (!s.graphInsightsInjected && graph && s.config.graph.enabled) {
      pipeline.register({
        name: 'graph-insights',
        priority: 3,
        produce: () =>
          formatGraphInsightsSection(graph, {
            surfaceAnomalies: s.config.graph.surfaceAnomaliesInInsights,
            surfaceSurprisesMax: s.config.graph.surfaceSurprisesMax,
          }),
      })
    }

    if (!s.intelligenceInjected && s.config.intelligence.enabled) {
      const isBroad = isBroadCodebaseQuery(event.prompt ?? '')
      const intelOpts = this.intelligenceGuidanceOptions(s, snapshot.insights, isBroad)
      pipeline.register({
        name: 'context-intelligence',
        priority: 4,
        produce: () => {
          const guidance = this.intelligenceEngine.generateActionableGuidance(
            snapshot.insights,
            graph,
            this.graphService.graph,
            intelOpts
          )
          this.markIntelligenceWorkflowInjected(s, guidance)
          return guidance.trim() ? `## Context intelligence\n\n${guidance}` : null
        },
      })
    }

    if (!s.contextFilesInjected && s.contextFiles.length > 0) {
      pipeline.register({
        name: 'context-files',
        priority: 6,
        produce: () =>
          formatContextSection(s.contextFiles, {
            sectionTitle: s.config.contextFiles.sectionTitle,
          }),
      })
    }

    const result = pipeline.build(combinedBudget)
    if (!result.content) return undefined

    for (const entry of result.sources) {
      const tokens = entry.tokens
      if (entry.name === 'repo-map' && entry.injected) {
        s.repoMapInjected = true
        s.stats.recordRepoMapInjection(tokens)
      } else if (entry.name === 'provider-guidance' && entry.injected && s.providerGuidanceFiles.length > 0) {
        s.providerGuidanceInjected = true
        s.stats.recordProviderGuidanceInjection(tokens, s.providerGuidanceFiles.length)
      } else if (entry.name === 'graph-insights' && entry.injected) {
        s.graphInsightsInjected = true
        if (graph) {
          s.graphInsightGodLabels = topGodLabels(graph)
        }
        s.stats.recordGraphInsightsInjection(tokens)
      } else if (entry.name === 'context-intelligence' && entry.injected) {
        s.intelligenceInjected = true
        s.stats.recordIntelligenceInjection(tokens)
      } else if (entry.name === 'context-files' && entry.injected) {
        s.contextFilesInjected = true
        s.stats.recordContextFilesInjection(tokens, s.contextFiles.length)
      }
    }

    this.updateStatusBar(ctx)

    const depDepth = s.config.dependencyDepth ?? 1
    const lspToolsLines = s.config.lsp.enabled
      ? '- `lsp_hover`: Type info + graph impact (dependents, god nodes, communities).\n' +
        '- `lsp_go_to_definition`, `lsp_find_references`, `lsp_diagnostics`, `lsp_signature_help`: Code navigation via LSP.\n'
      : ''
    const toolsBlock =
      '\n\n## pi-scope Tools\n' +
      '- `hashline_edit`: Edit with hash anchors (`dry_run: true` validates + shows diff without writing).\n' +
      lspToolsLines +
      '- `hashline_read`: Read a file with hash anchors (use `start_line` / `end_line` for ranges).\n' +
      '- `/hashline-read <file>`: Same as hashline_read via slash command.\n' +
      `- Config: \`slim.dependencyDepth\` = ${depDepth} (transitive dep skeleton depth 0–3).\n` +
      '- `/scope`: Session dashboard (index, graph, injections, savings); `/scope history` for trends.\n' +
      '\n**Priority model:** pi-scope handles codebase intelligence (symbols, structure, context).\n' +
      'Use pi-sherlock tools (`search`, `fuzzy_find`, `find_files`, etc.) for ad-hoc or external searches.\n' +
      'After search tools return results, pi-scope automatically injects AST skeletons for the matched files.\n'

    const hashlinePreamble = s.config.hashline.enabled
      ? '\n\n## Hashline editing (pi-scope)\n' +
        '- Prefer `hashline_edit` with `dry_run: true` before writing files.\n' +
        '- LINE+bigram anchors appear in dep-context for in-focus files, or use `/hashline-read <path>`.\n' +
        '- Built-in `read` does **not** include hashline anchors.\n'
      : ''

    return {
      systemPrompt: `${event.systemPrompt}${hashlinePreamble}\n\n${result.content}${toolsBlock}`,
    }
  }

  // ── Tool Call ──────────────────────────────────────────────────────

  async handleToolCall(
    event: { toolName: string; input: Record<string, unknown> | undefined },
    _ctx: ExtensionContext
  ): Promise<{ block?: boolean; reason?: string } | undefined> {
    const s = this.state
    if (s) {
      const tn = event.toolName.toLowerCase()
      s.recentToolNames.push(tn)
      if (s.recentToolNames.length > 24) {
        s.recentToolNames.splice(0, s.recentToolNames.length - 24)
      }
    }

    const result = await this.pluginManager.runToolCall(event, _ctx)

    if (!result.allowed) {
      return { block: true, reason: result.reason ?? 'Tool call blocked by pi-scope plugin.' }
    }

    if (s?.config.hashline.enabled) {
      const tool = event.toolName.toLowerCase()
      const path = extractToolPath(event.input)
      if (path) {
        const abs = resolveProjectPath(s.projectRoot, path)
        if (tool === 'hashline_read') {
          this.hashlineAnchorPathsThisTurn.add(abs)
        }
        if (tool === 'hashline_edit') {
          const dryRun = Boolean(event.input?.dry_run)
          s.stats.recordHashlineEdit(dryRun)
          if (dryRun) {
            this.hashlineDryRunSeenForPath.add(abs)
          } else if (s.config.hashline.preferDryRun && !this.hashlineDryRunSeenForPath.has(abs)) {
            this._notify(nInfo(`First hashline_edit on \`${path}\` should use dry_run: true to preview the diff.`), 'info')
          }
        }
        if (s.config.hashline.recordOnRead && tool === 'read') {
          try {
            const raw = await readFile(abs, 'utf-8')
            AnchorStateManager.record(abs, raw)
          } catch {
            /* file may not exist yet */
          }
        }
      }
    }

    if (result.reason && s?.config.hashline.steerFromBuiltinEdit) {
      s.stats.recordBuiltinEditSteered()
      this._notify(nInfo(result.reason), 'info')
    }

    if (result.reason && s?.config.lsp.steerFromManualSearch) {
      this._notify(nInfo(result.reason), 'info')
    }

    if (s?.config.lsp.enabled) {
      const tool = event.toolName.toLowerCase()
      if (tool.startsWith('lsp_') && s.config.lsp.injectPathsSameTurn) {
        const path = extractToolPath(event.input)
        if (path) {
          this.lspResolvedPathsThisTurn.add(resolveProjectPath(s.projectRoot, path))
        }
      }
    }

    return undefined
  }

  // ── Context (per-turn) ────────────────────────────────────────────

  async handleContext(
    event: ContextEvent,
    ctx: ExtensionContext = SessionManager.DEFAULT_EXTENSION_CONTEXT
  ): Promise<{ messages: AgentMessage[]; content: string } | undefined> {
    try {
      this.syncConversationMessages(event.messages ?? [])
    } catch (error) {
      console.warn('handleContext: failed to sync conversation messages:', error)
      /* preserve prior buffer when mapping fails */
    }

    const s = this.state
    if (!s) return undefined

    if ((event.messages?.length ?? 0) === 0) {
      return { messages: [], content: '' }
    }

    this.hashlineAnchorPathsThisTurn.clear()
    this.lspResolvedPathsThisTurn.clear()
    await this.pluginManager.runHook('onContext', event.messages ?? [])

    const snapshot = await this.getIntelligenceSnapshot()
    const graph = snapshot.graph ?? this.graphService.analysis ?? null

    // Dep-context gates (unchanged)
    const recentMessages = (event.messages ?? []).slice(-s.config.scanLastNMessages)
    const hasFilePattern = recentMessages.some(m => {
      const text = extractText(m.content)
      return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) || /['"`]\.\.?\/[^'"`]+/.test(text)
    })
    const hasToolCall = recentMessages.some(m => (m as Record<string, unknown>).toolName)
    const hasToolResultWithFiles = recentMessages.some(m => {
      if ((m as Record<string, unknown>).role !== 'toolResult') return false
      const text = extractText(m.content)
      return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) || /```\w*\n/.test(text)
    })

    const hasSymbolMatch =
      !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && s.retrieval
        ? (() => {
            const lastText = extractText(recentMessages[recentMessages.length - 1]?.content ?? '')
            const scored = s.retrieval?.retrieveTopK(lastText, 3)
            return scored.length > 0 && scored[0].score >= 2
          })()
        : false

    const hasCodebaseQuery =
      !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && !hasSymbolMatch
        ? isBroadCodebaseQuery(extractText(recentMessages[recentMessages.length - 1]?.content ?? ''))
        : false

    const triggersDepContext =
      hasFilePattern || hasToolCall || hasToolResultWithFiles || hasSymbolMatch || hasCodebaseQuery

    // Build dep-context content ahead of time so we can extract file paths for stats
    let depContextContent: string | null = null
    if (triggersDepContext) {
      const extraPaths = new Set<string>()
      const lineRefs: FileReference[] = []
      const messagesPlain = (event.messages ?? []).map(m => ({
        role: m.role ?? 'user',
        content: extractText(m.content),
      }))
      for (const msg of event.messages ?? []) {
        const tn = (msg as Record<string, unknown>).toolName as string | undefined
        if (tn) {
          const input = (msg as Record<string, unknown>).input as Record<string, unknown> | undefined
          for (const r of detectPathsInToolCall(tn, input, { projectRoot: s.projectRoot, validateExistence: true })) {
            extraPaths.add(r.path)
            lineRefs.push(r)
          }
        }
        if ((msg as Record<string, unknown>).role === 'toolResult') {
          for (const r of detectPathsInOutput(tn ?? '', (msg as Record<string, unknown>).content, {
            projectRoot: s.projectRoot,
          })) {
            extraPaths.add(r.path)
            lineRefs.push(r)
          }
        }
      }

      if (s.config.lsp.enabled && s.config.lsp.injectPathsSameTurn) {
        const lspRelPaths = collectLspPathsFromMessages(
          (event.messages ?? []) as Record<string, unknown>[],
          s.projectRoot
        )
        for (const rel of lspRelPaths) {
          const abs = resolveProjectPath(s.projectRoot, rel)
          this.lspResolvedPathsThisTurn.add(abs)
          extraPaths.add(abs)
        }
      }

      if (s.config.lsp.enabled && s.config.lsp.suggestHoverOnCompilerErrors) {
        for (const hint of snapshot.insights.compilerErrors ?? []) {
          const abs = resolveProjectPath(s.projectRoot, hint.relPath)
          extraPaths.add(abs)
          this.lspResolvedPathsThisTurn.add(abs)
        }
      }

      if (s.config.lsp.enabled && s.config.lsp.recordToolMetrics) {
        for (const msg of event.messages ?? []) {
          const rec = msg as Record<string, unknown>
          const tn = rec.toolName
          if (typeof tn !== 'string' || !tn.startsWith('lsp_')) continue
          if (rec.role !== 'toolResult' && rec.role !== 'tool') continue
          const details = rec.details as { ok?: boolean } | undefined
          const text = extractText(rec.content)
          const ok = details?.ok ?? (!text.startsWith('LSP error:') && text.length > 0)
          if (rec.role === 'toolResult') {
            s.stats.recordLspTool(tn, ok, ok ? undefined : text)
          }
        }
      }

      const regionHints = collectLineRegionHints(s.projectRoot, messagesPlain, lineRefs)

      const hashlineOpts =
        s.config.hashline.enabled && s.config.hashline.annotateDepContext
          ? {
              enabled: true,
              maxLinesPerFile: s.config.hashline.annotateMaxLinesPerFile,
              annotateBySymbolRange: s.config.hashline.annotateBySymbolRange,
              annotateRangePaddingLines: s.config.hashline.annotateRangePaddingLines,
              recordOnRead: s.config.hashline.recordOnRead,
              regionHints,
            }
          : undefined

      const commPlugin = this.communityPruningPlugin()
      const activeCommunityId = commPlugin?.activeCommunityId ?? s.stats.activeCommunityId ?? null
      if (activeCommunityId) {
        s.stats.setActiveCommunityId(activeCommunityId)
        if (s.graphMetrics && graph) {
          s.graphMetrics.token = computeGraphTokenMetrics(graph, 1)
        }
      }

      depContextContent = s.injector.buildInjection(
        s.index,
        messagesPlain,
        extraPaths.size > 0 ? extraPaths : undefined,
        s.retrieval,
        s.config.dependencyDepth ?? 1,
        graph,
        hashlineOpts,
        graph && s.config.graph.enabled
          ? { activeCommunityId, graphConfig: s.config.graph }
          : undefined
      )

      const boosted =
        s.injector.lastExplanation?.filter(f => f.signals.some(sig => sig.startsWith('graph:')))?.length ?? 0
      if (boosted > 0) {
        s.stats.recordGraphBoostedRetrieval(boosted)
      }
    }

    this.hashlineAnchorPathsThisTurn = new Set(s.injector.lastInjectedHashlinePaths)
    if (this.hashlineAnchorPathsThisTurn.size > 0) {
      s.stats.recordHashlineAnchorInjectTurn()
    }
    const turnInsights = mergeHashlineInjectionInsights(
      snapshot.insights,
      this.hashlineAnchorPathsThisTurn,
      depContextContent
    )

    const graphCfg = s.config.graph
    const graphEnabled = graphCfg.enabled && graph
    const commPlugin = this.communityPruningPlugin()
    const activeCommunityId = commPlugin?.activeCommunityId ?? s.stats.activeCommunityId ?? null
    if (activeCommunityId) {
      s.stats.setActiveCommunityId(activeCommunityId)
    }

    let cycleWarn: string | null = null
    if (graphEnabled && graphCfg.warnWhenEditingCycleParticipant && depContextContent) {
      const focusPaths = extractInjectedFilePaths(depContextContent)
      cycleWarn = cycleWarningForFiles(graph, focusPaths, s.projectRoot)
    }

    // Assemble all context through the pipeline
    const pipeline = new InjectionPipeline()
    const budget = s.config.maxInjectionTokens

    if (graphEnabled && s.graphInsightsInjected && graphCfg.compactPulseEachTurn && !graphCfg.repeatFullInsights) {
      pipeline.register({
        name: 'graph-pulse',
        priority: 4.5,
        produce: () =>
          formatGraphPulse({
            analysis: graph!,
            insights: turnInsights,
            activeCommunityId,
            cycleWarning: cycleWarn,
          }),
      })
    } else if (graphEnabled && graphCfg.repeatFullInsights && graph) {
      pipeline.register({
        name: 'graph-insights-repeat',
        priority: 4.45,
        produce: () =>
          formatGraphInsightsSection(graph, {
            surfaceAnomalies: graphCfg.surfaceAnomaliesInInsights,
            surfaceSurprisesMax: graphCfg.surfaceSurprisesMax,
          }),
      })
    }

    if (
      s.config.hashline.enabled &&
      turnInsights.editingIntent.hasHashAnnotations &&
      (turnInsights.editingIntent.detected || triggersDepContext)
    ) {
      pipeline.register({
        name: 'hashline-turn-workflow',
        priority: 3.5,
        produce: () => formatHashlineTurnWorkflowBlock(),
      })
    }

    if (s.config.intelligence.enabled) {
      const intelOpts = this.intelligenceGuidanceOptions(s, turnInsights, hasCodebaseQuery)
      const cycleBlock =
        graphEnabled && graphCfg.warnWhenEditingCycleParticipant && depContextContent
          ? formatCycleIntelligenceBlock(graph, extractInjectedFilePaths(depContextContent), s.projectRoot)
          : null
      if (cycleBlock) {
        intelOpts.extraSections = [...(intelOpts.extraSections ?? []), cycleBlock]
      }
      pipeline.register({
        name: 'context-intelligence',
        priority: 4,
        produce: () => {
          const g = this.intelligenceEngine.generateActionableGuidance(
            turnInsights,
            graph,
            this.graphService.graph,
            intelOpts
          )
          this.markIntelligenceWorkflowInjected(s, g)
          return g.trim() ? g : null
        },
      })
    }

    pipeline.register({
      name: 'smart-dep-context',
      priority: 5,
      produce: () => {
        const exclude =
          graphCfg.dedupeGodNodesAcrossSources && s.graphInsightGodLabels.length > 0
            ? s.graphInsightGodLabels
            : undefined
        const dep = this.smartDepGenerator.generateEnhancedDependencyContext(snapshot.insights, graph, {
          excludeGodLabels: exclude,
        })
        return dep.trim() ? dep : null
      },
    })

    if (depContextContent?.trim()) {
      pipeline.register({
        name: 'dep-context',
        priority: 7,
        produce: () => depContextContent,
      })
    }

    if (s.config.hashline.enabled && s.config.hashline.injectDryRunFollowUp) {
      pipeline.register({
        name: 'hashline-dry-run-followup',
        priority: 8,
        produce: () => consumeDryRunFollowUpBlock(),
      })
    }

    const result = pipeline.build(budget)
    if (!result.content) return undefined

    // Record stats per injected source
    for (const entry of result.sources) {
      if (entry.name === 'graph-pulse' && entry.injected) {
        s.stats.recordGraphPulseInjection(entry.tokens)
      } else if (entry.name === 'graph-insights-repeat' && entry.injected) {
        s.stats.recordGraphInsightsInjection(entry.tokens)
      } else if (entry.name === 'context-intelligence' && entry.injected) {
        s.stats.recordIntelligenceInjection(entry.tokens)
      } else if (entry.name === 'smart-dep-context' && entry.injected) {
        s.stats.recordSmartDepContextInjection(entry.tokens)
      } else if (entry.name === 'dep-context' && entry.injected && depContextContent) {
        const files = extractInjectedFilePaths(depContextContent)
        let fullTokens = 0
        for (const f of files) {
          const skel = s.index.skeletons.get(f)
          if (skel) fullTokens += estimateFileSavings(f, skel).fullTokens
        }
        s.stats.recordDepContextInjection(files, entry.tokens, fullTokens)
      }
    }

    this.updateStatusBar(ctx)

    const contextMsg: AgentMessage = { role: 'developer', content: result.content }
    return { messages: [contextMsg, ...(event.messages ?? [])], content: result.content }
  }

  // ── Session shutdown ──────────────────────────────────────────────

  async shutdown(ctx: ExtensionContext): Promise<void> {
    this.stopAutoReindexWatcher()
    await this.pluginManager.runHook('onSessionShutdown')
    const s = this.state
    if (!s) return

    const commPlugin = this.communityPruningPlugin()
    if (commPlugin) {
      s.stats.recordCommunityPrune(commPlugin.getStats()?.pruneCount ?? 0)
    }

    const metrics = s.config.metrics
    if (metrics.enabled && metrics.notifyOnShutdown && s.stats.totalTokensSaved > 0) {
      const pct = Math.round(s.stats.savingsRatio * 100)
      this._notify(
        nSuccess(`Saved ~${s.stats.totalTokensSaved}t (${pct}% vs full reads) · ${s.stats.uniqueFilesInjected} files · ${s.stats.depContextTriggers} dep-context`),
        'success'
      )
    }

    if (ctx.hasUI) clearStatusBar(ctx.ui.setStatus)
    s.stats.persist(s.projectRoot).catch(error => {
      console.warn('pi-scope: session stats persistence failed:', error)
    })
    this.state = null
    this._notifyCtx = null
  }

  /** Notify via UI context if available. */
  private _notify(msg: string, level: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    this._notifyCtx?.ui.notify(msg, level)
  }

  // ── Status bar ────────────────────────────────────────────────────

  private statusBarState(): StatusBarState {
    const s = this.state!
    return {
      indexedFiles: s.stats.indexedFiles,
      repoMapTokens: s.stats.repoMapTokens,
      depContextTriggers: s.stats.depContextTriggers,
      contextFilesCount: s.stats.contextFilesCount,
      providerGuidanceCount: s.stats.providerGuidanceCount,
      graphCommunityCount: this._graphCommunityCount > 1 ? this._graphCommunityCount : undefined,
      tokensSaved: s.stats.totalTokensSaved > 0 ? s.stats.totalTokensSaved : undefined,
      graphQualityScore: s.graphMetrics?.quality.score,
    }
  }

  private updateStatusBar(ctx: ExtensionContext): void {
    if (!this.state) return
    try {
      if (!ctx.hasUI) return
      updateStatusBar(ctx.ui.setStatus, this.statusBarState())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('extension ctx is stale')) return
      throw err
    }
  }

  private startAutoReindexWatcher(ctx: ExtensionContext): void {
    this.stopAutoReindexWatcher()
    const s = this.state
    if (!s) return

    try {
      this.autoReindexWatcher = watch(s.projectRoot, { recursive: true }, (_eventType, filename) => {
        const path = typeof filename === 'string' ? filename.replaceAll('\\', '/') : ''
        if (path && this.shouldIgnoreAutoReindexPath(path)) return
        this.scheduleAutoReindex(ctx)
      })
    } catch (error) {
      console.warn('pi-scope: auto-reindex watcher unavailable:', error)
    }
  }

  private stopAutoReindexWatcher(): void {
    if (this.autoReindexTimer) {
      clearTimeout(this.autoReindexTimer)
      this.autoReindexTimer = null
    }
    this.autoReindexQueued = false
    this.autoReindexWatcher?.close()
    this.autoReindexWatcher = null
  }

  private shouldIgnoreAutoReindexPath(path: string): boolean {
    return (
      path.startsWith('.git/') ||
      path.startsWith('.pi/') ||
      path.includes('/.git/') ||
      path.includes('/.pi/') ||
      path.startsWith('node_modules/') ||
      path.includes('/node_modules/') ||
      path.startsWith('dist/') ||
      path.includes('/dist/')
    )
  }

  private scheduleAutoReindex(ctx: ExtensionContext): void {
    if (!this.state) return
    if (this.autoReindexTimer) clearTimeout(this.autoReindexTimer)
    this.autoReindexTimer = setTimeout(() => {
      this.autoReindexTimer = null
      void this.runAutoReindex(ctx)
    }, 300)
  }

  private async runAutoReindex(ctx: ExtensionContext): Promise<void> {
    if (!this.state) return
    if (this.autoReindexInFlight) {
      this.autoReindexQueued = true
      return
    }

    const currentState = this.state
    this.autoReindexInFlight = (async () => {
      try {
        ctx.ui.notify(nInfo('Reindexing after code changes...'), 'info')
        const result = await this.indexService.buildFresh(currentState.projectRoot, currentState.config)
        const contextFiles = currentState.config.contextFiles.enabled
          ? loadContextFiles(currentState.projectRoot, { filenames: currentState.config.contextFiles.filenames })
          : []

        currentState.stats.indexSource = 'fresh'
        currentState.stats.indexedFiles = result.fileCount
        currentState.stats.depEdges = [...result.index.deps.values()].reduce((sum, deps) => sum + deps.size, 0)
        currentState.stats.recordIndexLoaded(result.metadata as any)
        currentState.stats.recordIndexAge(0, false)

        await this.loadGraph(currentState.projectRoot, this.state)

        this.intelligenceEngine.setProjectRoot(currentState.projectRoot)

        this.state = this.initState({
          index: result.index,
          repoMap: result.repoMap,
          injector: currentState.injector,
          config: currentState.config,
          stats: currentState.stats,
          projectRoot: currentState.projectRoot,
          contextFiles,
        })
        this.state.retrieval = new RetrievalEngine(result.index)
        this.updateStatusBar(ctx)
        ctx.ui.notify(nSuccess(`Reindexed ${result.fileCount} files`), 'info')
      } catch (error) {
        console.warn('pi-scope: auto-reindex failed:', error)
        ctx.ui.notify(nWarn('Auto-reindex failed; continuing with previous index'), 'warning')
      } finally {
        this.autoReindexInFlight = null
        if (this.autoReindexQueued) {
          this.autoReindexQueued = false
          this.scheduleAutoReindex(ctx)
        }
      }
    })()

    await this.autoReindexInFlight
  }
}
