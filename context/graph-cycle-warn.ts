/**
 * Cycle / anomaly warnings for files in focus during editing.
 */

import { relative } from 'node:path'
import { parseGraphNodeId } from './graph-node-id.js'
import type { Anomaly, GraphAnalysis } from './graph-types.js'

function relPathsFromAnomaly(anomaly: Anomaly): string[] {
  const out: string[] = []
  for (const nodeId of anomaly.nodes) {
    const { pathPart, symbolPart } = parseGraphNodeId(nodeId)
    if (!pathPart || symbolPart) continue
    out.push(pathPart.replace(/\\/g, '/'))
  }
  return out
}

function pathsOverlap(focusRel: string[], anomalyRels: string[]): boolean {
  const focus = new Set(focusRel.map(p => p.replace(/\\/g, '/')))
  return anomalyRels.some(p => focus.has(p) || [...focus].some(f => f.endsWith(`/${p}`) || p.endsWith(`/${f}`)))
}

/**
 * One-line warning when any in-focus file participates in a recorded cycle anomaly.
 */
export function cycleWarningForFiles(
  analysis: GraphAnalysis | null | undefined,
  focusAbsPaths: string[],
  projectRoot: string
): string | null {
  if (!analysis?.anomalies.length || focusAbsPaths.length === 0) return null

  const focusRel = focusAbsPaths.map(p => relative(projectRoot, p).replace(/\\/g, '/'))
  const cycleAnomalies = analysis.anomalies.filter(
    a => a.type === 'circular_dependency' || a.description.toLowerCase().includes('cycle')
  )

  for (const an of cycleAnomalies) {
    const anRel = relPathsFromAnomaly(an)
    if (pathsOverlap(focusRel, anRel)) {
      const sample = anRel.slice(0, 3).join(', ')
      return `Circular dependency involves in-focus file(s) (${sample}) — avoid deepening import cycles.`
    }
  }

  if (analysis.metrics.cycleCount > 0 && focusRel.length > 0) {
    return `Graph reports ${analysis.metrics.cycleCount} circular dependency cycle(s) in this repo — review imports before large refactors.`
  }

  return null
}

/**
 * Block for intelligence when editing and cycles may apply.
 */
export function formatCycleIntelligenceBlock(
  analysis: GraphAnalysis | null | undefined,
  focusAbsPaths: string[],
  projectRoot: string
): string | null {
  const line = cycleWarningForFiles(analysis, focusAbsPaths, projectRoot)
  if (!line) return null
  return `⚠️ GRAPH CYCLE RISK:\n- ${line}`
}
