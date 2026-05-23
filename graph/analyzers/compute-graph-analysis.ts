/**
 * Assemble analysis from a CodeGraph plus generic analyzer output.
 * Louvain, cycles, surprises, and bottlenecks stay on CodeGraph types; clustering and
 * god-node ranking come from {@link GraphAnalyzer}.
 */

import { computeDegreeCentrality } from '../../algorithms/centrality.js'
import { detectCommunitiesLouvain } from '../../algorithms/community-detection.js'
import { detectAllCycles } from '../../algorithms/cycle-detection.js'
import { computePageRank } from '../../algorithms/pagerank.js'
import { detectSurprisingConnections } from '../../algorithms/surprising-connections.js'
import type { GodNode, GraphAnalysis, CodeGraph } from '../../context/graph-types.js'
import type { AnalysisResult } from '../interfaces/analyzer.interface.js'

export interface GraphAnalysisResult {
  graph: CodeGraph
  analysis: GraphAnalysis
}

/**
 * Build full {@link GraphAnalysis} using Louvain/PageRank/cycles pipeline and
 * analyzer-derived god-node set plus average clustering coefficient.
 */
export function assembleGraphAnalysis(graph: CodeGraph, analyzerResult: AnalysisResult): GraphAnalysis {
  const degResults = computeDegreeCentrality(graph)
  const prResults = computePageRank(graph)

  const degMap = new Map(degResults.map(d => [d.nodeId, d]))
  const prMap = new Map(prResults.map(p => [p.nodeId, p]))

  const communities = detectCommunitiesLouvain(graph)

  const godNodes: GodNode[] = analyzerResult.godNodes.map(gn => {
    const nodeId = gn.id
    const meta = graph.nodes.find(n => n.id === nodeId)
    const d = degMap.get(nodeId)
    const p = prMap.get(nodeId)
    const inDegree = d?.inDegree ?? 0

    return {
      nodeId,
      label: meta?.label ?? (nodeId.includes(':') ? nodeId.split(':')[1] || nodeId : nodeId),
      inDegree,
      outDegree: d?.outDegree ?? 0,
      betweenness: 0,
      pageRank: p?.score ?? 0,
      community: communities.find(c => c.nodes.includes(nodeId))?.id ?? 'unknown',
      criticality: inDegree > 20 ? ('CRITICAL' as const) : inDegree > 10 ? ('IMPORTANT' as const) : ('NORMAL' as const),
    }
  })

  const communityMap = new Map<string, string>()
  for (const c of communities) {
    for (const node of c.nodes) communityMap.set(node, c.id)
  }

  const surprises = detectSurprisingConnections(graph, communityMap)

  const cycles = detectAllCycles(graph)

  const totalNodes = graph.nodes.length
  const totalEdges = graph.edges.length
  const density = totalNodes > 1 ? totalEdges / (totalNodes * (totalNodes - 1)) : 0
  const avgDegree = totalNodes > 0 ? (2 * totalEdges) / totalNodes : 0

  const bottlenecks = degResults
    .filter(d => d.outDegree > 10)
    .map(d => ({
      nodeId: d.nodeId,
      betweenness: 0,
      impact: { ifRemoved: [], pathsThrough: 0, dependentCount: d.outDegree },
    }))

  const analysis: GraphAnalysis = {
    godNodes,
    communities,
    surprises,
    bottlenecks,
    anomalies: cycles.anomalies.map(a => {
      let type: 'circular_dependency' | 'god_node_violation' | 'fragile_pattern' | 'bottleneck' = 'circular_dependency'
      if (a.type === 'highCoupling') type = 'god_node_violation'
      else if (a.type === 'crossLayer') type = 'fragile_pattern'
      else if (a.type === 'orphan') type = 'bottleneck'

      let severity: 'ERROR' | 'WARNING' | 'INFO' = 'INFO'
      if (a.severity === 'CRITICAL' || a.severity === 'HIGH') severity = 'ERROR'
      else if (a.severity === 'MEDIUM') severity = 'WARNING'

      return {
        type,
        severity,
        nodes: a.affectedNodes,
        description: a.description,
        suggestion: a.recommendation,
      }
    }),
    wikipedia: {
      entries: new Map(),
      query: () => [],
      get: () => undefined,
      find: () => [],
    },
    metrics: {
      totalNodes,
      totalEdges,
      godNodeCount: godNodes.length,
      communityCount: communities.length,
      averageDegree: avgDegree,
      maxDegree: Math.max(...degResults.map(d => d.totalDegree), 0),
      graphDensity: density,
      avgClusteringCoeff: analyzerResult.metrics.avgClustering,
      cycleCount: cycles.cycleCount,
      bottleneckCount: bottlenecks.length,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }

  return analysis
}
