/**
 * ReadAwarenessPlugin — prevents edits to files that haven't been read first.
 *
 * This plugin tracks which files the user/assistant has read (via `read` tool calls)
 * and blocks `edit`/`write` tool calls on files that haven't been read.
 *
 * Usage:
 * ```typescript
 * const plugin = new ReadAwarenessPlugin();
 * pluginManager.register(plugin);
 * // Plugin will automatically intercept tool calls and block unread edits
 * ```
 */

import type { Plugin, PluginToolCallResult } from '../plugins/plugin.js';
import type { ExtensionContext } from '../extension.js';

// ── Read Awareness Plugin ──────────────────────────────────────────────────

export class ReadAwarenessPlugin implements Plugin {
  readonly name = 'read-awareness';
  readonly version = '0.2.0';

  /** Set of file paths that have been read in the current session. */
  private readFiles = new Set<string>();

  /** Whether read-awareness is enabled. */
  private _enabled = true;

  /**
   * Whether read-awareness is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable or disable read-awareness.
   */
  set enabled(val: boolean) {
    this._enabled = val;
  }

  /**
   * Get the set of files that have been read.
   */
  getReadFiles(): string[] {
    return Array.from(this.readFiles).sort();
  }

  /**
   * Reset tracked files on new session.
   */
  async onSessionStart(_ctx: ExtensionContext): Promise<void> {
    this.readFiles.clear();
  }

  /**
   * Track `read` tool calls to register files that have been read.
   */
  async onToolCall(
    event: { toolName: string; input: Record<string, unknown> | undefined },
    _ctx: ExtensionContext,
  ): Promise<PluginToolCallResult | undefined> {
    if (!this._enabled) return { allowed: true };

    const toolName = event.toolName;
    const input = event.input;

    if (toolName === 'read') {
      // Track read operations
      const path = this.extractPath(input);
      if (path) {
        this.readFiles.add(path);
      }
      return { allowed: true };
    }

    if (toolName === 'write' || toolName === 'edit') {
      // Check if file has been read before allowing edit/write
      const path = this.extractPath(input);
      if (path && !this.readFiles.has(path)) {
        return {
          allowed: false,
          reason: `File "${path}" has not been read. Use \`read\` tool first before editing or writing.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Extract file path from tool call input.
   */
  private extractPath(input: Record<string, unknown> | undefined): string | null {
    if (!input) return null;
    const path = input.path as string | undefined;
    if (path && typeof path === 'string') return path;
    const filePath = input.filePath as string | undefined;
    if (filePath && typeof filePath === 'string') return filePath;
    return null;
  }
}
