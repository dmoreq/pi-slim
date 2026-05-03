/**
 * pi-slim — pi agent extension
 *
 * Thin lifecycle wiring. All business logic lives in SessionManager.
 * Adding a new injection source? Add a handler to INJECTION_HANDLERS
 * in manager.ts — no changes needed here.
 */

import { produceDefaults } from './config/schema.js'
import { SessionManager } from './manager.js'

// ── Minimal pi ExtensionAPI types ─────────────────────────────────────────

interface ExtensionAPI {
  setLabel(label: string): void
  registerFlag(name: string, opts: { type: string; default: unknown; description: string }): void
  getFlag(name: string): unknown
  registerCommand(name: string, opts: { description?: string; handler: (...args: unknown[]) => void }): void
  on(event: string, handler: (...args: unknown[]) => unknown): void
}

// ── Flag definitions (static) ─────────────────────────────────────────────

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
  const defs = produceDefaults()
  pi.setLabel('Slim')
  for (const { name, description } of FLAGS) {
    const val = name.split('.').reduce((o: Record<string, unknown> | undefined, k) => o?.[k] as Record<string, unknown> | undefined, defs as unknown as Record<string, unknown>)
    pi.registerFlag(name, { type: typeof val === 'boolean' ? 'boolean' : 'string', default: val ?? '', description })
  }
}

// ── Extension factory ─────────────────────────────────────────────────────

export default function smartContextExtension(pi: ExtensionAPI): void {
  registerFlags(pi)

  const manager = new SessionManager()

  pi.registerCommand('slim', {
    description: 'Show slim stats for the current or last session',
    handler: async (_args: unknown, ctx: unknown) => {
      await manager.showStats(ctx as Parameters<SessionManager['showStats']>[0])
    },
  })

  pi.on('session_start', async (_event: unknown, ctx: unknown) => {
    const c = ctx as Parameters<SessionManager['start']>[2]
    await manager.start((c as { cwd: string }).cwd, (name) => pi.getFlag(name), c)
  })

  pi.on('before_agent_start', (event: unknown, ctx: unknown) => {
    return manager.handleBeforeAgentStart(
      event as Parameters<SessionManager['handleBeforeAgentStart']>[0],
      ctx as Parameters<SessionManager['handleBeforeAgentStart']>[1],
    )
  })

  pi.on('context', (event: unknown, ctx: unknown) => {
    return manager.handleContext(
      event as Parameters<SessionManager['handleContext']>[0],
      ctx as Parameters<SessionManager['handleContext']>[1],
    )
  })

  pi.on('session_shutdown', async (_event: unknown, ctx: unknown) => {
    await manager.shutdown(ctx as Parameters<SessionManager['shutdown']>[0])
  })
}
