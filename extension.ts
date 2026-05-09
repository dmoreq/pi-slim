/**
 * pi-scope — pi agent extension
 *
 * Zero-config, fully automatic. No user commands needed.
 *   - Auto-indexes on first codebase-relevant query
 *   - Graph analysis runs automatically when graphify data is present
 *   - All lifecycle events reported via pi-telemetry
 *   - 4 LLM tools: hashline_edit, lsp_go_to_definition, lsp_find_references, lsp_hover
 *
 * Trigger: before_agent_start checks if query is codebase-related (contains
 * file paths, symbol names, or code keywords). Skips if not.
 */

import type {
  ExtensionAPI,
  ExtensionContext as PiExtensionContext,
  ContextEvent,
  BeforeAgentStartEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from '@mariozechner/pi-coding-agent'
import telemetry from 'pi-telemetry'
import { produceDefaults } from './context/schema.js'
import { registerHashlineTool } from './tools/hashline-editor.js'
import { registerLspTools, shutdownLsp } from './tools/lsp-navigation.js'
import { type ExtensionContext, SessionManager } from './manager.js'

export type { ExtensionContext }

// ── Flags ──────────────────────────────────────────────────────────────

const FLAGS: Array<{ name: string; description: string }> = [
  { name: 'slim.enabled',              description: 'Inject repo map and dependency skeletons into every LLM call' },
  { name: 'slim.maxRepoMapTokens',     description: 'Token budget for the global repo map (injected into system prompt)' },
  { name: 'slim.maxInjectionTokens',   description: 'Token budget for per-turn dependency skeleton injection' },
  { name: 'slim.scanLastNMessages',    description: 'How many recent messages to scan for file path mentions' },
  { name: 'slim.contextFiles.enabled', description: 'Inject project-local context files into system prompt' },
  { name: 'slim.contextFiles.filenames', description: 'Comma-separated context file names to search for' },
  { name: 'slim.providerGuidance.enabled', description: 'Inject provider-specific guidance files' },
  { name: 'slim.config',               description: 'Path to JSONC config file' },
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
const CODEBASE_PATTERNS = [
  // File paths
  /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|md)/,
  /['"`]\.\.?\/[^'"`]+/,
  // Symbol names (camelCase, PascalCase, snake_case)
  /\b[A-Z][a-z]+[A-Z]\w+\b/,        // PascalCase
  /\b[a-z]+[A-Z]\w+[a-z]\b/,         // camelCase
  /\b[a-z]+_[a-z]+\w*\b/,            // snake_case
  // Code keywords
  /\b(?:function|class|import|export|const|let|var|def|fn|struct|impl|trait|interface|type|enum|module|package)\b/,
  // File extensions
  /\b\w+\.(?:ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml)\b/,
  // Git/directory patterns
  /\b(?:src|lib|app|tests?|docs?|config|scripts?|components?|pages?|routes?|services?|utils?|helpers?|hooks?|stores?|models?|views?|controllers?|middleware)\b/,
  // Commands that imply codebase work
  /\b(?:refactor|rewrite|edit|update|fix|debug|test|build|deploy|implement|add|remove|change|migrate|optimize)\b/,
]

function isCodebaseRelevant(_prompt: string): boolean {
  // Auto-activate for all queries — the extension is lightweight when inactive
  return true
}

// ── Extension entry ────────────────────────────────────────────────────

type AnyFn = (...args: any[]) => any

export default function smartContextExtension(pi: ExtensionAPI): void {
  registerFlags(pi)
  try {
    telemetry(pi)
  } catch {
    // pi-telemetry may not be available at extension load time
  }

  // Register LLM tools only (no user commands)
  registerHashlineTool(pi)
  registerLspTools(pi)

  const manager = new SessionManager()

  pi.on('session_start', ((_event: unknown, ctx: PiExtensionContext) => {
    void manager.start(
      ctx.cwd,
      (name: string) => pi.getFlag(name) as unknown,
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('before_agent_start', ((event: BeforeAgentStartEvent, ctx: PiExtensionContext) => {
    if (!isCodebaseRelevant(event.prompt)) return undefined
    return manager.handleBeforeAgentStart(
      event as Parameters<SessionManager['handleBeforeAgentStart']>[0],
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('context', ((event: ContextEvent, ctx: PiExtensionContext) => {
    if (!manager.state) return undefined
    return manager.handleContext(
      event as unknown as Parameters<SessionManager['handleContext']>[0],
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('tool_call', ((event: ToolCallEvent, ctx: PiExtensionContext): ToolCallEventResult | undefined => {
    if (!manager.state) return undefined
    return manager.handleToolCall(
      { toolName: event.toolName, input: event.input },
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('session_shutdown', (async (_event: unknown, ctx: PiExtensionContext) => {
    await shutdownLsp()
    void manager.shutdown(ctx as unknown as ExtensionContext)
  }) as AnyFn)
}
