/**
 * SessionManager — lightweight orchestrator for pi-scope.
 *
 * Delegates to single-responsibility services:
 *   - IndexService — index build/cache/load
 *   - GraphService — graph analysis (god nodes, communities, cycles)
 *   - TelemetryService — all pi-telemetry integration
 *   - PluginManager — plugins (ContextPruning, ReadAwareness, CommunityPruning)
 *   - ContextInjector — per-turn context building
 *
 * SRP: manager.ts only orchestrates. Logic lives in services.
 * OCP: Adding features means adding services, not editing manager.
 * DIP: Services are constructed here, not hard-coded.
 */

import { relative } from 'node:path'
import type { RepoIndex, SlimConfig } from './shared/types.js'
import { ContextInjector } from './context/dep-context.js'
import { RetrievalEngine } from './context/retrieval.js'
import { InjectionPipeline } from './context/pipeline.js'
import { SessionStats } from './metrics/tracker.js'
import { storeExists, loadStore } from './indexer/index-store.js'
import { readState } from './shared/runtime-state.js'
import { extractText, extractInjectedFilePaths } from './shared/message.js'
import { isBroadCodebaseQuery } from './shared/query-intent.js'
import { estimateTokens } from './shared/token.js'
import { loadContextFiles, formatContextSection, type ContextFile } from './context/context-files.js'
import { loadProviderGuidance, formatProviderGuidanceSection, type ProviderGuidanceFile } from './context/guidance.js'
import { loadConfig } from './context/loader.js'
import { estimateFileSavings } from './metrics/cost-estimator.js'
import { PluginManager } from './plugins/plugin-manager.js'
import { ContextPruningPlugin } from './plugins/context-pruning.js'
import { CommunityPruningPlugin } from './plugins/community-pruning-plugin.js'
import { detectPathsInToolCall, detectPathsInOutput } from './shared/file-detector.js'
import { scopeDir } from './shared/paths.js'
import { info as nInfo, success as nSuccess, updateStatusBar, clearStatusBar, type StatusBarState } from './ui/notifications.js'
import { IndexService } from './services/index-service.js'
import { GraphService } from './services/graph-service.js'
import { TelemetryService } from './services/telemetry-service.js'
import { ContextIntelligenceEngine } from './context/intelligence-engine.js'
import { SmartDependencyContextGenerator } from './context/smart-dep-context.js'
import { SmartRepositoryMapGenerator } from './context/smart-repo-map.js'
import { produceDefaults } from './context/schema.js'
import { setLspGraphAnalysis } from './tools/lsp-navigation.js'
import type { GraphifyAnalysis } from './context/graph-types.js'
import type { ContextInsights } from './shared/intelligence-types.js'
import type { PipelineSource } from './context/pipeline.js'
import { SmartRepositoryMapGenerator } from './context/smart-repo-map.js'
import type { AgentMessage } from './shared/agent-message.js'
import type { OptionalGraphAnalysisLoader } from './shared/optional-graph-analysis-loader.js'

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
  intelligenceInjected: boolean
  retrieval: RetrievalEngine | undefined
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
  graph: GraphifyAnalysis | null,
): PipelineSource {
  return {
    name: 'repo-map',
    priority: 1,
    produce(): string | null {
      if (!baseMap) return null
      if (graph) {
        return new SmartRepositoryMapGenerator()
          .generatePrioritizedRepoMap(baseMap, insights, graph)
      }
      return baseMap
    },
  }
}

/**
 * Format the graph analysis insights block for system-prompt injection.
 */
export function formatGraphInsightsSection(a: GraphifyAnalysis): string {
  const lines: string[] = [
    '## Graph Analysis Insights',
    '',
    `**Graph:** ${a.metrics.totalNodes} nodes, ${a.metrics.totalEdges} edges, ${a.metrics.communityCount} communities`,
  ]
  if (a.metrics.cycleCount > 0) {
    lines.push(`**Circular Dependencies:** ${a.metrics.cycleCount}`)
  }
  lines.push('')
  if (a.godNodes.length > 0) {
    lines.push('**God Nodes (most depended-on symbols):**')
    for (const g of a.godNodes.slice(0, 5)) {
      lines.push(`  - \`${g.label}\` (${g.inDegree} in, ${g.outDegree} out, ${g.criticality})`)
    }
    if (a.godNodes.length > 5) {
      lines.push(`  - ... and ${a.godNodes.length - 5} more`)
    }
    lines.push('')
  }
  if (a.communities.length > 1) {
    lines.push('**Communities:**')
    for (const c of a.communities) {
      lines.push(`  - ${c.label}: ${c.nodes.length} nodes`)
    }
    lines.push('')
  }
  if (a.surprises.length > 0) {
    lines.push('**Notable connections:**')
    for (const s of a.surprises.slice(0, 3)) {
      lines.push(`  - \`${s.source}\` → \`${s.target}\` (${s.reason})`)
    }
  }
  return lines.filter(l => l !== undefined).join('\n').trimEnd()
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
  readonly telemetry = new TelemetryService()
  readonly indexService = new IndexService()
  readonly graphService = new GraphService()
  readonly pluginManager = new PluginManager()

  /** Graph analysis result (cached for telemetry) */
  private _graphNodeCount = 0
  private _graphEdgeCount = 0

  private intelligenceEngine: ContextIntelligenceEngine
  /**
   * Conversation buffer for intelligence analysis.
   *
   * **`handleContext`** — replaces with `event.messages` (host owns the canonical transcript).
   * **`addMessages`** — appends (programmatic ingest). Both paths truncate to {@link SessionManager.MAX_CONVERSATION_MESSAGES}
   * (oldest removed first).
   */
  private conversationMessages: AgentMessage[] = []

  constructor(_projectRoot?: string) {
    this.intelligenceEngine = new ContextIntelligenceEngine()
    this.pluginManager.register(new ContextPruningPlugin())
  }

  /**
   * Append messages to the intelligence transcript buffer (does not replace the host copy).
   * Oldest rows are dropped when length exceeds {@link SessionManager.MAX_CONVERSATION_MESSAGES}.
   */
  addMessages(messages: AgentMessage[]): void {
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
    return (await this.buildIntelligenceSnapshot()).insights
  }

  /** Natural-language steering block for agents (graph when available, otherwise basic tips). */
  async generateIntelligentGuidance(): Promise<string> {
    const { insights, graph } = await this.buildIntelligenceSnapshot()
    return this.intelligenceEngine.generateActionableGuidance(insights, graph, this.graphService.graph)
  }

  /** Same guidance string suitable for injecting alongside dep-context or tool hints. */
  async getEnhancedContextResponse(): Promise<string> {
    return this.generateIntelligentGuidance()
  }

  /**
   * Computes insights and the graph correlation used together in {@link generateActionableGuidance}.
   * On resolver or analyzer failure, repeats analysis **without** graph so callers always get usable output.
   */
  private async buildIntelligenceSnapshot(): Promise<{
    insights: ContextInsights
    graph: GraphifyAnalysis | null
  }> {
    try {
      const graph = await this.resolveGraphAnalysisForIntelligence()
      const insights = this.intelligenceEngine.analyzeConversationContext(
        this.conversationMessages,
        graph,
      )
      return { insights, graph }
    } catch (error) {
      console.warn(
        'pi-scope: buildIntelligenceSnapshot primary path failed; retrying analysis without resolved graph:',
        error,
      )
      const graph = null
      const insights = this.intelligenceEngine.analyzeConversationContext(
        this.conversationMessages,
        null,
      )
      return { insights, graph }
    }
  }

  /**
   * Replace buffer with the host's current transcript slice (typically full conversation).
   * Always trim after replace — pi may send arbitrarily long payloads.
   */
  private syncConversationMessages(messages: AgentMessage[]): void {
    this.conversationMessages = messages.map((m) => ({
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

  /**
   * Prefer {@link OptionalGraphAnalysisLoader.loadGraphifyAnalysis} when present;
   * otherwise use cached analysis from session graph load.
   */
  private async resolveGraphAnalysisForIntelligence(): Promise<GraphifyAnalysis | null> {
    try {
      const svc = this.graphService as GraphService & OptionalGraphAnalysisLoader
      if ('loadGraphifyAnalysis' in svc && typeof svc.loadGraphifyAnalysis === 'function') {
        const loaded = await svc.loadGraphifyAnalysis()
        if (loaded != null) return loaded
      }
    } catch (error) {
      console.warn(
        'pi-scope: resolveGraphAnalysisForIntelligence (loadGraphifyAnalysis) failed; using cached analysis if any:',
        error,
      )
    }
    return this.graphService.analysis
  }


  /**
   * Minimal session bootstrap for integration tests / graph-mocked intelligence.
   * Enables `handleContext` with an empty index and default slim config.
   */
  private async bootstrapMinimalIntelligenceSession(): Promise<void> {
    this.telemetry.register()
    this.telemetry.onSessionStart()
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
    if (
      typeof projectRoot !== 'string'
      || typeof getFlag !== 'function'
      || ctx === undefined
    ) {
      throw new Error('session start requires (projectRoot, getFlag, ctx) when bootstrap mode is disabled')
    }
    this.telemetry.register()
    this.telemetry.onSessionStart()

    const config: SlimConfig = loadConfig(projectRoot, {
      'slim.enabled': getFlag('slim.enabled'),
      'slim.maxRepoMapTokens': getFlag('slim.maxRepoMapTokens'),
      'slim.maxInjectionTokens': getFlag('slim.maxInjectionTokens'),
      'slim.scanLastNMessages': getFlag('slim.scanLastNMessages'),
      'slim.contextFiles.enabled': getFlag('slim.contextFiles.enabled'),
      'slim.providerGuidance.enabled': getFlag('slim.providerGuidance.enabled'),
    })
    if (!config.enabled) return

    const stats = new SessionStats(ctx.sessionManager.getSessionId())
    const injector = new ContextInjector(projectRoot, config.maxInjectionTokens, config.scanLastNMessages)

    // Run plugin hooks
    await this.pluginManager.runHook('onSessionStart', ctx)

    // Try cache
    if (await this.indexService.loadFromCache(projectRoot)) {
      const idx = this.indexService.index!
      stats.indexSource = 'cache'
      stats.indexedFiles = idx.skeletons.size
      stats.depEdges = [...idx.deps.values()].reduce((s, v) => s + v.size, 0)
      stats.recordIndexLoaded(this.indexService.metadata as any)

      if (this.indexService.metadata?.builtAt) {
        const ageHours = (Date.now() - new Date(this.indexService.metadata.builtAt).getTime()) / (1000 * 60 * 60)
        stats.recordIndexAge(ageHours, ageHours > 24)
      }

      this.telemetry.onCacheHit(idx.skeletons.size)

      const retrieval = new RetrievalEngine(idx)
      this.state = this.initState({ index: idx, repoMap: this.indexService.repoMap!, injector, config, stats, projectRoot })
      this.state.retrieval = retrieval

      // Load graph from cache
      await this.loadGraph(projectRoot, stats)
      this.updateStatusBar(ctx)
      return
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

      this.telemetry.onFreshBuild(result.fileCount, result.buildTimeMs)

      // Load graph
      await this.loadGraph(projectRoot, stats)

      // Context files
      const contextFiles = config.contextFiles.enabled
        ? loadContextFiles(projectRoot, { filenames: config.contextFiles.filenames })
        : []

      const retrieval = new RetrievalEngine(result.index)
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
      this.updateStatusBar(ctx)
    } catch (err) {
      this.telemetry.onError('index_failed', err)
      this.state = null
    }
  }

  /**
   * Load graph analysis from cache or compute fresh.
   * Tries external graphify output first, falls back to native index-based graph.
   */
  private async loadGraph(projectRoot: string, stats: SessionStats): Promise<void> {
    const cacheDir = scopeDir(projectRoot)
    setLspGraphAnalysis(null) // clear stale analysis

    // Try external graphify cache first
    if (await this.graphService.load(projectRoot, cacheDir)) {
      const a = this.graphService.analysis!
      this._graphNodeCount = a.metrics.totalNodes
      this._graphEdgeCount = a.metrics.totalEdges
      stats.godNodesCount = a.godNodes.length
      stats.communityCount = a.communities.length
      stats.circularDependencies = a.metrics.cycleCount
      this.telemetry.onGraphLoaded(this._graphNodeCount, this._graphEdgeCount)
      this.registerCommunityPruning(a)
      setLspGraphAnalysis(a)
      return
    }

    // Try external fresh analysis
    const extResult = await this.graphService.analyze(projectRoot, cacheDir)
    if (extResult) {
      this._graphNodeCount = extResult.graph.nodes.length
      this._graphEdgeCount = extResult.graph.edges.length
      stats.godNodesCount = extResult.analysis.godNodes.length
      stats.communityCount = extResult.analysis.communities.length
      stats.circularDependencies = extResult.analysis.metrics.cycleCount
      this.telemetry.onGraphLoaded(this._graphNodeCount, this._graphEdgeCount)
      this.registerCommunityPruning(extResult.analysis)
      setLspGraphAnalysis(extResult.analysis)
      return
    }

    // Fall back to native index-based graph analysis
    const index = this.indexService.index
    if (!index || index.skeletons.size === 0) {
      this.telemetry.onGraphNoData()
      setLspGraphAnalysis(null)
      return
    }

    const nativeResult = await this.graphService.analyzeFromIndex(index, projectRoot, cacheDir)
    this._graphNodeCount = nativeResult.graph.nodes.length
    this._graphEdgeCount = nativeResult.graph.edges.length
    stats.godNodesCount = nativeResult.analysis.godNodes.length
    stats.communityCount = nativeResult.analysis.communities.length
    stats.circularDependencies = nativeResult.analysis.metrics.cycleCount
    this.telemetry.onGraphLoaded(this._graphNodeCount, this._graphEdgeCount)
    this.registerCommunityPruning(nativeResult.analysis)
    setLspGraphAnalysis(nativeResult.analysis)
  }

  /**
   * Register CommunityPruningPlugin if graph has multiple communities.
   */
  private registerCommunityPruning(analysis: any): void {
    if (analysis.communities?.length > 1) {
      const existing = this.pluginManager.get('community-pruning') as CommunityPruningPlugin | undefined
      if (existing) {
        existing.setAnalysis(analysis)
      } else {
        const plugin = new CommunityPruningPlugin()
        plugin.setAnalysis(analysis)
        this.pluginManager.register(plugin)
      }
    }
  }

  private initState(opts: {
    index: RepoIndex; repoMap: string; injector: ContextInjector
    config: SlimConfig; stats: SessionStats; projectRoot: string
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
      intelligenceInjected: false,
      retrieval: undefined,
    }
  }

  // ── Before agent start ────────────────────────────────────────────

  async handleBeforeAgentStart(
    event: BeforeAgentStartEvent,
    ctx: ExtensionContext,
  ): Promise<{ systemPrompt: string } | undefined> {
    const s = this.state
    if (!s) return undefined
    if (
      s.repoMapInjected &&
      s.contextFilesInjected &&
      s.providerGuidanceInjected &&
      s.graphInsightsInjected &&
      s.intelligenceInjected
    ) return undefined

    const snapshot = await this.buildIntelligenceSnapshot()
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
          name: 'provider-guidance', priority: 2,
          produce: () => {
            const files = loadProviderGuidance(s.projectRoot, provider, modelId)
            if (files.length > 0) { s.providerGuidanceFiles = files; return formatProviderGuidanceSection(files) }
            return null
          },
        })
      }
    }

    if (!s.graphInsightsInjected && graph) {
      pipeline.register({
        name: 'graph-insights',
        priority: 3,
        produce: () => formatGraphInsightsSection(graph),
      })
    }

    if (!s.intelligenceInjected) {
      pipeline.register({
        name: 'context-intelligence',
        priority: 4,
        produce: () => {
          const guidance = this.intelligenceEngine.generateActionableGuidance(
            snapshot.insights,
            graph,
            this.graphService.graph,
          )
          return guidance.trim()
            ? `## Context intelligence\n\n${guidance}`
            : null
        },
      })
    }

    if (!s.contextFilesInjected && s.contextFiles.length > 0) {
      pipeline.register({
        name: 'context-files', priority: 6,
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

    const toolsBlock =
      '\n\n## pi-scope Tools\n' +
      '- `hashline_edit`: Edit files using hash anchors (shown in skeleton output). No re-read needed.\n' +
      '- `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`: Code navigation via LSP.\n' +
      '- `/hashline-read <file>`: Read a file with hash anchors for editing.\n' +
      '\n**Priority model:** pi-scope handles codebase intelligence (symbols, structure, context).\n' +
      'Use pi-sherlock tools (`search`, `fuzzy_find`, `find_files`, etc.) for ad-hoc or external searches.\n' +
      'After search tools return results, pi-scope automatically injects AST skeletons for the matched files.\n'

    return {
      systemPrompt: event.systemPrompt + '\n\n' + result.content + toolsBlock,
    }
  }

  // ── Tool Call ──────────────────────────────────────────────────────

  handleToolCall(event: { toolName: string; input: Record<string, unknown> | undefined }, _ctx: ExtensionContext): { block?: boolean; reason?: string } | undefined {
    this.pluginManager.runToolCall(event, _ctx).catch((error) => {
      console.warn('pi-scope: context plugin/tool-call hook failed:', error)
    })
    return undefined
  }

  // ── Context (per-turn) ────────────────────────────────────────────

  async handleContext(
    event: ContextEvent,
    ctx: ExtensionContext = SessionManager.DEFAULT_EXTENSION_CONTEXT,
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

    await this.pluginManager.runHook('onContext', event.messages ?? [])

    const snapshot = await this.buildIntelligenceSnapshot()
    const graph = snapshot.graph ?? this.graphService.analysis ?? null

    // Dep-context gates (unchanged)
    const recentMessages = (event.messages ?? []).slice(-s.config.scanLastNMessages)
    const hasFilePattern = recentMessages.some(m => {
      const text = extractText(m.content)
      return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) ||
        /['"`]\.\.?\/[^'"`]+/.test(text)
    })
    const hasToolCall = recentMessages.some(m => (m as Record<string, unknown>).toolName)
    const hasToolResultWithFiles = recentMessages.some(m => {
      if ((m as Record<string, unknown>).role !== 'toolResult') return false
      const text = extractText(m.content)
      return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) ||
        /```\w*\n/.test(text)
    })

    const hasSymbolMatch = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && s.retrieval
      ? (() => {
          const lastText = extractText(recentMessages[recentMessages.length - 1]?.content ?? '')
          const scored = s.retrieval!.retrieveTopK(lastText, 3)
          return scored.length > 0 && scored[0].score >= 2
        })()
      : false

    const hasCodebaseQuery = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && !hasSymbolMatch
      ? isBroadCodebaseQuery(extractText(recentMessages[recentMessages.length - 1]?.content ?? ''))
      : false

    const triggersDepContext =
      hasFilePattern || hasToolCall || hasToolResultWithFiles || hasSymbolMatch || hasCodebaseQuery

    // Build dep-context content ahead of time so we can extract file paths for stats
    let depContextContent: string | null = null
    if (triggersDepContext) {
      const extraPaths = new Set<string>()
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
          }
        }
        if ((msg as Record<string, unknown>).role === 'toolResult') {
          for (const r of detectPathsInOutput(
            tn ?? '',
            (msg as Record<string, unknown>).content,
            { projectRoot: s.projectRoot },
          )) {
            extraPaths.add(r.path)
          }
        }
      }

      depContextContent = s.injector.buildInjection(
        s.index,
        messagesPlain,
        extraPaths.size > 0 ? extraPaths : undefined,
        s.retrieval,
        s.config.dependencyDepth ?? 1,
      )
    }

    // Assemble all context through the pipeline
    const pipeline = new InjectionPipeline()
    const budget = s.config.maxInjectionTokens

    pipeline.register({
      name: 'context-intelligence',
      priority: 4,
      produce: () => {
        const g = this.intelligenceEngine.generateActionableGuidance(snapshot.insights, graph, this.graphService.graph)
        return g.trim() ? g : null
      },
    })

    pipeline.register({
      name: 'smart-dep-context',
      priority: 5,
      produce: () => {
        const gen = new SmartDependencyContextGenerator()
        const dep = gen.generateEnhancedDependencyContext(snapshot.insights, graph)
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

    const result = pipeline.build(budget)
    if (!result.content) return undefined

    // Record stats per injected source
    for (const entry of result.sources) {
      if (entry.name === 'context-intelligence' && entry.injected) {
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
    await this.pluginManager.runHook('onSessionShutdown')
    const s = this.state
    if (!s) return
    this.telemetry.onSessionShutdown()
    if (ctx.hasUI) clearStatusBar(ctx.ui.setStatus)
    s.stats.persist(s.projectRoot).catch((error) => {
      console.warn('pi-scope: session stats persistence failed:', error)
    })
    this.state = null
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
    }
  }

  private updateStatusBar(ctx: ExtensionContext): void {
    if (!this.state || !ctx.hasUI) return
    updateStatusBar(ctx.ui.setStatus, this.statusBarState())
  }
}
