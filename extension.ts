/**
 * pi-scope — pi agent extension
 *
 * Zero-config, fully automatic. No user commands needed.
 *   - Auto-indexes on first codebase-relevant query
 *   - Native graph analysis runs automatically on the computed code index
 *   - 4 LLM tools + `/scope` dashboard command
 *
 * Trigger: before_agent_start checks if query is codebase-related (contains
 * file paths, symbol names, or code keywords). Skips if not.
 */

import type {
  BeforeAgentStartEvent,
  ContextEvent,
  ExtensionAPI,
  ExtensionContext as PiExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from '@mariozechner/pi-coding-agent'
import { produceDefaults } from './context/schema.js'
import { type ExtensionContext, SessionManager } from './manager.js'
import { formatHashlineReadFromArgs } from './commands/hashline-read.js'
import { formatScopeCommand } from './commands/scope-dashboard.js'
import { registerHashlineTool } from './tools/hashline-editor.js'
import { registerHashlineReadTool } from './tools/hashline-read-tool.js'
import { registerGraphImpactTool } from './tools/graph-impact-tool.js'
import { registerLspTools, setLspSessionEnabled, shutdownLsp } from './tools/lsp-navigation.js'

export type { ExtensionContext }

// ── Flags ──────────────────────────────────────────────────────────────

const FLAGS: Array<{ name: string; description: string }> = [
  { name: 'scope.enabled', description: 'Inject repo map and dependency skeletons into every LLM call' },
  { name: 'scope.maxRepoMapTokens', description: 'Token budget for the global repo map (injected into system prompt)' },
  { name: 'scope.maxInjectionTokens', description: 'Token budget for per-turn dependency skeleton injection' },
  { name: 'scope.scanLastNMessages', description: 'How many recent messages to scan for file path mentions' },
  { name: 'scope.contextFiles.enabled', description: 'Inject project-local context files into system prompt' },
  { name: 'scope.contextFiles.filenames', description: 'Comma-separated context file names to search for' },
  { name: 'scope.providerGuidance.enabled', description: 'Inject provider-specific guidance files' },
  { name: 'scope.config', description: 'Path to JSONC config file' },
]

function registerFlags(pi: ExtensionAPI): void {
  const defs: Record<string, unknown> = produceDefaults() as Record<string, unknown>
  for (const { name, description } of FLAGS) {
    const parts = name.split('.')
    const val = parts.reduce((o: unknown, k) => (o as Record<string, unknown> | undefined)?.[k], defs)
    pi.registerFlag(name, {
      type: typeof val === 'boolean' ? 'boolean' : 'string',
      default: typeof val === 'boolean' || typeof val === 'string' ? val : undefined,
      description,
    })
  }
}

// ── Codebase-relevance detection ───────────────────────────────────────

/**
 * Patterns that indicate a query is codebase-related and pi-scope should activate.
 */
const _CODEBASE_PATTERNS = [
  // File paths
  /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|md)/,
  /['"`]\.\.?\/[^'"`]+/,
  // Symbol names (camelCase, PascalCase, snake_case)
  /\b[A-Z][a-z]+[A-Z]\w+\b/, // PascalCase
  /\b[a-z]+[A-Z]\w+[a-z]\b/, // camelCase
  /\b[a-z]+_[a-z]+\w*\b/, // snake_case
  // Code keywords
  /\b(?:function|class|import|export|const|let|var|def|fn|struct|impl|trait|interface|type|enum|module|package)\b/,
  // File extensions
  /\b\w+\.(?:ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml)\b/,
  // Git/directory patterns
  /\b(?:src|lib|app|tests?|docs?|config|scripts?|components?|pages?|routes?|services?|utils?|helpers?|hooks?|stores?|models?|views?|controllers?|middleware)\b/,
  // Commands that imply codebase work
  /\b(?:refactor|rewrite|edit|update|fix|debug|test|build|deploy|implement|add|remove|change|migrate|optimize)\b/,
]

function isCodebaseRelevant(prompt: string): boolean {
  if (!prompt) return false
  return _CODEBASE_PATTERNS.some(pattern => pattern.test(prompt))
}

// ── Extension entry ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

export default function smartContextExtension(pi: ExtensionAPI): void {
  registerFlags(pi)

  registerHashlineTool(pi)
  registerHashlineReadTool(pi)
  registerLspTools(pi)
  registerGraphImpactTool(pi)

  const manager = new SessionManager()

  pi.registerCommand('scope', {
    description: 'Show pi-scope dashboard; "scope graph" for architecture; "scope history" for trends',
    handler: async (args?: string) => {
      return formatScopeCommand(manager, args)
    },
  })

  pi.registerCommand('hashline-read', {
    description: 'Read a file with hashline LINE+BIGRAM anchors for hashline_edit',
    handler: async (args?: string) => {
      const s = manager.state
      if (!s) return 'pi-scope session is not active. Open a codebase project first.'
      return formatHashlineReadFromArgs(s.projectRoot, args ?? '', s.config.hashline.recordOnRead, {
        streamAnnotateThresholdLines: s.config.hashline.streamAnnotateThresholdLines,
        streamChunkLines: s.config.hashline.streamChunkLines,
      })
    },
  })

  pi.on('session_start', ((_event: unknown, ctx: PiExtensionContext) => {
    void manager.start(ctx.cwd, (name: string) => pi.getFlag(name) as unknown, ctx as unknown as ExtensionContext)
  }) as AnyFn)

  pi.on('before_agent_start', (async (event: BeforeAgentStartEvent, ctx: PiExtensionContext) => {
    if (!isCodebaseRelevant(event.prompt)) return undefined
    return manager.handleBeforeAgentStart(
      event as Parameters<SessionManager['handleBeforeAgentStart']>[0],
      ctx as unknown as ExtensionContext
    )
  }) as AnyFn)

  pi.on('context', ((event: ContextEvent, ctx: PiExtensionContext) => {
    if (!manager.state) return undefined
    return manager.handleContext(
      event as unknown as Parameters<SessionManager['handleContext']>[0],
      ctx as unknown as ExtensionContext
    )
  }) as AnyFn)

  pi.on('tool_call', (async (event: ToolCallEvent, ctx: PiExtensionContext): Promise<ToolCallEventResult | undefined> => {
    if (!manager.state) return undefined
    return manager.handleToolCall(
      { toolName: event.toolName, input: event.input },
      ctx as unknown as ExtensionContext
    )
  }) as AnyFn)

  pi.on('session_shutdown', (async (_event: unknown, ctx: PiExtensionContext) => {
    try {
      await shutdownLsp()
      setLspSessionEnabled(true)
    } catch (error) {
      console.error('pi-scope: LSP shutdown failed:', error)
    }
    try {
      await manager.shutdown(ctx as unknown as ExtensionContext)
    } catch (error) {
      console.error('pi-scope: SessionManager shutdown failed:', error)
    }
  }) as AnyFn)
}
