/**
 * Tests for shared/telemetry-helpers.ts
 *
 * Uses a mock for pi-telemetry at module level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create spies before importing the module under test
const mockRecordToolInvocation = vi.fn();
const mockRecordToolResult = vi.fn();
const mockRecordTokens = vi.fn();
const mockRecordError = vi.fn();
const mockHeartbeat = vi.fn();
const mockRecordCost = vi.fn();

const mockGetTelemetry = vi.fn(() => ({
  recordToolInvocation: mockRecordToolInvocation,
  recordToolResult: mockRecordToolResult,
  recordTokens: mockRecordTokens,
  recordError: mockRecordError,
  heartbeat: mockHeartbeat,
  recordCost: mockRecordCost,
}));

vi.mock('pi-telemetry', () => ({
  getTelemetry: mockGetTelemetry,
  default: vi.fn(),
}));

// Import the module under test AFTER the mock
const { recordInjection, recordPruning, recordContextUsage, recordSessionError, recordHeartbeat }
  = await import('../../shared/telemetry-helpers.js');

describe('telemetry-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordInjection', () => {
    it('records tool invocation, result, and tokens', () => {
      recordInjection('repo-map', 3500);

      expect(mockRecordToolInvocation).toHaveBeenCalledWith('pi-slim', 'repo-map');
      expect(mockRecordToolResult).toHaveBeenCalledWith('pi-slim', 'repo-map', 0, false);
      expect(mockRecordTokens).toHaveBeenCalledWith('pi-slim', { input: 3500, output: 0 });
    });

    it('handles optional file list', () => {
      recordInjection('dep-context', 2400, ['src/auth.ts', 'src/db.ts']);

      expect(mockRecordToolInvocation).toHaveBeenCalledWith('pi-slim', 'dep-context');
      expect(mockRecordToolResult).toHaveBeenCalledWith('pi-slim', 'dep-context', 0, false);
    });

    it('is safe when telemetry is null', () => {
      mockGetTelemetry.mockReturnValueOnce(null);
      expect(() => recordInjection('test', 100)).not.toThrow();
    });
  });

  describe('recordPruning', () => {
    it('records pruning operation', () => {
      recordPruning(['dedup', 'error-purge'], 5, 20);

      expect(mockRecordToolInvocation).toHaveBeenCalledWith('pi-slim', 'pruning');
      expect(mockRecordToolResult).toHaveBeenCalledWith('pi-slim', 'pruning', 0, false);
    });
  });

  describe('recordContextUsage', () => {
    it('records context monitoring', () => {
      recordContextUsage(50, 20, 10);

      expect(mockRecordToolInvocation).toHaveBeenCalledWith('pi-slim', 'context-monitor');
      expect(mockRecordToolResult).toHaveBeenCalledWith('pi-slim', 'context-monitor', 0, false);
    });
  });


  describe('recordSessionError', () => {
    it('records error events', () => {
      recordSessionError('cache_corrupt', 'Store corrupted');

      expect(mockRecordError).toHaveBeenCalledWith('pi-slim', 'cache_corrupt', 'Store corrupted');
    });
  });

  describe('recordHeartbeat', () => {
    it('records heartbeats', () => {
      recordHeartbeat('healthy');

      expect(mockHeartbeat).toHaveBeenCalledWith('pi-slim', { status: 'healthy', error: undefined });
    });

    it('records error heartbeats', () => {
      recordHeartbeat('error', 'Indexing failed');

      expect(mockHeartbeat).toHaveBeenCalledWith('pi-slim', { status: 'error', error: 'Indexing failed' });
    });
  });

  describe('handling null telemetry globally', () => {
    it('all functions handle null telemetry gracefully', () => {
      mockGetTelemetry.mockReturnValue(null);

      expect(() => {
        recordInjection('test', 100);
        recordPruning(['a', 'b'], 1, 10);
        recordContextUsage(1, 1, 1);
        recordSessionError('test', 'test');
        recordHeartbeat('healthy');
      }).not.toThrow();
    });
  });
});
