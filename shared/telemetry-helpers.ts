/**
 * Centralized telemetry helper functions — DRY principle.
 *
 * All functions delegate to `pi-telemetry/src/helpers.ts` for first-class
 * event and metric support. Falls back to `getTelemetry()` for compatibility.
 *
 * Usage:
 * ```typescript
 * import { recordInjection } from './shared/telemetry-helpers.js';
 * recordInjection('repo-map', 3500);
 * recordInjection('dep-context', 2400, ['src/auth.ts', 'src/db.ts']);
 * ```
 */

import { recordEvent, recordMetric, recordError, telemetryHeartbeat } from 'pi-telemetry/helpers';

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Record a context injection as both a domain event and a metric.
 *
 * Replaces the old pattern of fake tool invocations.
 * Events appear in /telemetry events timeline.
 * Metrics appear in /telemetry metrics dashboard.
 *
 * @param source - Injection source name (e.g. 'repo-map', 'dep-context')
 * @param tokens  - Number of tokens injected
 * @param files   - Optional file paths that were injected
 */
export function recordInjection(source: string, tokens: number, files?: string[]): void {
  recordEvent('pi-scope', 'injection', `${source} ${tokens}t`, {
    source,
    tokens,
    files,
  });

  recordMetric(`${source}-tokens`, tokens, { cumulative: true, tags: { source } });
  if (files && files.length > 0) {
    recordMetric(`${source}-files`, files.length, { cumulative: true, tags: { source } });
  }
}

/**
 * Record a pruning operation as a domain event.
 *
 * @param _rulesApplied - Names of pruning rules that were applied (kept for API compat)
 * @param removed      - Number of messages removed
 * @param total        - Total messages before pruning
 */
export function recordPruning(_rulesApplied: string[], removed: number, total: number): void {
  const pct = total > 0 ? Math.round((removed / total) * 100) : 0;

  recordEvent('pi-scope', 'pruning', `Pruned ${removed}/${total} messages (${pct}%)`, {
    removed,
    total,
    percent: pct,
  });

  recordMetric('pruned-messages', removed, { cumulative: true, tags: { type: 'pruning' } });
}

/**
 * Record context usage statistics as metrics.
 *
 * @param messageCount - Number of messages in context
 * @param toolCalls    - Number of tool calls in session
 * @param filesTouched - Number of unique files modified
 */
export function recordContextUsage(messageCount: number, toolCalls: number, filesTouched: number): void {
  recordMetric('context-messages', messageCount, { cumulative: false, tags: { type: 'context' } });
  recordMetric('context-tool-calls', toolCalls, { cumulative: true, tags: { type: 'context' } });
  recordMetric('context-files-touched', filesTouched, { cumulative: true, tags: { type: 'context' } });
}

/**
 * Record a session error.
 *
 * @param type    - Error type (e.g. 'cache_corrupt', 'index_failed')
 * @param message - Human-readable error message
 */
export function recordSessionError(type: string, message: string): void {
  recordError('pi-scope', type, message);
}

/**
 * Record a session heartbeat with status.
 *
 * @param status - Package health status
 * @param error  - Optional error message if status is 'error'
 */
export function recordHeartbeat(status: 'healthy' | 'degraded' | 'error' | 'stale', error?: string): void {
  telemetryHeartbeat('pi-scope', { status, error });
}
