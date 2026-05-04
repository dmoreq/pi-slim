/**
 * Plugin interface — contract for extending pi-scope with custom behavior.
 *
 * Satisfies OCP (Open/Closed Principle):
 *   - Extensions add new features by implementing this interface
 *   - No changes to core SessionManager needed
 *
 * Satisfies LSP (Liskov Substitution Principle):
 *   - Any Plugin implementation can be used interchangeably
 *   - All hooks are optional — a plugin only implements what it needs
 *
 * Built-in plugins:
 *   - ContextPruningPlugin — removes redundant/obsolete messages
 *   - ReadAwarenessPlugin — prevents unread file edits
 *   - TelemetryReporterPlugin — records detailed telemetry
 *
 * Example custom plugin:
 * ```typescript
 * class MyAnalyticsPlugin implements Plugin {
 *   readonly name = 'my-analytics';
 *
 *   async onTurnEnd(ctx: ExtensionContext): Promise<void> {
 *     console.log('Turn completed');
 *   }
 * }
 * ```
 */

import type { ExtensionContext } from '../extension.js';

// ── Plugin Tool Call Result ────────────────────────────────────────────────

export interface PluginToolCallResult {
  /** Whether the tool call is allowed to proceed. */
  allowed: boolean;
  /** Human-readable reason for denial (shown to user). */
  reason?: string;
}

// ── Plugin Interface ───────────────────────────────────────────────────────

export interface Plugin {
  /** Unique plugin name (used for registration, logging, and dedup). */
  readonly name: string;

  /** Optional semantic version. */
  readonly version?: string;

  /**
   * Called when a new session starts.
   * Use to initialize plugin state.
   */
  onSessionStart?(ctx: ExtensionContext): Promise<void>;

  /**
   * Called before the agent starts.
   * Use to modify the system prompt.
   */
  onBeforeAgentStart?(
    event: { type: 'before_agent_start'; systemPrompt: string; prompt: string },
    ctx: ExtensionContext,
  ): Promise<{ systemPrompt: string } | undefined>;

  /**
   * Called during context construction (per-turn).
   * Use to prune, augment, or transform context messages.
   */
  onContext?(messages: Record<string, unknown>[]): Promise<void>;

  /**
   * Called after each turn completes.
   * Use for post-turn processing, tracking, or metrics.
   */
  onTurnEnd?(ctx: ExtensionContext): Promise<void>;

  /**
   * Called after agent output.
   * Use for post-agent processing.
   */
  onAgentEnd?(event: Record<string, unknown>, ctx: ExtensionContext): Promise<void>;

  /**
   * Called for every tool invocation.
   * Return { allowed: false, reason: '...' } to block a tool call.
   */
  onToolCall?(
    event: { toolName: string; input: Record<string, unknown> | undefined; toolCallId?: string },
    ctx: ExtensionContext,
  ): Promise<PluginToolCallResult | undefined>;

  /**
   * Called when the session shuts down.
   * Use to persist plugin state, clean up resources.
   */
  onSessionShutdown?(): Promise<void>;
}
