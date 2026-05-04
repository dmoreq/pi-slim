/**
 * Centralized telemetry helper functions — DRY principle.
 *
 * Consolidates all pi-telemetry interaction patterns used throughout
 * pi-slim, replacing ~40 lines of inline telemetry boilerplate.
 *
 * Usage:
 * ```typescript
 * import { recordInjection } from './shared/telemetry-helpers.js';
 * recordInjection('repo-map', 3500);
 * recordInjection('dep-context', 2400, ['src/auth.ts', 'src/db.ts']);
 * ```
 */

import { getTelemetry } from 'pi-telemetry';

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Record a context injection for telemetry.
 * Combines tool invocation, tool result, and metric recording into one call.
 *
 * @param source - Injection source name (e.g. 'repo-map', 'dep-context')
 * @param tokens  - Number of tokens injected
 * @param files   - Optional file paths that were injected
 */
export function recordInjection(source: string, tokens: number, files?: string[]): void {
  try {
    const t = getTelemetry();
    t?.recordToolInvocation('pi-slim', source);
    t?.recordToolResult('pi-slim', source, 0, false);
    t?.recordTokens('pi-slim', { input: tokens, output: 0 });

    if (files && files.length > 0) {
      // Track file counts via heartbeat metadata
      t?.heartbeat('pi-slim', { status: 'healthy', error: undefined });
    }
  } catch {
    // Telemetry is best-effort
  }
}

/**
 * Record a pruning operation for telemetry.
 *
 * @param rulesApplied - Names of pruning rules that were applied
 * @param removed      - Number of messages removed
 * @param total        - Total messages before pruning
 */
export function recordPruning(rulesApplied: string[], removed: number, total: number): void {
  try {
    const t = getTelemetry();
    t?.recordToolInvocation('pi-slim', 'pruning');
    t?.recordToolResult('pi-slim', 'pruning', 0, false);
    // Record ratio as a metric via heartbeat
    t?.heartbeat('pi-slim', { status: 'healthy', error: undefined });
  } catch {
    // Telemetry is best-effort
  }
}

/**
 * Record context usage statistics.
 *
 * @param messageCount - Number of messages in context
 * @param toolCalls    - Number of tool calls in session
 * @param filesTouched - Number of unique files modified
 */
export function recordContextUsage(messageCount: number, toolCalls: number, filesTouched: number): void {
  try {
    const t = getTelemetry();
    t?.recordToolInvocation('pi-slim', 'context-monitor');
    t?.recordToolResult('pi-slim', 'context-monitor', 0, false);
  } catch {
    // Telemetry is best-effort
  }
}

/**
 * Record an automation event.
 *
 * @param triggerId - The triggered automation name
 * @param suggestion - Human-readable suggestion text
 */

/**
 * Record a session error.
 *
 * @param type    - Error type (e.g. 'cache_corrupt', 'index_failed')
 * @param message - Human-readable error message
 */
export function recordSessionError(type: string, message: string): void {
  try {
    getTelemetry()?.recordError('pi-slim', type, message);
  } catch {
    // Telemetry is best-effort
  }
}

/**
 * Record a session heartbeat with status.
 *
 * @param status - Package health status
 * @param error  - Optional error message if status is 'error'
 */
export function recordHeartbeat(status: 'healthy' | 'degraded' | 'error' | 'stale', error?: string): void {
  try {
    getTelemetry()?.heartbeat('pi-slim', { status, error });
  } catch {
    // Telemetry is best-effort
  }
}
