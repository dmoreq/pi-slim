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
import { ReadAwarenessPlugin } from './plugins/read-awareness.js'
import { CommunityPruningPlugin } from './plugins/community-pruning-plugin.js'
import { detectPathsInToolCall, detectPathsInOutput } from './shared/file-detector.js'
import { scopeDir } from './shared/paths.js'
import { info as nInfo, success as nSuccess, updateStatusBar, clearStatusBar, type StatusBarState } from './ui/notifications.js'
import { IndexService } from './services/index-service.js'
import { GraphService } from './services/graph-service.js'
import { TelemetryService } from './services/telemetry-service.js'
import { ContextIntelligenceEngine } from './context/intelligence-engine.js'
import type { GraphifyAnalysis } from './context/graph-types.js'
import type { ContextInsights } from './shared/intelligence-types.js'

// ── Types ──────────────────────────────────────────────────────────────

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

export interface AgentMessage {
  role?: string
  content?: unknown
  [key: string]: unknown
}

export interface ContextEvent {
  type: 'context'
  messages: AgentMessage[]
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
  retrieval: RetrievalEngine | undefined
}

// ── Manager ────────────────────────────────────────────────────────────

export class SessionManager {
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
  /** Transcript slice retained for pattern detection / guidance (also synced from {@link handleContext}). */
  private conversationMessages: AgentMessage[] = []

  constructor(_projectRoot?: string) {
    this.intelligenceEngine = new ContextIntelligenceEngine()
    this.pluginManager.register(new ContextPruningPlugin())
    this.pluginManager.register(new ReadAwarenessPlugin())
  }

  /**
   * Append messages to the conversation buffer used by the intelligence engine.
   */
  addMessages(messages: AgentMessage[]): void {
    for (const m of messages) {
      this.conversationMessages.push({
        ...m,
        content: extractText(m.content),
      })
    }
  }

  /** Run pattern + graph-aware analysis over the current conversation buffer. */
  async analyzeCurrentContext(): Promise<ContextInsights> {
    const graph = await this.resolveGraphAnalysisForIntelligence()
    return this.intelligenceEngine.analyzeConversationContext(
      this.conversationMessages,
      graph,
    )
  }

  /** Natural-language steering block for agents (graph when available, otherwise basic tips). */
  async generateIntelligentGuidance(): Promise<string> {
    try {
      const graph = await this.resolveGraphAnalysisForIntelligence()
      const insights = this.intelligenceEngine.analyzeConversationContext(
        this.conversationMessages,
        graph,
      )
      return this.intelligenceEngine.generateActionableGuidance(insights, graph)
    } catch {
      const insights = this.intelligenceEngine.analyzeConversationContext(
        this.conversationMessages,
        null,
      )
      return this.intelligenceEngine.generateActionableGuidance(insights, null)
    }
  }

  /** Same guidance string suitable for injecting alongside dep-context or tool hints. */
  async getEnhancedContextResponse(): Promise<string> {
    return this.generateIntelligentGuidance()
  }

  /**
   * Prefer optional `loadGraphifyAnalysis()` on {@link GraphService} when tests or hosts
   * inject it; otherwise use analysis loaded during session start.
   */
  private async resolveGraphAnalysisForIntelligence(): Promise<GraphifyAnalysis | null> {
    try {
      const gs = this.graphService as GraphService & {
        loadGraphifyAnalysis?: () => Promise<GraphifyAnalysis | null>
      }
      if (typeof gs.loadGraphifyAnalysis === 'function') {
        const loaded = await gs.loadGraphifyAnalysis()
        if (loaded != null) return loaded
      }
    } catch {
      /* use graphService.analysis */
    }
    return this.graphService.analysis
  }

  // ── Session start ──────────────────────────────────────────────────

  async start(projectRoot: string, getFlag: (name: string) => unknown, ctx: ExtensionContext): Promise<void> {
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
      return
    }

    // Fall back to native index-based graph analysis
    const index = this.indexService.index
    if (!index || index.skeletons.size === 0) {
      this.telemetry.onGraphNoData()
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
      retrieval: undefined,
    }
  }

  // ── Before agent start ────────────────────────────────────────────

  handleBeforeAgentStart(event: BeforeAgentStartEvent, ctx: ExtensionContext): { systemPrompt: string } | undefined {
    const s = this.state
    if (!s) return undefined
    if (s.repoMapInjected && s.contextFilesInjected && s.providerGuidanceInjected) return undefined

    const pipeline = new InjectionPipeline()
    const combinedBudget = s.config.maxRepoMapTokens + s.config.maxInjectionTokens

    if (!s.repoMapInjected && s.repoMap) {
      pipeline.register({ name: 'repo-map', priority: 1, produce: () => s.repoMap! })
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

    if (!s.contextFilesInjected && s.contextFiles.length > 0) {
      pipeline.register({
        name: 'context-files', priority: 4,
        produce: () => formatContextSection(s.contextFiles, { sectionTitle: s.config.contextFiles.sectionTitle }),
      })
    }

    const result = pipeline.build(combinedBudget)
    if (!result.content) return undefined

    // Graph analysis insights — auto-inject when available
    let graphSection = ''
    if (this.graphService.analysis) {
      const a = this.graphService.analysis
      graphSection = [
        '\n\n## Graph Analysis Insights',
        '',
        `**Graph:** ${a.metrics.totalNodes} nodes, ${a.metrics.totalEdges} edges, ${a.metrics.communityCount} communities`,
        a.metrics.cycleCount > 0 ? `**Circular Dependencies:** ${a.metrics.cycleCount}` : '',
        '',
        a.godNodes.length > 0 ? [
          '**God Nodes (most depended-on symbols):**',
          ...a.godNodes.slice(0, 5).map(g => `  - \`${g.label}\` (${g.inDegree} in, ${g.outDegree} out, ${g.criticality})`),
          a.godNodes.length > 5 ? `  - ... and ${a.godNodes.length - 5} more` : '',
          '',
        ].filter(Boolean).join('\n') : '',
        a.communities.length > 1 ? [
          '**Communities:**',
          ...a.communities.map(c => `  - ${c.label}: ${c.nodes.length} nodes`),
          '',
        ].join('\n') : '',
        a.surprises.length > 0 ? [
          '**Notable connections:**',
          ...a.surprises.slice(0, 3).map(s => `  - \`${s.source}\` → \`${s.target}\` (${s.reason})`),
          '',
        ].join('\n') : '',
      ].filter(Boolean).join('\n')
    }

    // Dispatch injection telemetry
    for (const entry of result.sources) {
      const tokens = entry.tokens
      if (entry.name === 'repo-map' && entry.injected) {
        s.repoMapInjected = true
        s.stats.recordRepoMapInjection(tokens)
        // Telemetry for context injections handled by pi-telemetry auto-tracking
      } else if (entry.name === 'provider-guidance' && entry.injected && s.providerGuidanceFiles.length > 0) {
        s.providerGuidanceInjected = true
        s.stats.recordProviderGuidanceInjection(tokens, s.providerGuidanceFiles.length)
        // Telemetry for context injections handled by pi-telemetry auto-tracking
      } else if (entry.name === 'context-files' && entry.injected) {
        s.contextFilesInjected = true
        s.stats.recordContextFilesInjection(tokens, s.contextFiles.length)
        // Telemetry for context injections handled by pi-telemetry auto-tracking
      }
    }

    this.updateStatusBar(ctx)
    return {
      systemPrompt: event.systemPrompt
        + '\n\n' + result.content
        + graphSection
        + '\n\n## pi-scope Tools\n'
        + '- `hashline_edit`: Edit files using hash anchors (shown in skeleton output). No re-read needed.\n'
        + '- `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`: Code navigation via LSP.\n'
        + '- `/hashline-read <file>`: Read a file with hash anchors for editing.\n'
        + '\n**Priority model:** pi-scope handles codebase intelligence (symbols, structure, context).\n'
        + 'Use pi-sherlock tools (`search`, `fuzzy_find`, `find_files`, etc.) for ad-hoc or external searches.\n'
        + 'After search tools return results, pi-scope automatically injects AST skeletons for the matched files.\n',
    }
  }

  // ── Tool Call ──────────────────────────────────────────────────────

  handleToolCall(event: { toolName: string; input: Record<string, unknown> | undefined }, _ctx: ExtensionContext): { block?: boolean; reason?: string } | undefined {
    this.pluginManager.runToolCall(event, _ctx).catch(() => {})
    return undefined
  }

  // ── Context (per-turn) ────────────────────────────────────────────

  async handleContext(event: ContextEvent, ctx: ExtensionContext): Promise<{ messages: AgentMessage[] } | undefined> {
    const s = this.state
    if (!s) return undefined

    try {
      this.conversationMessages = event.messages.map((m) => ({
        ...m,
        content: extractText(m.content),
      }))
    } catch {
      /* keep previous buffer */
    }

    // Run context plugins (pruning, community filter)
    await this.pluginManager.runHook('onContext', event.messages)

    // Early-exit: skip if no reason to inject dep-context
    // Checks: file paths in user text, tool calls, tool results with paths, or symbol matches
    const recentMessages = event.messages.slice(-s.config.scanLastNMessages)
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

    // Also check if query text matches any symbol in the index (retrieval-based trigger)
    const hasSymbolMatch = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && s.retrieval
      ? (() => {
          const lastText = extractText(recentMessages[recentMessages.length - 1]?.content ?? '')
          const scored = s.retrieval!.retrieveTopK(lastText, 3)
          return scored.length > 0 && scored[0].score >= 2
        })()
      : false

    // Broad codebase-introspection query (no specific paths/symbols, but clearly codebase-related)
    const hasCodebaseQuery = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && !hasSymbolMatch
      ? isBroadCodebaseQuery(extractText(recentMessages[recentMessages.length - 1]?.content ?? ''))
      : false

    if (!hasFilePattern && !hasToolCall && !hasToolResultWithFiles && !hasSymbolMatch && !hasCodebaseQuery) {
      return undefined
    }

    const messages = event.messages.map(m => ({ role: m.role ?? 'user', content: extractText(m.content) }))

    // Scan tool calls + output for extra file paths
    const extraPaths = new Set<string>()
    for (const msg of event.messages) {
      const toolName = (msg as Record<string, unknown>).toolName as string | undefined
      if (toolName) {
        const input = (msg as Record<string, unknown>).input as Record<string, unknown> | undefined
        for (const r of detectPathsInToolCall(toolName, input, { projectRoot: s.projectRoot, validateExistence: true })) {
          extraPaths.add(r.path)
        }
      }
      if ((msg as Record<string, unknown>).role === 'toolResult') {
        for (const r of detectPathsInOutput(toolName ?? '', (msg as Record<string, unknown>).content, { projectRoot: s.projectRoot })) {
          extraPaths.add(r.path)
        }
      }
    }

    const depContext = s.injector.buildInjection(
      s.index, messages,
      extraPaths.size > 0 ? extraPaths : undefined,
      s.retrieval,
      s.config.dependencyDepth ?? 1,
    )
    if (!depContext) return undefined

    const tokens = estimateTokens(depContext)
    const files = extractInjectedFilePaths(depContext)

    // Estimate savings
    let fullTokens = 0
    for (const f of files) {
      const skel = s.index.skeletons.get(f)
      if (skel) {
        const est = estimateFileSavings(f, skel)
        fullTokens += est.fullTokens
      }
    }
    s.stats.recordDepContextInjection(files, tokens, fullTokens)

    // Telemetry for dep-context handled by pi-telemetry auto-tracking

    this.updateStatusBar(ctx)

    const contextMsg: AgentMessage = { role: 'developer', content: depContext }
    return { messages: [contextMsg, ...event.messages] }
  }

  // ── Session shutdown ──────────────────────────────────────────────

  async shutdown(ctx: ExtensionContext): Promise<void> {
    await this.pluginManager.runHook('onSessionShutdown')
    const s = this.state
    if (!s) return
    this.telemetry.onSessionShutdown()
    if (ctx.hasUI) clearStatusBar(ctx.ui.setStatus)
    s.stats.persist(s.projectRoot).catch(() => {})
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

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}
