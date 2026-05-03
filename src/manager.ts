/**
 * SessionManager — owns all session lifecycle logic for pi-slim.
 *
 * Extracted from extension.ts to satisfy SRP:
 * - extension.ts → lifecycle wiring only (< 100 lines)
 * - manager.ts   → all business logic
 */

import { relative } from 'node:path'
import type { RepoIndex } from './types.js'
import { type SlimConfig } from './types.js'
import { IndexEngine } from './indexer/engine.js'
import { RepoMapGenerator } from './injectors/repo-map.js'
import { ContextInjector } from './injectors/dep-context.js'
import { InjectionPipeline } from './injectors/pipeline.js'
import { SessionStats } from './metrics/tracker.js'
import { storeExists, saveStore, loadStore } from './indexer/index-store.js'
import { readState } from './persistence/runtime-state.js'
import { extractText, extractInjectedFilePaths } from './utils/message.js'
import { estimateTokens } from './utils/token.js'
import { loadContextFiles, formatContextSection, buildStartupNotification, type ContextFile } from './injectors/context-files.js'
import { loadProviderGuidance, formatProviderGuidanceSection, buildGuidanceNotification, type ProviderGuidanceFile } from './injectors/guidance.js'
import { detectPathsInToolCall, detectPathsInOutput } from './detect/file-detector.js'
import { info as nInfo, warn as nWarn, error as nError, success as nSuccess, updateStatusBar, clearStatusBar, type StatusBarState } from './ui/notifications.js'
import { loadConfig } from './config/loader.js'
import { estimateFileSavings, buildCostEstimate } from './metrics/cost-estimator.js'

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

// ── Injection handler registry (OCP-compliant) ───────────────────────────

interface InjectionHandler {
  onInject: (state: SessionState, entry: { tokens: number }, ctx: ExtensionContext) => void
  onTrimmed: (state: SessionState, entry: { tokens: number; name: string }, ctx: ExtensionContext) => void
}

/**
 * OCP-compliant injection handler registry.
 * To add a new injection source, register its handler here and create
 * the pipeline source in `handleBeforeAgentStart()`. No switch statements.
 */
const INJECTION_HANDLERS: Record<string, InjectionHandler> = {
  'repo-map': {
    onInject: (s, e) => {
      s.repoMapInjected = true
      s.stats.recordRepoMapInjection(e.tokens)
    },
    onTrimmed: () => {},
  },
  'provider-guidance': {
    onInject: (s, e, ctx) => {
      if (s.providerGuidanceFiles.length > 0) {
        s.providerGuidanceInjected = true
        s.stats.recordProviderGuidanceInjection(e.tokens, s.providerGuidanceFiles.length)
        ctx.ui.notify(
          nInfo(buildGuidanceNotification(s.providerGuidanceFiles, s.projectRoot)),
          'info',
        )
      }
    },
    onTrimmed: (s, e, ctx) => {
      ctx.ui.notify(nWarn(`${e.name} trimmed (${e.tokens} tokens > budget)`), 'warn')
    },
  },
  'context-files': {
    onInject: (s, e) => {
      s.contextFilesInjected = true
      s.stats.recordContextFilesInjection(e.tokens, s.contextFiles.length)
    },
    onTrimmed: (s, e, ctx) => {
      ctx.ui.notify(nWarn(`${e.name} trimmed (${e.tokens} tokens > budget)`), 'warn')
    },
  },
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

export class SessionManager {
  state: SessionState | null = null

  // ── Session start ─────────────────────────────────────────────────────

  async start(projectRoot: string, getFlag: (name: string) => unknown, ctx: ExtensionContext): Promise<void> {
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

    // Try loading from cache
    if (await storeExists(projectRoot)) {
      ctx.ui.notify(nInfo('loading index from .pi/slim/…'), 'info')
      try {
        const { index, repoMap, builtAt, fileCount } = await loadStore(projectRoot)
        stats.indexSource = 'cache'
        stats.indexedFiles = fileCount
        stats.depEdges = [...index.deps.values()].reduce((s, v) => s + v.size, 0)
        ctx.ui.notify(nSuccess(`${fileCount} files loaded (built ${new Date(builtAt).toLocaleDateString()})`), 'info')
        this.state = this.initState({ index, repoMap, injector, config, stats, projectRoot })
        this.updateStatusBar(ctx)
        return
      } catch (err) {
        ctx.ui.notify(nWarn(`store corrupted, rebuilding… (${String(err)})`), 'warn')
      }
    }

    // Fresh build
    ctx.ui.notify(nInfo('first run — indexing project (this takes a few seconds)…'), 'info')
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
      ctx.ui.notify(nSuccess(`indexed ${index.skeletons.size} files, ${edgeCount} edges → .pi/slim/`), 'info')

      const contextFiles = config.contextFiles.enabled
        ? loadContextFiles(projectRoot, { filenames: config.contextFiles.filenames })
        : []
      if (contextFiles.length > 0) {
        ctx.ui.notify(nInfo(buildStartupNotification(contextFiles, projectRoot, config.contextFiles)), 'info')
      }

      this.state = this.initState({ index, repoMap, injector, config, stats, projectRoot, contextFiles })
      this.updateStatusBar(ctx)
    } catch (err) {
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

    // Dispatch to OCP-compliant handler registry (state guaranteed non-null here)
    for (const entry of result.sources) {
      const handler = INJECTION_HANDLERS[entry.name]
      if (!handler) continue
      if (entry.injected) {
        handler.onInject(s, entry, ctx)
      } else if (entry.trimmed) {
        handler.onTrimmed(s, entry, ctx)
      }
    }

    this.updateStatusBar(ctx)
    return { systemPrompt: event.systemPrompt + '\n\n' + result.content }
  }

  // ── Context (per-turn) ───────────────────────────────────────────────

  handleContext(event: ContextEvent, ctx: ExtensionContext): { messages: AgentMessage[] } | undefined {
    const s = this.state
    if (!s) return undefined

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

    // Estimate cost savings: sum full-file estimates for injected files
    let fullTokens = 0
    for (const f of files) {
      const skel = s.index.skeletons.get(f)
      if (skel) {
        const est = estimateFileSavings(f, skel)
        fullTokens += est.fullTokens
      }
    }
    s.stats.recordDepContextInjection(files, tokens, fullTokens)

    this.updateStatusBar(ctx)

    const fileNames = files.map(f => relative(s.projectRoot, f)).join(', ')
    const pct = s.stats.savingsRatio > 0 ? ` (${Math.round(s.stats.savingsRatio * 100)}% saved)` : ''
    ctx.ui.notify(nInfo(`injecting ${files.length} file(s) (~${tokens} tokens${pct}): ${fileNames}`), 'info')

    const contextMsg: AgentMessage = { role: 'developer', content: depContext }
    return { messages: [contextMsg, ...event.messages] }
  }

  // ── Session shutdown ─────────────────────────────────────────────────

  async shutdown(ctx: ExtensionContext): Promise<void> {
    const s = this.state
    if (!s) return
    ctx.ui.notify(nInfo(`session summary — ${s.stats.summary()}`), 'info')
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
    // Show last session from state.json
    try {
      const state = await readState(ctx.cwd)
      if (state?.lastSession) {
        const ls = state.lastSession as Record<string, unknown>
        ctx.ui.notify([
          '── slim last session stats ─────────────────────────',
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
          '─────────────────────────────────────────────────────',
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
