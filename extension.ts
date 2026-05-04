/**
 * pi-slim — pi agent extension
 *
 * Thin lifecycle wiring. All business logic lives in SessionManager.
 * Registers hashline_edit tool and /hashline-read command for hashline workflow.
 */

import type { ExtensionAPI, ExtensionContext as PiExtensionContext, ContextEvent, BeforeAgentStartEvent } from '@mariozechner/pi-coding-agent'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import telemetry from 'pi-telemetry'
import { getTelemetry } from 'pi-telemetry'
import { produceDefaults } from './context/schema.js'
import { registerHashlineTool } from './tools/hashline-editor.js'
import { registerLspTools, shutdownLsp } from './tools/lsp-navigation.js'
import { type ExtensionContext, SessionManager } from './manager.js'

export type { ExtensionContext }

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
  pi.setLabel('slim', 'Slim')
  for (const { name, description } of FLAGS) {
    const parts = name.split('.')
    const val = parts.reduce((o: unknown, k) => (o as Record<string, unknown> | undefined)?.[k], defs)
    pi.registerFlag(name, { type: typeof val === 'boolean' ? 'boolean' : 'string', default: typeof val === 'boolean' || typeof val === 'string' ? val : undefined, description })
  }
}

type AnyFn = (...args: any[]) => any

export default function smartContextExtension(pi: ExtensionAPI): void {
  registerFlags(pi)
  telemetry(pi)

  // Register tools
  registerHashlineTool(pi)
  registerLspTools(pi)

  const manager = new SessionManager()

  pi.registerCommand('slim', {
    description: 'Show slim stats for the current or last session',
    handler: async (_args: string, _ctx: PiExtensionContext) => {
      await manager.showStats(_ctx as unknown as ExtensionContext)
    },
  })

  pi.registerCommand('hashline-read', {
    description: 'Read a file with hashline anchors (e.g. "42nd|content")',
    handler: async (args: string, _ctx: PiExtensionContext) => {
      const path = args.trim()
      if (!path) { _ctx.ui.notify('Usage: /hashline-read <filepath>', 'warning'); return }
      const absPath = resolve(process.cwd(), path)
      try {
        const content = await readFile(absPath, 'utf-8')
        const { initHash, formatHashLines } = await import('./hashline/line-hash.js')
        await initHash()
        const hashed = formatHashLines(content)
        _ctx.ui.notify(hashed, 'info')
      } catch (err) {
        _ctx.ui.notify(`Error reading ${path}: ${err}`, 'error')
      }
    },
  })

  pi.on('session_start', ((_event: unknown, ctx: PiExtensionContext) => {
    getTelemetry()?.heartbeat('pi-slim')
    void manager.start(
      ctx.cwd,
      (name: string) => pi.getFlag(name) as unknown,
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('before_agent_start', ((event: BeforeAgentStartEvent, ctx: PiExtensionContext) => {
    return manager.handleBeforeAgentStart(
      event as Parameters<SessionManager['handleBeforeAgentStart']>[0],
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('context', ((event: ContextEvent, ctx: PiExtensionContext) => {
    return manager.handleContext(
      event as unknown as Parameters<SessionManager['handleContext']>[0],
      ctx as unknown as ExtensionContext,
    )
  }) as AnyFn)

  pi.on('session_shutdown', (async (_event: unknown, ctx: PiExtensionContext) => {
    await shutdownLsp()
    void manager.shutdown(ctx as unknown as ExtensionContext)
  }) as AnyFn)
}
