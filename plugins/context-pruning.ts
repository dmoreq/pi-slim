/**
 * ContextPruningPlugin — removes duplicate/obsolete messages before LLM context.
 *
 * Implements the Plugin interface for integration with pi-slim's plugin system.
 * Uses pure-function pruning rules from pruning-rules.ts (SRP: rules are separate).
 *
 * Pruning rules (applied in order):
 * 1. Deduplication    — Remove identical consecutive user/assistant messages
 * 2. Superseded Writes — Remove old file write results superseded by newer ones
 * 3. Error Purging    — Remove errors followed by successful results
 * 4. Recency          — The last N messages are always preserved
 *
 * Usage:
 * ```typescript
 * const plugin = new ContextPruningPlugin();
 * pluginManager.register(plugin);
 * // Pruning happens automatically on every onContext hook
 * ```
 */

import type { Plugin } from '../plugins/plugin.js';
import type { ExtensionContext } from '../extension.js';
import { applyPruningRules, DEFAULT_RULE_CONFIG, type PruningRuleConfig } from './pruning-rules.js';
import { getTelemetry } from 'pi-telemetry';

export class ContextPruningPlugin implements Plugin {
  readonly name = 'context-pruning';
  readonly version = '0.2.0';

  private config: PruningRuleConfig;
  private totalPruned = 0;
  private totalProcessed = 0;

  constructor(config?: Partial<PruningRuleConfig>) {
    this.config = { ...DEFAULT_RULE_CONFIG, ...config };
  }

  async onSessionStart(_ctx: ExtensionContext): Promise<void> {
    this.totalPruned = 0;
    this.totalProcessed = 0;
  }

  async onContext(messages: Record<string, unknown>[]): Promise<void> {
    if (!this.config || messages.length < 2) return;

    this.totalProcessed += messages.length;
    const typedMessages = messages as any[];

    const { pruned, removed } = applyPruningRules(typedMessages, this.config);
    this.totalPruned += removed;

    if (removed > 0) {
      // Modify messages array in-place (matching the Plugin interface contract)
      messages.length = 0;
      messages.push(...pruned);

      // Report pruning activity via telemetry
      try {
        const t = getTelemetry();
        t?.recordToolInvocation('pi-slim', 'pruning');
        t?.recordToolResult('pi-slim', 'pruning', 0, false);
      } catch {
        // Telemetry is best-effort
      }
    }
  }

  async onSessionShutdown(): Promise<void> {
    // Log final pruning stats
    const pct = this.totalProcessed > 0
      ? Math.round((this.totalPruned / this.totalProcessed) * 100)
      : 0;
    if (this.totalPruned > 0) {
      console.error(
        `[context-pruning] Session summary: ${this.totalPruned}/${this.totalProcessed} (${pct}%) pruned`,
      );
    }
  }

  /**
   * Get current pruning statistics.
   */
  getStats(): { totalPruned: number; totalProcessed: number; percentPruned: number } {
    const pct = this.totalProcessed > 0
      ? Math.round((this.totalPruned / this.totalProcessed) * 100)
      : 0;
    return {
      totalPruned: this.totalPruned,
      totalProcessed: this.totalProcessed,
      percentPruned: pct,
    };
  }

  /**
   * Update pruning configuration at runtime.
   */
  updateConfig(config: Partial<PruningRuleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current pruning configuration.
   */
  getConfig(): PruningRuleConfig {
    return { ...this.config };
  }
}
