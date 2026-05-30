/**
 * TelemetryService — single point of contact for all pi-telemetry calls.
 *
 * SRP: All pi-telemetry integration goes through this service.
 * DRY: No other source file imports pi-telemetry directly.
 * OCP: Adding new telemetry events only requires adding a method here.
 *
 * Uses the actual pi-telemetry API:
 *   recordError(pkgName, type, message)
 *   recordToolInvocation(pkgName, tool)
 *   recordToolResult(pkgName, tool, duration, isError)
 *   recordTokens(pkgName, tokens)
 *   recordCost(pkgName, cost)
 *   notify(message, opts?)
 */

import { getTelemetry } from 'pi-telemetry'
import type { NotifyOptions } from 'pi-telemetry/types'

const PKG = 'pi-scope'

let _registered = false

export class TelemetryService {
  /**
   * Keep pi-scope out of pi-telemetry's footer widget.
   *
   * Notifications and aggregate records still work through pi-telemetry, but
   * package registration/heartbeats create the visible "📊 ... pi-scope" footer
   * entry. Deregister defensively in case an older build registered earlier in
   * the process.
   */
  register(): void {
    if (_registered) return
    _registered = true
    try {
      getTelemetry()?.deregister(PKG)
    } catch {
      // pi-telemetry may not be available
    }
  }

  heartbeat(status: 'healthy' | 'degraded' | 'error' | 'stale' = 'healthy', error?: string): void {
    void status
    void error
  }

  notify(message: string, opts?: NotifyOptions): void {
    try {
      getTelemetry()?.notify(message, opts)
    } catch {}
  }

  recordError(type: string, message: string): void {
    try {
      getTelemetry()?.recordError(PKG, type, message)
    } catch {}
  }

  recordTokens(tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): void {
    try {
      getTelemetry()?.recordTokens(PKG, tokens)
    } catch {}
  }

  // ── High-level event helpers ──────────────────────────────────────

  onSessionStart(): void {
    this.heartbeat('healthy')
  }

  onSessionShutdown(): void {
    // auto-recorded by pi-telemetry
  }

  onCacheHit(fileCount: number): void {
    this.notify(`Loaded ${fileCount} files from cache`, {
      severity: 'success' as any,
      badge: { text: 'index', variant: 'success' as any },
    })
  }

  onFreshBuild(fileCount: number, buildTimeMs: number): void {
    this.notify(`Indexed ${fileCount} files in ${(buildTimeMs / 1000).toFixed(1)}s`, {
      severity: 'success' as any,
      badge: { text: 'index', variant: 'success' as any },
    })
  }

  onGraphLoaded(nodeCount: number, edgeCount: number): void {
    this.notify(`Graph: ${nodeCount} nodes, ${edgeCount} edges`, {
      severity: 'info' as any,
      badge: { text: 'graph', variant: 'info' as any },
    })
  }

  onGraphNoData(): void {
    // Silent — graph is optional
  }

  onError(type: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err)
    this.recordError(type, msg)
    this.notify(`Error: ${msg}`, {
      severity: 'error' as any,
      badge: { text: 'error', variant: 'error' as any },
    })
  }
}
