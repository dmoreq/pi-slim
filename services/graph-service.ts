/**
 * GraphService — owns all graph analysis: loading, algorithms, caching, metadata.
 *
 * SRP: Only responsible for graph analysis.
 * OCP: Adding new algorithms doesn't require editing this service — algorithms
 * are standalone modules imported here.
 *
 * Algorithm pipeline (runs at startup when graph data is available):
 *   1. Load graph.json via graph-loader
 *   2. Degree Centrality + PageRank → god nodes
 *   3. Louvain → communities
 *   4. DFS + Tarjan SCC → cycles
 *   5. Surprise detection → cross-community edges
 *   6. Cache results for fast reload
 */

import type { RepoIndex } from '../shared/types.js'
import type { GraphifyGraph, GraphifyAnalysis, GodNode } from '../context/graph-types.js'
import { loadGraphifyJson, type LoadResult } from '../context/graph-loader.js'
import { computeDegreeCentrality, identifyGodNodesByDegree } from '../algorithms/centrality.js'
import { computePageRank, identifyGodNodesByPageRank } from '../algorithms/pagerank.js'
import { detectCommunitiesLouvain } from '../algorithms/community-detection.js'
import { detectAllCycles } from '../algorithms/cycle-detection.js'
import { detectSurprisingConnections } from '../algorithms/surprising-connections.js'
import { saveGraphCache, loadGraphCache } from '../persistence/graph-cache.js'
import { repoIndexToGraphifyGraph } from '../graph/bridge.js'

export interface GraphResult {
  graph: GraphifyGraph
  analysis: GraphifyAnalysis
}

/**
 * Compute a fingerprint of the RepoIndex to use as cache key.
 * Changes when files/symbols/deps change, so cached analysis invalidates properly.
 */
function indexFingerprint(index: RepoIndex): string {
  const parts: string[] = []
  parts.push(`files:${index.skeletons.size}`)
  parts.push(`symbols:${index.symbolIndex.size}`)
  // Sum of dep edges as a quick checksum
  let depSum = 0
  for (const deps of index.deps.values()) depSum += deps.size
  parts.push(`deps:${depSum}`)
  return parts.join('|')
}

export class GraphService {
  private _analysis: GraphifyAnalysis | null = null
  private _graph: GraphifyGraph | null = null
  private _source: 'external' | 'native' | null = null

  get analysis(): GraphifyAnalysis | null { return this._analysis }
  get graph(): GraphifyGraph | null { return this._graph }
  get source(): 'external' | 'native' | null { return this._source }

  /**
   * Try loading from cache first, then fall back to full analysis.
   */
  async load(projectRoot: string, cacheDir: string): Promise<boolean> {
    // Load the raw graph from disk
    const graph = await this.loadGraphJson(projectRoot)
    if (!graph) return false

    this._graph = graph

    // Try cache
    const cached = await loadGraphCache(cacheDir, graph)
    if (cached) {
      this._analysis = cached
      return true
    }
    return false
  }

  /**
   * Run full graph analysis from graph.json (external graphify tool).
   */
  async analyze(projectRoot: string, cacheDir: string): Promise<GraphResult | null> {
    const graph = await this.loadGraphJson(projectRoot)
    if (!graph) return null

    const result = await this.runAlgorithms(graph)
    this._graph = graph
    this._analysis = result.analysis
    this._source = 'external'

    // Cache for next session
    await saveGraphCache(cacheDir, result.analysis, graph).catch(() => {})

    return result
  }

  /**
   * Run graph analysis natively from a RepoIndex (no external graphify needed).
   * Converts the index into a GraphifyGraph on the fly, runs all 5 algorithms,
   * and caches the result.
   */
  async analyzeFromIndex(
    index: RepoIndex,
    projectRoot: string,
    cacheDir: string,
  ): Promise<GraphResult> {
    const fp = indexFingerprint(index)

    // Try cache with index-fingerprinted key
    const cached = await loadGraphCache(cacheDir, undefined, fp)
    if (cached) {
      const cachedWithGraph = cached as GraphifyAnalysis & { _restoredGraph?: GraphifyGraph }
      this._graph = cachedWithGraph._restoredGraph ?? null
      this._analysis = cached
      this._source = 'native'
      return { graph: this._graph!, analysis: cached }
    }

    // Build GraphifyGraph from RepoIndex
    const graph = repoIndexToGraphifyGraph(index, projectRoot)
    this._graph = graph

    const result = await this.runAlgorithms(graph)
    this._analysis = result.analysis
    this._source = 'native'

    // Cache with fingerprint so it invalidates when index changes
    await saveGraphCache(cacheDir, result.analysis, graph, fp).catch(() => {})

    return result
  }

  /**
   * Load graph from multiple possible locations (external graphify tool output).
   */
  private async loadGraphJson(projectRoot: string): Promise<GraphifyGraph | null> {
    const paths = [
      join(projectRoot, 'graph-out/graph.json'),     // Prefer new naming
      join(projectRoot, 'graphify-out/graph.json'),  // Backward compatibility
      join(projectRoot, 'graph.json'),
      'graph-out/graph.json',
      'graphify-out/graph.json',
      './graph-out/graph.json',
      './graphify-out/graph.json',
    ]

    for (const path of paths) {
      const result: LoadResult = await loadGraphifyJson(path).catch(() => ({
        success: false, error: '', warnings: [],
      }))
      if (result.success && result.graph) {
        return result.graph
      }
    }
    return null
  }

  /**
   * Run all algorithms on the graph.
   */
  private async runAlgorithms(graph: GraphifyGraph): Promise<GraphResult> {
    // Degree centrality
    const degResults = computeDegreeCentrality(graph)

    // PageRank
    const prResults = computePageRank(graph)
    const pageRankGodNodeIds = identifyGodNodesByPageRank(prResults, 0.15)

    // Build lookup maps
    const degMap = new Map(degResults.map(d => [d.nodeId, d]))
    const prMap = new Map(prResults.map(p => [p.nodeId, p]))

    // Combined god nodes
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

    // Communities
    const communities = detectCommunitiesLouvain(graph)

    // Update god node community assignments
    for (const gn of godNodes) {
      gn.community = communities.find(c => c.nodes.includes(gn.nodeId))?.id ?? 'unknown'
    }

    // Community map for surprise detection
    const communityMap = new Map<string, string>()
    for (const c of communities) {
      for (const node of c.nodes) communityMap.set(node, c.id)
    }

    // Surprises
    const surprises = detectSurprisingConnections(graph, communityMap)

    // Cycles
    const cycles = detectAllCycles(graph)

    // Metrics
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
}

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}
