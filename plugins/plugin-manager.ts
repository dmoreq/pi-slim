/**
 * PluginManager — registers, manages, and delegates lifecycle hooks to plugins.
 *
 * Satisfies OCP (Open/Closed Principle):
 *   - Adding new plugin types does NOT require editing SessionManager
 *   - Simply register the plugin via `pluginManager.register(plugin)`
 *
 * Satisfies DIP (Dependency Inversion Principle):
 *   - SessionManager depends on the Plugin interface (abstraction), not
 *     concrete implementations
 *   - New plugins are injected, not hard-coded
 *
 * Usage:
 * ```typescript
 * const pluginManager = new PluginManager();
 * pluginManager.register(new ContextPruningPlugin());
 * pluginManager.register(new ReadAwarenessPlugin());
 *
 * // Run all plugins' onContext hooks
 * await pluginManager.runHook('onContext', [messages]);
 *
 * // Run tool call interception (short-circuits on rejection)
 * const result = await pluginManager.runToolCall(event, ctx);
 * if (!result.allowed) return result;
 * ```
 */

import type { ExtensionContext } from '../extension.js';
import type { Plugin, PluginToolCallResult } from './plugin.js';

// ── Error Class ────────────────────────────────────────────────────────────

export class PluginError extends Error {
  constructor(
    message: string,
    public readonly pluginName: string,
    public readonly hookName: string,
  ) {
    super(`[${pluginName}] ${hookName}: ${message}`);
    this.name = 'PluginError';
  }
}

// ── Hook Names ─────────────────────────────────────────────────────────────

/** All supported plugin lifecycle hooks. */
export type PluginHookName =
  | 'onSessionStart'
  | 'onBeforeAgentStart'
  | 'onContext'
  | 'onTurnEnd'
  | 'onAgentEnd'
  | 'onToolCall'
  | 'onSessionShutdown';

/** Hook names that modify return values (need special handling). */
const TOOL_CALL_HOOK: PluginHookName = 'onToolCall';
const BEFORE_AGENT_HOOK: PluginHookName = 'onBeforeAgentStart';
const CONTEXT_HOOK: PluginHookName = 'onContext';

// ── Plugin Manager ─────────────────────────────────────────────────────────

export class PluginManager {
  /** Registered plugins, keyed by name. */
  private plugins: Map<string, Plugin> = new Map();

  /** Hook execution order (plugins are called in registration order within each hook). */
  private registerOrder: string[] = [];

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a plugin.
   * Throws if a plugin with the same name is already registered.
   */
  register(plugin: Plugin): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new PluginError('Plugin must have a valid name', 'unknown', 'register');
    }
    if (this.plugins.has(plugin.name)) {
      throw new PluginError(`Plugin '${plugin.name}' already registered`, plugin.name, 'register');
    }
    this.plugins.set(plugin.name, plugin);
    this.registerOrder.push(plugin.name);
  }

  /**
   * Unregister a plugin by name.
   * Returns true if the plugin was removed, false if not found.
   */
  unregister(name: string): boolean {
    const existed = this.plugins.delete(name);
    if (existed) {
      this.registerOrder = this.registerOrder.filter(n => n !== name);
    }
    return existed;
  }

  /**
   * Get a registered plugin by name.
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins.
   */
  getAll(): Plugin[] {
    return this.registerOrder.map(name => this.plugins.get(name)!).filter(Boolean);
  }

  /**
   * Get the count of registered plugins.
   */
  get count(): number {
    return this.plugins.size;
  }

  /**
   * Check if a plugin with the given name is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  // ── Hook Execution ──────────────────────────────────────────────────────

  /**
   * Run a lifecycle hook across all registered plugins.
   * Errors in one plugin do NOT prevent other plugins from running.
   */
  async runHook(hook: PluginHookName, ...args: unknown[]): Promise<void> {
    for (const pluginName of this.registerOrder) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) continue;

      const fn = (plugin as unknown as Record<string, unknown>)[hook] as
        | ((...a: unknown[]) => Promise<unknown>)
        | undefined;

      if (typeof fn !== 'function') continue;

      try {
        await fn.apply(plugin, args);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[pi-slim] Plugin ${pluginName} hook ${hook} failed: ${errMsg}`);
        // Continue with next plugin — one failure doesn't stop others
      }
    }
  }

  /**
   * Run onToolCall hook across all plugins.
   * Short-circuits: if any plugin returns { allowed: false }, subsequent
   * plugins are not called and the rejection is returned immediately.
   */
  async runToolCall(
    event: { toolName: string; input: Record<string, unknown> | undefined; toolCallId?: string },
    ctx: ExtensionContext,
  ): Promise<PluginToolCallResult> {
    for (const pluginName of this.registerOrder) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin || !plugin.onToolCall) continue;

      try {
        const result = await plugin.onToolCall(event, ctx);
        if (result && !result.allowed) {
          // Short-circuit: plugin blocked the tool call
          return result;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[pi-slim] Plugin ${pluginName} onToolCall failed: ${errMsg}`);
        // Continue with next plugin
      }
    }

    // All plugins allowed the tool call
    return { allowed: true };
  }

  // ── State Management ─────────────────────────────────────────────────────

  /**
   * Clear all registered plugins.
   */
  clear(): void {
    this.plugins.clear();
    this.registerOrder = [];
  }
}
