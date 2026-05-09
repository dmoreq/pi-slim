/**
 * Graphify-shaped graph analysis — god nodes, communities, surprises, cycles, metrics.
 * Extracted from GraphService for a single analysis responsibility.
 */

import type { GraphifyGraph, GraphifyAnalysis, GodNode } from '../../context/graph-types.js'
import { computeDegreeCentrality, identifyGodNodesByDegree } from '../../algorithms/centrality.js'
import { computePageRank, identifyGodNodesByPageRank } from '../../algorithms/pagerank.js'
import { detectCommunitiesLouvain } from '../../algorithms/community-detection.js'
import { detectAllCycles } from '../../algorithms/cycle-detection.js'
import { detectSurprisingConnections } from '../../algorithms/surprising-connections.js'

export interface GraphifyAnalysisResult {
  graph: GraphifyGraph
  analysis: GraphifyAnalysis
}

export function computeGraphifyAnalysis(graph: GraphifyGraph): GraphifyAnalysisResult {
  const degResults = computeDegreeCentrality(graph)

  const prResults = computePageRank(graph)
  const pageRankGodNodeIds = identifyGodNodesByPageRank(prResults, 0.15)

  const degMap = new Map(degResults.map(d => [d.nodeId, d]))
  const prMap = new Map(prResults.map(p => [p.nodeId, p]))

  const godNodeIds = new Set([
    ...identifyGodNodesByDegree(degResults, 5),
    ...pageRankGodNodeIds,
  ])

  const godNodes: GodNode[] = Array.from(godNodeIds).map(nodeId => ({
    nodeId,
    label: nodeId.includes(':') ? nodeId.split(':')[1] || nodeId : nodeId,
    inDegree: degMap.get(nodeId)?.inDegree ?? 0,
    outDegree: degMap.get(nodeId)?.outDegree ?? 0,
    betweenness: 0,
    pageRank: prMap.get(nodeId)?.score ?? 0,
    community: '',
    criticality: (degMap.get(nodeId)?.inDegree ?? 0) > 20 ? 'CRITICAL' as const :
                 (degMap.get(nodeId)?.inDegree ?? 0) > 10 ? 'IMPORTANT' as const :
                 'NORMAL' as const,
  }))

  const communities = detectCommunitiesLouvain(graph)

  for (const gn of godNodes) {
    gn.community = communities.find(c => c.nodes.includes(gn.nodeId))?.id ?? 'unknown'
  }

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

  const analysis: GraphifyAnalysis = {
    godNodes,
    communities,
    surprises,
    bottlenecks,
    anomalies: cycles.anomalies.map(a => ({
      type: a.type as any,
      severity: a.severity as any,
      nodes: a.affectedNodes,
      description: a.description,
      suggestion: a.recommendation,
    })),
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
      avgClusteringCoeff: 0,
      cycleCount: cycles.cycleCount,
      bottleneckCount: bottlenecks.length,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }

  return { graph, analysis }
}
