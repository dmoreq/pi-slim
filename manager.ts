/**
 * SessionManager — owns all session lifecycle logic for pi-slim.
 *
 * Uses PluginManager for OCP compliance:
 * - Built-in plugins: ContextPruningPlugin, ReadAwarenessPlugin
 * - Custom plugins: register via pluginManager.register()
 *
 * Uses telemetry-helpers for DRY compliance:
 * - Consolidated telemetry recording replaces inline getTelemetry() calls
 */

import { relative } from 'node:path'
import type { RepoIndex } from './shared/types.js'
import { type SlimConfig } from './shared/types.js'
import { IndexEngine } from './indexer/engine.js'
import { RepoMapGenerator } from './context/repo-map.js'
import { ContextInjector } from './context/dep-context.js'
import { InjectionPipeline } from './context/pipeline.js'
import { SessionStats } from './metrics/tracker.js'
import { storeExists, saveStore, loadStore } from './indexer/index-store.js'
import { readState } from './shared/runtime-state.js'
import { extractText, extractInjectedFilePaths } from './shared/message.js'
import { estimateTokens } from './shared/token.js'
import { loadContextFiles, formatContextSection, buildStartupNotification, type ContextFile } from './context/context-files.js'
import { loadProviderGuidance, formatProviderGuidanceSection, buildGuidanceNotification, type ProviderGuidanceFile } from './context/guidance.js'
import { getTelemetry } from 'pi-telemetry'
import { detectPathsInToolCall, detectPathsInOutput } from './shared/file-detector.js'
import { info as nInfo, warn as nWarn, error as nError, success as nSuccess, updateStatusBar, clearStatusBar, type StatusBarState } from './ui/notifications.js'
import { loadConfig } from './context/loader.js'
import { estimateFileSavings, buildCostEstimate } from './metrics/cost-estimator.js'
import { PluginManager } from './plugins/plugin-manager.js'
import { ContextPruningPlugin } from './plugins/context-pruning.js'
import { ReadAwarenessPlugin } from './plugins/read-awareness.js'
import { recordInjection, recordSessionError, recordHeartbeat } from './shared/telemetry-helpers.js'

// ── Types (mirroring pi extension API surface) ────────────────────────────

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

// ── Session state ─────────────────────────────────────────────────────────

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
}

// ── Manager ───────────────────────────────────────────────────────────────

let _telemetryRegistered = false;
function _ensureTelemetry(): void {
  if (_telemetryRegistered) return;
  _telemetryRegistered = true;
  try {
    getTelemetry()?.register({
      name: "pi-slim",
      version: "0.3.0",
      description: "AST-powered context + pruning + LSP navigation for pi",
      tools: ["repo-map", "dep-context", "context-files", "provider-guidance", "pruning"],
      events: ["session_start", "before_agent_start", "context", "session_shutdown"],
    });
  } catch {}
}

export class SessionManager {
  readonly name = 'pi-slim'
  readonly version = '0.2.0'
  protected readonly description = 'AST-powered context + pruning + LSP navigation for pi'
  protected readonly tools = ['repo-map', 'dep-context', 'context-files', 'provider-guidance', 'pruning']
  protected readonly events = ['session_start', 'before_agent_start', 'context', 'session_shutdown']

  state: SessionState | null = null

  /** Plugin manager for registering built-in and custom plugins. */
  readonly pluginManager = new PluginManager()

  constructor() {
    // Register built-in plugins
    this.pluginManager.register(new ContextPruningPlugin())
    this.pluginManager.register(new ReadAwarenessPlugin())
  }

  // ── Session start ─────────────────────────────────────────────────────

  async start(projectRoot: string, getFlag: (name: string) => unknown, ctx: ExtensionContext): Promise<void> {
    _ensureTelemetry()
    const sessionId = ctx.sessionManager.getSessionId()
    const flags: Record<string, unknown> = {
      'slim.enabled': getFlag('slim.enabled'),
      'slim.maxRepoMapTokens': getFlag('slim.maxRepoMapTokens'),
      'slim.maxInjectionTokens': getFlag('slim.maxInjectionTokens'),
      'slim.scanLastNMessages': getFlag('slim.scanLastNMessages'),
      'slim.contextFiles.enabled': getFlag('slim.contextFiles.enabled'),
      'slim.providerGuidance.enabled': getFlag('slim.providerGuidance.enabled'),
    }
    const config: SlimConfig = loadConfig(projectRoot, flags)
    if (!config.enabled) return

    const stats = new SessionStats(sessionId)
    const injector = new ContextInjector(projectRoot, config.maxInjectionTokens, config.scanLastNMessages)

    // Run plugin session start hooks
    await this.pluginManager.runHook('onSessionStart', ctx)

    // Try loading from cache
    if (await storeExists(projectRoot)) {
      ctx.ui.notify(nInfo('loading index from .pi/slim/\u2026'), 'info')
      try {
        const { index, repoMap, builtAt, fileCount } = await loadStore(projectRoot)
        stats.indexSource = 'cache'
        stats.indexedFiles = fileCount
        stats.depEdges = [...index.deps.values()].reduce((s, v) => s + v.size, 0)
        ctx.ui.notify(nSuccess(`${fileCount} files loaded (built ${new Date(builtAt).toLocaleDateString()})`), 'info')
        this.state = this.initState({ index, repoMap, injector, config, stats, projectRoot })
        this.updateStatusBar(ctx)
        recordHeartbeat('healthy')
        return
      } catch (err) {
        recordSessionError('cache_corrupt', `Store corrupted: ${String(err)}`)
        ctx.ui.notify(nWarn(`store corrupted, rebuilding\u2026 (${String(err)})`), 'warn')
      }
    }

    // Fresh build
    ctx.ui.notify(nInfo('first run \u2014 indexing project (this takes a few seconds)\u2026'), 'info')
    try {
      const engine = new IndexEngine(projectRoot, config)
      await engine.build()
      const index = engine.getRepoIndex()
      const repoMap = new RepoMapGenerator(projectRoot, config.maxRepoMapTokens).generate(index)
      await saveStore(projectRoot, index, repoMap)

      const edgeCount = [...index.deps.values()].reduce((s, v) => s + v.size, 0)
      stats.indexSource = 'fresh'
      stats.indexedFiles = index.skeletons.size
      stats.depEdges = edgeCount
      recordHeartbeat('healthy')
      ctx.ui.notify(nSuccess(`indexed ${index.skeletons.size} files, ${edgeCount} edges \u2192 .pi/slim/`), 'info')

      const contextFiles = config.contextFiles.enabled
        ? loadContextFiles(projectRoot, { filenames: config.contextFiles.filenames })
        : []
      if (contextFiles.length > 0) {
        ctx.ui.notify(nInfo(buildStartupNotification(contextFiles, projectRoot, config.contextFiles)), 'info')
      }

      this.state = this.initState({ index, repoMap, injector, config, stats, projectRoot, contextFiles })
      this.updateStatusBar(ctx)
    } catch (err) {
      recordSessionError('index_failed', `Indexing failed: ${String(err)}`)
      recordHeartbeat('error', `Indexing failed: ${String(err)}`)
      ctx.ui.notify(nError(`indexing failed: ${String(err)}`), 'error')
      this.state = null
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
    }
  }

  // ── Before agent start ───────────────────────────────────────────────

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

    // Append hashline usage guidance to system prompt
    const hashlineGuidance =
      '\n\n## Hashline Edit Tool\n' +
      'When you need to edit a file, use the `hashline_edit` tool instead of the built-in `edit` tool.\n' +
      'First read the file with the `read` tool to see hashline anchors (e.g. `1tz|function hi()`).\n' +
      'Then reference specific lines by their LINE+BIGRAM anchor (e.g. `"1tz"` to target line 1).\n' +
      'This avoids re-reading the file — the anchor is checked against the current content.\n' +
      'Supported operations: append, prepend, append_at, prepend_at, replace_line with a single\n' +
      'anchor, and replace_range with pos+end anchors.';

    // Dispatch injection telemetry (replaces INJECTION_HANDLERS)
    for (const entry of result.sources) {
      const tokens = entry.tokens
      if (entry.name === 'repo-map' && entry.injected) {
        s.repoMapInjected = true
        s.stats.recordRepoMapInjection(tokens)
        recordInjection('repo-map', tokens)
      } else if (entry.name === 'provider-guidance' && entry.injected && s.providerGuidanceFiles.length > 0) {
        s.providerGuidanceInjected = true
        s.stats.recordProviderGuidanceInjection(tokens, s.providerGuidanceFiles.length)
        ctx.ui.notify(nInfo(buildGuidanceNotification(s.providerGuidanceFiles, s.projectRoot)), 'info')
        recordInjection('provider-guidance', tokens)
      } else if (entry.name === 'context-files' && entry.injected) {
        s.contextFilesInjected = true
        s.stats.recordContextFilesInjection(tokens, s.contextFiles.length)
        recordInjection('context-files', tokens)
      } else if (entry.trimmed) {
        ctx.ui.notify(nWarn(`${entry.name} trimmed (${tokens} tokens > budget)`), 'warn')
        getTelemetry()?.recordError('pi-slim', 'trimmed', `${entry.name} trimmed (${tokens} tokens > budget)`)
      }
    }

    this.updateStatusBar(ctx)
    return { systemPrompt: event.systemPrompt + '\n\n' + result.content + hashlineGuidance }
  }

  // ── Context (per-turn) ───────────────────────────────────────────────

  handleContext(event: ContextEvent, ctx: ExtensionContext): { messages: AgentMessage[] } | undefined {
    const s = this.state
    if (!s) return undefined

    // Run context plugins (pruning, etc.) BEFORE building dep-context
    void this.pluginManager.runHook('onContext', event.messages)

    // Early-exit: skip scanning if no file-like patterns in recent messages
    const recentMessages = event.messages.slice(-s.config.scanLastNMessages)
    const hasFilePattern = recentMessages.some(m => {
      const text = extractText(m.content)
      return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) ||
        /['"`]\.\.?\/[^'"`]+/.test(text)
    })
    if (!hasFilePattern && !recentMessages.some(m => (m as Record<string, unknown>).toolName)) {
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

    const depContext = s.injector.buildInjection(s.index, messages, extraPaths.size > 0 ? extraPaths : undefined)
    if (!depContext) return undefined

    const tokens = estimateTokens(depContext)
    const files = extractInjectedFilePaths(depContext)

    // Estimate cost savings
    let fullTokens = 0
    for (const f of files) {
      const skel = s.index.skeletons.get(f)
      if (skel) {
        const est = estimateFileSavings(f, skel)
        fullTokens += est.fullTokens
      }
    }
    s.stats.recordDepContextInjection(files, tokens, fullTokens)

    // Record telemetry via consolidated helper
    recordInjection('dep-context', tokens, files)

    this.updateStatusBar(ctx)

    const fileNames = files.map(f => relative(s.projectRoot, f)).join(', ')
    const pct = s.stats.savingsRatio > 0 ? ` (${Math.round(s.stats.savingsRatio * 100)}% saved)` : ''
    ctx.ui.notify(nInfo(`injecting ${files.length} file(s) (~${tokens} tokens${pct}): ${fileNames}`), 'info')

    const contextMsg: AgentMessage = { role: 'developer', content: depContext }
    return { messages: [contextMsg, ...event.messages] }
  }

  // ── Session shutdown ─────────────────────────────────────────────────

  async shutdown(ctx: ExtensionContext): Promise<void> {
    // Run plugin shutdown hooks
    await this.pluginManager.runHook('onSessionShutdown')

    const s = this.state
    if (!s) return
    ctx.ui.notify(nInfo(`session summary \u2014 ${s.stats.summary()}`), 'info')
    if (ctx.hasUI) clearStatusBar(ctx.ui.setStatus)
    s.stats.persist(s.projectRoot).catch(() => {})
    this.state = null
  }

  // ── Stats command ────────────────────────────────────────────────────

  async showStats(ctx: ExtensionContext): Promise<void> {
    const s = this.state
    if (s) {
      ctx.ui.notify(s.stats.report(), 'info')
      return
    }
    try {
      const state = await readState(ctx.cwd)
      if (state?.lastSession) {
        const ls = state.lastSession as Record<string, unknown>
        ctx.ui.notify([
          '\u2014\u2014 slim last session stats \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014',
          `  Session ID      : ${ls.sessionId ?? 'unknown'}`,
          `  Index source    : ${ls.indexSource ?? 'unknown'}`,
          `  Files indexed   : ${ls.indexedFiles ?? 0}`,
          `  Repo map        : ~${ls.repoMapTokens ?? 0} tokens`,
          `  Dep-context     : ${ls.depContextTriggers ?? 0} trigger(s)`,
          `  Dep-context tkns: ~${ls.depContextTotalTokens ?? 0} total`,
          `  Context files   : ${ls.contextFilesCount ?? 0} file(s)`,
          `  Provider guid.  : ${ls.providerGuidanceCount ?? 0} file(s)`,
          ls.totalTokensSaved
            ? `  Token savings   : ~${ls.totalTokensSaved}t (${Math.round(Number(ls.savingsRatio ?? 0) * 100)}% vs full reads)`
            : '',
          '\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014',
        ].join('\n'), 'info')
      } else {
        ctx.ui.notify(nInfo('no session data found'), 'info')
      }
    } catch {
      ctx.ui.notify(nInfo('no session data found'), 'info')
    }
  }

  // ── Status bar ───────────────────────────────────────────────────────

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
