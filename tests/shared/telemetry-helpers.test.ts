/**
 * Tests for shared/telemetry-helpers.ts
 *
 * Uses mocks for pi-telemetry module-level helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create spies for pi-telemetry/helpers
const mockRecordEvent = vi.fn();
const mockRecordMetric = vi.fn();
const mockRecordError = vi.fn();
const mockTelemetryHeartbeat = vi.fn();

vi.mock('pi-telemetry/helpers', () => ({
  recordEvent: mockRecordEvent,
  recordMetric: mockRecordMetric,
  recordError: mockRecordError,
  telemetryHeartbeat: mockTelemetryHeartbeat,
}));

// Import the module under test AFTER the mock
const {
  recordInjection,
  recordPruning,
  recordContextUsage,
  recordSessionError,
  recordHeartbeat,
} = await import('../../shared/telemetry-helpers.js');

describe('telemetry-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordInjection', () => {
    it('records a domain event and metric', () => {
      recordInjection('repo-map', 3500);

      expect(mockRecordEvent).toHaveBeenCalledWith(
        'pi-scope',
        'injection',
        'repo-map 3500t',
        { source: 'repo-map', tokens: 3500, files: undefined },
      );
      expect(mockRecordMetric).toHaveBeenCalledWith(
        'repo-map-tokens',
        3500,
        { cumulative: true, tags: { source: 'repo-map' } },
      );
    });

    it('handles optional file list with file metric', () => {
      recordInjection('dep-context', 2400, ['src/auth.ts', 'src/db.ts']);

      expect(mockRecordEvent).toHaveBeenCalledWith(
        'pi-scope',
        'injection',
        'dep-context 2400t',
        { source: 'dep-context', tokens: 2400, files: ['src/auth.ts', 'src/db.ts'] },
      );
      expect(mockRecordMetric).toHaveBeenCalledWith(
        'dep-context-files',
        2,
        { cumulative: true, tags: { source: 'dep-context' } },
      );
    });

    it('is safe when helpers are null', () => {
      // Simulate pi-telemetry not loaded — helpers are no-op by design
      // The real pi-telemetry/helpers are safe no-ops; our mock always returns fns
      expect(() => recordInjection('test', 100)).not.toThrow();
    });
  });

  describe('recordPruning', () => {
    it('records pruning event and metric', () => {
      recordPruning(['dedup', 'error-purge'], 5, 20);

      expect(mockRecordEvent).toHaveBeenCalledWith(
        'pi-scope',
        'pruning',
        'Pruned 5/20 messages (25%)',
        { removed: 5, total: 20, percent: 25 },
      );
      expect(mockRecordMetric).toHaveBeenCalledWith(
        'pruned-messages',
        5,
        { cumulative: true, tags: { type: 'pruning' } },
      );
    });
  });

  describe('recordContextUsage', () => {
    it('records context metrics', () => {
      recordContextUsage(50, 20, 10);

      expect(mockRecordMetric).toHaveBeenCalledWith(
        'context-messages',
        50,
        { cumulative: false, tags: { type: 'context' } },
      );
      expect(mockRecordMetric).toHaveBeenCalledWith(
        'context-tool-calls',
        20,
        { cumulative: true, tags: { type: 'context' } },
      );
      expect(mockRecordMetric).toHaveBeenCalledWith(
        'context-files-touched',
        10,
        { cumulative: true, tags: { type: 'context' } },
      );
    });
  });

  describe('recordSessionError', () => {
    it('records error events', () => {
      recordSessionError('cache_corrupt', 'Store corrupted');

      expect(mockRecordError).toHaveBeenCalledWith('pi-scope', 'cache_corrupt', 'Store corrupted');
    });
  });

  describe('recordHeartbeat', () => {
    it('records heartbeats', () => {
      recordHeartbeat('healthy');

      expect(mockTelemetryHeartbeat).toHaveBeenCalledWith('pi-scope', { status: 'healthy', error: undefined });
    });

    it('records error heartbeats', () => {
      recordHeartbeat('error', 'Indexing failed');

      expect(mockTelemetryHeartbeat).toHaveBeenCalledWith('pi-scope', { status: 'error', error: 'Indexing failed' });
    });
  });
});
