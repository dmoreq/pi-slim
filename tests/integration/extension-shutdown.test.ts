import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionManager } from '../../manager.js'

vi.mock('../../tools/hashline-editor.js', () => ({ registerHashlineTool: vi.fn() }))
vi.mock('../../tools/hashline-read-tool.js', () => ({ registerHashlineReadTool: vi.fn() }))
vi.mock('../../tools/lsp-navigation.js', () => ({
  registerLspTools: vi.fn(),
  shutdownLsp: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('pi-telemetry', () => ({ default: vi.fn() }))

describe('extension.ts lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs when SessionManager.shutdown rejects', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const pi = {
      registerFlag: vi.fn(),
      registerCommand: vi.fn(),
      getFlag: vi.fn().mockReturnValue(true),
      on: vi.fn((event: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(event, fn)
      }),
    } as unknown as ExtensionAPI

    vi.spyOn(SessionManager.prototype, 'shutdown').mockRejectedValueOnce(new Error('shutdown boom'))

    const { default: smartContextExtension } = await import('../../extension.js')
    smartContextExtension(pi)

    const fn = handlers.get('session_shutdown') as (_e: unknown, _ctx: unknown) => Promise<void>
    await expect(fn).toBeDefined()
    await fn?.(null, {
      cwd: '/tmp',
      ui: { notify: vi.fn(), setStatus: vi.fn() },
      hasUI: false,
      getSystemPrompt: () => '',
      sessionManager: { getSessionId: () => 'lifecycle-test' },
    })

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SessionManager shutdown failed'),
      expect.any(Error)
    )
  })
})
