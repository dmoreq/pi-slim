/**
 * @pi/smart-context — pi agent extension
 *
 * Lifecycle
 * ─────────
 * session_start      Check .pi/smart-context/ for an existing index.
 *                    • Found  → load from disk (fast, no re-parsing).
 *                    • Missing → build with IndexEngine, save to disk.
 *
 * before_agent_start Inject <repo-map> into the system prompt once per
 *                    session so the LLM has a bird's-eye view of the repo.
 *
 * context            Inspect the conversation messages about to be sent,
 *                    detect mentioned file paths, inject their skeletons
 *                    and 1st-degree dependency skeletons as <dep-context>.
 *                    Records every injection in SessionStats.
 *
 * session_shutdown   Print a one-line summary via ctx.ui.notify and
 *                    append a record to .pi/smart-context/stats.jsonl.
 *
 * /smart-context     Slash command — show full stats report for the
 *                    current session at any point.
 *
 * Install
 * ───────
 *   # ~/.omp/agent/config.yml
 *   extensions:
 *     - /path/to/@pi/smart-context/dist/index.js
 */

import { relative } from 'node:path'
import type { RepoIndex } from './types.js'
import { type SmartContextConfig } from './types.js'
import { produceDefaults } from './config/schema.js'
import { loadConfig } from './config.js'
import { loadContextFiles, formatContextSection, buildStartupNotification, type ContextFile } from './context-files.js'
import { loadProviderGuidance, formatProviderGuidanceSection, buildGuidanceNotification, type ProviderGuidanceFile } from './provider-guidance.js'
import { detectPathsInToolCall, detectPathsInOutput } from './file-detector.js'
import { info as nInfo, warn as nWarn, error as nError, success as nSuccess, updateStatusBar, clearStatusBar, type StatusBarState } from './notify.js'

// ── Core modules ──────────────────────────────────────────────────────────
import { IndexEngine } from './index-engine.js'
import { RepoMapGenerator } from './repo-map-generator.js'
import { ContextInjector } from './context-injector.js'
import { InjectionPipeline } from './pipeline.js'
import { SessionStats } from './stats.js'
import { storeExists, saveStore, loadStore } from './store.js'
import { readState } from './state.js'
import { extractText, extractInjectedFilePaths } from './utils/message.js'
import { estimateTokens } from './utils/token.js'

// ── Minimal pi ExtensionAPI types (only what we use) ──────────────────────

interface ExtensionUI {
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
}

interface ExtensionContext {
  cwd: string
  ui: ExtensionUI & { setStatus: (key: string, text?: string) => void }
  hasUI: boolean
  getSystemPrompt(): string
  sessionManager: {
    getSessionId(): string
  }
  model?: {
    provider?: string
    id?: string
  }
}

interface ExtensionCommandContext extends ExtensionContext {
  waitForIdle(): Promise<void>
}

interface SessionStartEvent    { type: 'session_start' }
interface SessionShutdownEvent { type: 'session_shutdown' }

interface BeforeAgentStartEvent {
  type: 'before_agent_start'
  systemPrompt: string
  prompt: string
}
interface BeforeAgentStartResult { systemPrompt?: string }

interface AgentMessage {
  role?: string
  content?: unknown
  [key: string]: unknown
}
interface ContextEvent  { type: 'context'; messages: AgentMessage[] }
interface ContextResult { messages?: AgentMessage[] }

type Handler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void
type CmdHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>

interface ExtensionAPI {
  setLabel(label: string): void
  registerFlag(name: string, opts: { type: string; default: unknown; description: string }): void
  getFlag(name: string): unknown
  registerCommand(name: string, opts: { description?: string; handler: CmdHandler }): void
  on(event: 'session_start',      handler: Handler<SessionStartEvent>): void
  on(event: 'session_shutdown',   handler: Handler<SessionShutdownEvent>): void
  on(event: 'before_agent_start', handler: Handler<BeforeAgentStartEvent, BeforeAgentStartResult>): void
  on(event: 'context',            handler: Handler<ContextEvent, ContextResult>): void
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Build StatusBarState from current session. */
function statusBarState(s: SessionState): StatusBarState {
  return {
    indexedFiles: s.stats.indexedFiles,
    repoMapTokens: s.stats.repoMapTokens,
    depContextTriggers: s.stats.depContextTriggers,
    contextFilesCount: s.stats.contextFilesCount,
    providerGuidanceCount: s.stats.providerGuidanceCount,
  }
}

// ── Session-scoped state ──────────────────────────────────────────────────

interface SessionState {
  index: RepoIndex
  repoMap: string
  injector: ContextInjector
  config: SmartContextConfig
  stats: SessionStats
  projectRoot: string
  repoMapInjected: boolean
  /** Loaded extra context files (AGENTS.local.md, etc.) injected once. */
  contextFiles: ContextFile[]
  contextFilesInjected: boolean
  /** Provider-specific guidance files loaded on first turn. */
  providerGuidanceFiles: ProviderGuidanceFile[]
  providerGuidanceInjected: boolean
}

// ── Extension factory ─────────────────────────────────────────────────────

export default function smartContextExtension(pi: ExtensionAPI): void {
  pi.setLabel('Smart Context')

  pi.registerFlag('smart-context.enabled', {
    type: 'boolean',
    default: produceDefaults().enabled,
    description: 'Inject repo map and dependency skeletons into every LLM call',
  })
  pi.registerFlag('smart-context.maxRepoMapTokens', {
    type: 'number',
    default: produceDefaults().maxRepoMapTokens,
    description: 'Token budget for the global repo map (injected into system prompt)',
  })
  pi.registerFlag('smart-context.maxInjectionTokens', {
    type: 'number',
    default: produceDefaults().maxInjectionTokens,
    description: 'Token budget for per-turn dependency skeleton injection',
  })
  pi.registerFlag('smart-context.scanLastNMessages', {
    type: 'number',
    default: produceDefaults().scanLastNMessages,
    description: 'How many recent messages to scan for file path mentions',
  })

  pi.registerFlag('smart-context.contextFiles.enabled', {
    type: 'boolean',
    default: produceDefaults().contextFiles.enabled,
    description: 'Inject project-local context files (AGENTS.local.md, CLAUDE.md) into system prompt',
  })
  pi.registerFlag('smart-context.contextFiles.filenames', {
    type: 'string',
    default: produceDefaults().contextFiles.filenames.join(','),
    description: 'Comma-separated context file names to search for in ancestor directories',
  })

  pi.registerFlag('smart-context.providerGuidance.enabled', {
    type: 'boolean',
    default: produceDefaults().providerGuidance.enabled,
    description: 'Inject provider-specific guidance files (CLAUDE.md, CODEX.md, GEMINI.md) into system prompt',
  })

  pi.registerFlag('smart-context.config', {
    type: 'string',
    default: '',
    description: 'Path to JSONC config file for smart-context (overrides global and project configs)',
  })

  let session: SessionState | null = null

  // ── /smart-context slash command ─────────────────────────────────────────
  pi.registerCommand('smart-context', {
    description: 'Show smart-context stats for the current or last session',
    handler: async (_args, ctx) => {
      if (session) {
        ctx.ui.notify(session.stats.report(), 'info')
        return
      }

      // No active session — show last session from state.json
      try {
        const state = await readState(ctx.cwd)
        if (state?.lastSession) {
          const { lastSession } = state as { lastSession: Record<string, unknown> }
          const parts = [
            '── smart-context last session stats ────────────────',
            `  Session ID      : ${lastSession.sessionId ?? 'unknown'}`,
            `  Index source    : ${lastSession.indexSource ?? 'unknown'}`,
            `  Files indexed   : ${lastSession.indexedFiles ?? 0}`,
            `  Repo map        : ~${lastSession.repoMapTokens ?? 0} tokens`,
            `  Dep-context     : ${lastSession.depContextTriggers ?? 0} trigger(s)`,
            `  Dep-context tkns: ~${lastSession.depContextTotalTokens ?? 0} total`,
            `  Context files   : ${lastSession.contextFilesCount ?? 0} file(s)`,
            `  Provider guid.  : ${lastSession.providerGuidanceCount ?? 0} file(s)`,
            '─────────────────────────────────────────────────────',
          ].join('\n')
          ctx.ui.notify(parts, 'info')
        } else {
          ctx.ui.notify(nInfo('no session data found'), 'info')
        }
      } catch {
        ctx.ui.notify(nInfo('no session data found'), 'info')
      }
    },
  })

  // ── session_start ────────────────────────────────────────────────────────
  pi.on('session_start', async (_event, ctx) => {
    const projectRoot = ctx.cwd
    const sessionId = ctx.sessionManager.getSessionId()

    // Load config from layers: defaults → global → project → flags
    const flags: Record<string, unknown> = {
      'smart-context.enabled': pi.getFlag('smart-context.enabled'),
      'smart-context.maxRepoMapTokens': pi.getFlag('smart-context.maxRepoMapTokens'),
      'smart-context.maxInjectionTokens': pi.getFlag('smart-context.maxInjectionTokens'),
      'smart-context.scanLastNMessages': pi.getFlag('smart-context.scanLastNMessages'),
      'smart-context.contextFiles.enabled': pi.getFlag('smart-context.contextFiles.enabled'),
      'smart-context.providerGuidance.enabled': pi.getFlag('smart-context.providerGuidance.enabled'),
    }
    const config: SmartContextConfig = loadConfig(projectRoot, flags)

    if (!config.enabled) return

    const stats = new SessionStats(sessionId)
    const injector = new ContextInjector(projectRoot, config.maxInjectionTokens, config.scanLastNMessages)

    // ── Load existing store ───────────────────────────────────────────────
    if (await storeExists(projectRoot)) {
      ctx.ui.notify(nInfo('loading index from .pi/smart-context/…'), 'info')
      try {
        const { index, repoMap, builtAt, fileCount } = await loadStore(projectRoot)

        stats.indexSource = 'cache'
        stats.indexedFiles = fileCount
        stats.depEdges = [...index.deps.values()].reduce((s, v) => s + v.size, 0)

        ctx.ui.notify(
          nSuccess(`${fileCount} files loaded (built ${new Date(builtAt).toLocaleDateString()})`),
          'info',
        )
        session = { index, repoMap, injector, config, stats, projectRoot, repoMapInjected: false, contextFiles: [], contextFilesInjected: false, providerGuidanceFiles: [], providerGuidanceInjected: false }
        if (ctx.hasUI) updateStatusBar(ctx.ui.setStatus, statusBarState(session))
        return
      } catch (err) {
        ctx.ui.notify(nWarn(`store corrupted, rebuilding… (${String(err)})`), 'warn')
      }
    }

    // ── Build fresh index ─────────────────────────────────────────────────
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

      ctx.ui.notify(
        nSuccess(`indexed ${index.skeletons.size} files, ${edgeCount} edges → .pi/smart-context/`),
        'info',
      )

      // Load context files (AGENTS.local.md, CLAUDE.md)
      const contextFiles = config.contextFiles.enabled
        ? loadContextFiles(projectRoot, { filenames: config.contextFiles.filenames })
        : []
      if (contextFiles.length > 0) {
        ctx.ui.notify(nInfo(buildStartupNotification(contextFiles, projectRoot, config.contextFiles)), 'info')
      }

      session = { index, repoMap, injector, config, stats, projectRoot, repoMapInjected: false, contextFiles, contextFilesInjected: false, providerGuidanceFiles: [], providerGuidanceInjected: false }
      if (ctx.hasUI) updateStatusBar(ctx.ui.setStatus, statusBarState(session))
    } catch (err) {
      ctx.ui.notify(nError(`indexing failed: ${String(err)}`), 'error')
      session = null
    }
  })

  // ── before_agent_start ───────────────────────────────────────────────────
  // Collects all once-per-session injection sources into a pipeline,
  // orders by priority, trims to a shared token budget, and appends the
  // combined block to the system prompt.
  pi.on('before_agent_start', (event, ctx) => {
    if (!session) return undefined

    // Skip if everything already injected
    if (session.repoMapInjected && session.contextFilesInjected && session.providerGuidanceInjected) {
      return undefined
    }

    // Capture for closures — TS strict null check can't infer through arrow funcs
    const s = session

    const pipeline = new InjectionPipeline()
    const combinedBudget = s.config.maxRepoMapTokens + s.config.maxInjectionTokens

    // ── Repo map (priority 1 — highest) ─────────────────────────────────
    if (!s.repoMapInjected && s.repoMap) {
      pipeline.register({
        name: 'repo-map',
        priority: 1,
        produce: () => s.repoMap!,
      })
    }

    // ── Provider guidance (priority 2) ───────────────────────────────────
    if (!s.providerGuidanceInjected && s.config.providerGuidance.enabled) {
      const provider = ctx.model?.provider as string | undefined
      const modelId = ctx.model?.id as string | undefined
      if (provider) {
        pipeline.register({
          name: 'provider-guidance',
          priority: 2,
          produce: () => {
            const files = loadProviderGuidance(
              s.projectRoot,
              provider,
              modelId,
            )
            if (files.length > 0) {
              s.providerGuidanceFiles = files
              return formatProviderGuidanceSection(files)
            }
            return null
          },
        })
      }
    }

    // ── Context files (priority 4 — lowest) ─────────────────────────────
    if (!s.contextFilesInjected && s.contextFiles.length > 0) {
      pipeline.register({
        name: 'context-files',
        priority: 4,
        produce: () => formatContextSection(s.contextFiles, {
          sectionTitle: s.config.contextFiles.sectionTitle,
        }),
      })
    }

    // ── Build and apply pipeline ───────────────────────────────────────
    const result = pipeline.build(combinedBudget)
    if (!result.content) return undefined

    // ── Record stats and mark injected ──────────────────────────────────
    for (const entry of result.sources) {
      if (!entry.injected) {
        if (entry.trimmed) {
          ctx.ui.notify(nWarn(`${entry.name} trimmed (${entry.tokens} tokens > budget)`), 'warn')
        }
        continue
      }

      switch (entry.name) {
        case 'repo-map':
          s.repoMapInjected = true
          s.stats.recordRepoMapInjection(entry.tokens)
          break
        case 'provider-guidance':
          if (s.providerGuidanceFiles.length > 0) {
            s.providerGuidanceInjected = true
            s.stats.recordProviderGuidanceInjection(entry.tokens, s.providerGuidanceFiles.length)
            ctx.ui.notify(
              nInfo(buildGuidanceNotification(s.providerGuidanceFiles, s.projectRoot)),
              'info',
            )
          }
          break
        case 'context-files':
          s.contextFilesInjected = true
          s.stats.recordContextFilesInjection(entry.tokens, s.contextFiles.length)
          break
      }
    }

    // Update status bar after injection
    if (ctx.hasUI) updateStatusBar(ctx.ui.setStatus, statusBarState(s))

    return { systemPrompt: event.systemPrompt + '\n\n' + result.content }
  })

  // ── context ──────────────────────────────────────────────────────────────
  // Fired before every LLM call. Detects file paths mentioned in recent
  // messages (including tool calls and output) and prepends a <dep-context>
  // block containing their skeletons plus 1st-degree import skeletons.
  pi.on('context', (event, ctx) => {
    if (!session) return undefined

    const messages = event.messages.map(m => ({
      role: m.role ?? 'user',
      content: extractText(m.content),
    }))

    // Also scan tool calls and output for file paths (beyond free-text regex)
    const extraPaths = new Set<string>()
    for (const msg of event.messages) {
      const toolName = (msg as Record<string, unknown>).toolName as string | undefined

      // Tool call arguments (read/write/edit path, bash commands)
      if (toolName) {
        const input = (msg as Record<string, unknown>).input as Record<string, unknown> | undefined
        const refs = detectPathsInToolCall(toolName, input, {
          projectRoot: session!.projectRoot,
          validateExistence: true,
        })
        for (const r of refs) extraPaths.add(r.path)
      }

      // Tool result output (error messages, compiler output with file refs)
      if ((msg as Record<string, unknown>).role === 'toolResult') {
        const refs = detectPathsInOutput(
          toolName ?? '',
          (msg as Record<string, unknown>).content,
          { projectRoot: session!.projectRoot },
        )
        for (const r of refs) extraPaths.add(r.path)
      }
    }

    const depContext = session.injector.buildInjection(
      session.index,
      messages,
      extraPaths.size > 0 ? extraPaths : undefined,
    )
    if (!depContext) return undefined

    // Record stats
    const tokens = estimateTokens(depContext)
    const files = extractInjectedFilePaths(depContext)
    session.stats.recordDepContextInjection(files, tokens)

    // Update status bar after per-turn injection
    if (ctx.hasUI) updateStatusBar(ctx.ui.setStatus, statusBarState(session))

    // Inline notification — shows which files are being injected and cost
    const fileNames = files.map(f => relative(session!.projectRoot, f)).join(', ')
    ctx.ui.notify(
      nInfo(`injecting ${files.length} file(s) (~${tokens} tokens): ${fileNames}`),
      'info',
    )

    // Prepend as developer-role message (system-level, not user speech)
    const contextMsg: AgentMessage = { role: 'developer', content: depContext }
    return { messages: [contextMsg, ...event.messages] }
  })

  // ── session_shutdown ─────────────────────────────────────────────────────
  // Print a one-line summary, persist stats, clear status bar.
  pi.on('session_shutdown', async (_event, ctx) => {
    if (!session) return

    const { stats, projectRoot } = session

    // One-line summary in the UI
    ctx.ui.notify(nInfo(`session summary — ${stats.summary()}`), 'info')

    // Clear status bar
    if (ctx.hasUI) clearStatusBar(ctx.ui.setStatus)

    // Persist to .pi/smart-context/stats.jsonl (fire-and-forget)
    stats.persist(projectRoot).catch(() => { /* non-critical */ })
  })
}
