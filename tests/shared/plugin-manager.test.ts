import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginManager, PluginError } from '../../plugins/plugin-manager.js';
import type { Plugin, PluginToolCallResult } from '../../plugins/plugin.js';
import type { ExtensionContext } from '../../extension.js';

// ── Mock Plugins ───────────────────────────────────────────────────────────

const createMockPlugin = (name: string): Plugin => ({
  name,
  onSessionStart: vi.fn().mockResolvedValue(undefined),
  onContext: vi.fn().mockResolvedValue(undefined),
  onTurnEnd: vi.fn().mockResolvedValue(undefined),
  onToolCall: vi.fn().mockResolvedValue(undefined),
  onSessionShutdown: vi.fn().mockResolvedValue(undefined),
});

const createRejectPlugin = (): Plugin => ({
  name: 'reject-plugin',
  onToolCall: vi.fn().mockResolvedValue({
    allowed: false,
    reason: 'Blocked by reject-plugin',
  } as PluginToolCallResult),
});

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('registration', () => {
    it('registers a plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      manager.register(plugin);
      expect(manager.get('test-plugin')).toBe(plugin);
      expect(manager.count).toBe(1);
    });

    it('prevents duplicate registration', () => {
      manager.register(createMockPlugin('dup'));
      expect(() => manager.register(createMockPlugin('dup'))).toThrow(PluginError);
    });

    it('prevents plugin with empty name', () => {
      expect(() => manager.register({ name: '' } as Plugin)).toThrow(PluginError);
    });

    it('unregisters a plugin', () => {
      manager.register(createMockPlugin('test'));
      const removed = manager.unregister('test');
      expect(removed).toBe(true);
      expect(manager.get('test')).toBeUndefined();
      expect(manager.count).toBe(0);
    });

    it('returns false when unregistering non-existent plugin', () => {
      const removed = manager.unregister('non-existent');
      expect(removed).toBe(false);
    });

    it('lists all registered plugins', () => {
      const p1 = createMockPlugin('p1');
      const p2 = createMockPlugin('p2');
      manager.register(p1);
      manager.register(p2);
      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(all.map(p => p.name)).toEqual(['p1', 'p2']);
    });

    it('checks plugin existence', () => {
      manager.register(createMockPlugin('exists'));
      expect(manager.has('exists')).toBe(true);
      expect(manager.has('missing')).toBe(false);
    });
  });

  describe('hook execution', () => {
    it('runs onSessionStart for all plugins', async () => {
      const p1 = createMockPlugin('p1');
      const p2 = createMockPlugin('p2');
      manager.register(p1);
      manager.register(p2);

      await manager.runHook('onSessionStart', {} as any, {} as any);

      expect(p1.onSessionStart).toHaveBeenCalledOnce();
      expect(p2.onSessionStart).toHaveBeenCalledOnce();
    });

    it('runs onContext for all plugins', async () => {
      const p1 = createMockPlugin('p1');
      const p2 = createMockPlugin('p2');
      manager.register(p1);
      manager.register(p2);

      await manager.runHook('onContext', []);

      expect(p1.onContext).toHaveBeenCalledOnce();
      expect(p2.onContext).toHaveBeenCalledOnce();
    });

    it('continues execution after a plugin error', async () => {
      const goodPlugin = createMockPlugin('good');
      const badPlugin: Plugin = {
        name: 'bad',
        onSessionStart: vi.fn().mockRejectedValue(new Error('Plugin crashed')),
      };

      manager.register(badPlugin);
      manager.register(goodPlugin);

      // Should not throw despite bad plugin error
      await expect(
        manager.runHook('onSessionStart', {} as any),
      ).resolves.toBeUndefined();

      // Good plugin still ran
      expect(goodPlugin.onSessionStart).toHaveBeenCalledOnce();
    });

    it('does nothing if no plugins implement the hook', async () => {
      const plugin: Plugin = { name: 'silent' };
      manager.register(plugin);

      await expect(
        manager.runHook('onSessionStart', {} as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('tool call interception', () => {
    it('allows tool calls by default', async () => {
      const result = await manager.runToolCall(
        { toolName: 'read', input: {} },
        {} as any,
      );
      expect(result).toEqual({ allowed: true });
    });

    it('short-circuits on rejection', async () => {
      const allowPlugin = createMockPlugin('allow');
      const rejectPlugin = createRejectPlugin();
      const afterRejectPlugin = createMockPlugin('after-reject');

      manager.register(allowPlugin);
      manager.register(rejectPlugin);
      manager.register(afterRejectPlugin);

      const result = await manager.runToolCall(
        { toolName: 'edit', input: {} },
        {} as any,
      );

      expect(result).toEqual({ allowed: false, reason: 'Blocked by reject-plugin' });
      // Plugins after rejection should NOT be called
      expect(afterRejectPlugin.onToolCall).not.toHaveBeenCalled();
    });

    it('continues on plugin error in tool call', async () => {
      const errorPlugin: Plugin = {
        name: 'error-plugin',
        onToolCall: vi.fn().mockRejectedValue(new Error('Error!')),
      };
      const normalPlugin = createMockPlugin('normal');

      manager.register(errorPlugin);
      manager.register(normalPlugin);

      const result = await manager.runToolCall(
        { toolName: 'read', input: {} },
        {} as any,
      );

      expect(result).toEqual({ allowed: true });
      expect(normalPlugin.onToolCall).toHaveBeenCalledOnce();
    });
  });

  describe('state management', () => {
    it('clears all plugins', () => {
      manager.register(createMockPlugin('p1'));
      manager.register(createMockPlugin('p2'));
      expect(manager.count).toBe(2);

      manager.clear();
      expect(manager.count).toBe(0);
      expect(manager.getAll()).toHaveLength(0);
    });

    it('unregister removes from get and getAll', () => {
      manager.register(createMockPlugin('p1'));
      manager.register(createMockPlugin('p2'));
      manager.unregister('p1');
      expect(manager.getAll().map(p => p.name)).toEqual(['p2']);
    });
  });
});
