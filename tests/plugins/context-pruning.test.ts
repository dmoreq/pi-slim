import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionContext } from '../../extension.js'
import { ContextPruningPlugin } from '../../plugins/context-pruning.js'

// ── Helpers ────────────────────────────────────────────────────────────────

const mockCtx = {} as ExtensionContext

describe('ContextPruningPlugin', () => {
  let plugin: ContextPruningPlugin

  beforeEach(() => {
    vi.clearAllMocks()
    plugin = new ContextPruningPlugin()
  })

  describe('basics', () => {
    it('has the correct plugin name', () => {
      expect(plugin.name).toBe('context-pruning')
    })

    it('has a version', () => {
      expect(plugin.version).toBe('0.2.0')
    })
  })

  describe('onSessionStart / onSessionShutdown', () => {
    it('resets stats on session start', async () => {
      // Simulate previous session with stats
      const msgs = [
        { role: 'user', content: 'hello' },
        { role: 'user', content: 'hello' }, // dedup target
      ]
      await plugin.onContext(msgs as any)
      expect(plugin.getStats().totalPruned).toBe(1)

      // New session resets
      await plugin.onSessionStart(mockCtx)
      expect(plugin.getStats().totalPruned).toBe(0)
      expect(plugin.getStats().totalProcessed).toBe(0)
    })

    it('onSessionShutdown does not throw', async () => {
      await expect(plugin.onSessionShutdown()).resolves.toBeUndefined()
    })
  })

  describe('onContext - pruning', () => {
    it('prunes duplicate messages', async () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: 'hello' }, // duplicate
      ]

      await plugin.onContext(messages as any)

      expect(messages).toHaveLength(2)
      expect(messages[0].content).toBe('hello')
      expect(messages[1].content).toBe('hi there')
    })

    it('does nothing with single message', async () => {
      const messages = [{ role: 'user', content: 'hello' }]
      await plugin.onContext(messages as any)
      expect(messages).toHaveLength(1)
    })

    it('does nothing with empty array', async () => {
      const messages: any[] = []
      await plugin.onContext(messages)
      expect(messages).toHaveLength(0)
    })

    it('prunes errors followed by success', async () => {
      const messages = [
        { role: 'user', content: 'create file' },
        { role: 'toolResult', content: '{"isError": true}' },
        { role: 'toolResult', content: '{"status": "ok"}' },
      ]

      await plugin.onContext(messages as any)

      expect(messages).toHaveLength(2)
      expect(messages[0].content).toBe('create file')
      expect(messages[1].content).toBe('{"status": "ok"}')
    })

    it('applies superseded-writes rule', async () => {
      const messages = [
        { role: 'toolResult', content: '{"path": "src/x.ts", "data": "old"}' },
        { role: 'user', content: 'update it' },
        { role: 'toolResult', content: '{"path": "src/x.ts", "data": "new"}' },
      ]

      await plugin.onContext(messages as any)

      expect(messages).toHaveLength(2)
      expect(messages[1].content).toBe('{"path": "src/x.ts", "data": "new"}')
    })
  })

  describe('configuration', () => {
    it('exposes config via getConfig', () => {
      const config = plugin.getConfig()
      expect(config.rules).toContain('deduplication')
      expect(config.recencyWindow).toBe(10)
    })

    it('allows runtime config updates', () => {
      plugin.updateConfig({ recencyWindow: 5 })
      expect(plugin.getConfig().recencyWindow).toBe(5)
    })

    it('can disable all rules', async () => {
      plugin.updateConfig({ rules: [] })
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'user', content: 'hello' }, // would be deduped
      ]

      await plugin.onContext(messages as any)

      expect(messages).toHaveLength(2) // not pruned
    })
  })

  describe('getStats', () => {
    it('returns zero stats initially', () => {
      const stats = plugin.getStats()
      expect(stats.totalPruned).toBe(0)
      expect(stats.totalProcessed).toBe(0)
      expect(stats.percentPruned).toBe(0)
    })

    it('tracks pruning statistics', async () => {
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'user', content: 'a' }, // dedup
        { role: 'user', content: 'b' },
        { role: 'user', content: 'b' }, // dedup
      ]

      await plugin.onContext(messages as any)

      const stats = plugin.getStats()
      expect(stats.totalProcessed).toBe(4)
      expect(stats.totalPruned).toBe(2)
      expect(stats.percentPruned).toBe(50)
    })
  })

  describe('edge cases', () => {
    it('handles messages with complex nested content', async () => {
      const messages = [
        { role: 'user', content: { text: 'hello', meta: { id: 1 } } },
        { role: 'assistant', content: [{ type: 'text', value: 'response' }] },
      ]

      await expect(plugin.onContext(messages as any)).resolves.toBeUndefined()

      expect(messages).toHaveLength(2)
    })

    it('handles messages with missing content field', async () => {
      const messages = [
        { role: 'user' }, // no content
        { role: 'user', content: 'hello' },
      ]

      await plugin.onContext(messages as any)

      expect(messages).toHaveLength(2)
    })
  })
})
