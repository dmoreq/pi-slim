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
import { formatGraphQualityOneLine, type GraphMetricsSummary } from '../metrics/graph-metrics.js'
import type { SessionStats } from '../metrics/tracker.js'

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

  onSessionShutdown(stats: SessionStats, opts: { notify: boolean }): void {
    if (!opts.notify || stats.totalTokensSaved <= 0) return
    const pct = Math.round(stats.savingsRatio * 100)
    this.notify(
      `Saved ~${stats.totalTokensSaved}t (${pct}% vs full reads) · ${stats.uniqueFilesInjected} files · ${stats.depContextTriggers} dep-context`,
      {
        severity: 'success' as any,
        badge: { text: 'savings', variant: 'success' as any },
      }
    )
    try {
      getTelemetry()?.recordTokens(PKG, {
        input: stats.totalInjectionTokens(),
        output: 0,
      })
    } catch {}
  }

  onGraphQuality(
    summary: GraphMetricsSummary,
    thresholds: { warnQualityBelow: number; warnCyclesAbove: number }
  ): void {
    const { quality } = summary
    const line = formatGraphQualityOneLine(summary)

    if (quality.score < thresholds.warnQualityBelow || quality.cycleCount > thresholds.warnCyclesAbove) {
      this.notify(line, {
        severity: 'warning' as any,
        badge: { text: 'graph', variant: 'warning' as any },
      })
      return
    }

    if (quality.score >= 80) {
      this.notify(line, {
        severity: 'info' as any,
        badge: { text: 'graph', variant: 'info' as any },
      })
    }
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

  onGraphLoaded(nodeCount: number, edgeCount: number, communityCount?: number): void {
    const detail =
      communityCount && communityCount > 1
        ? `${nodeCount} nodes, ${edgeCount} edges, ${communityCount} communities`
        : `${nodeCount} nodes, ${edgeCount} edges`
    this.notify(`Graph: ${detail}`, {
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
