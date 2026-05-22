/**
 * GraphService — owns all graph analysis: loading, algorithms, caching, metadata.
 *
 * SRP: Only responsible for graph analysis.
 * OCP: Adding new algorithms doesn't require editing this service — algorithms
 * are standalone modules imported here.
 *
 * Algorithm pipeline (runs at startup when native graph data is computed):
 *   1. Assemble GraphifyGraph from RepoIndex
 *   2. Degree Centrality + PageRank → god nodes
 *   3. Louvain → communities
 *   4. DFS + Tarjan SCC → cycles
 *   5. Surprise detection → cross-community edges
 *   6. Cache results for fast reload
 */

import type { GraphifyAnalysis, GraphifyGraph } from '../context/graph-types.js'
import { assembleGraphifyAnalysis } from '../graph/analyzers/compute-graphify-analysis.js'
import { GraphAnalyzer } from '../graph/analyzers/graph-analyzer.js'
import { repoIndexToGraphifyGraph } from '../graph/bridge.js'
import { InMemoryAnalysisCache } from '../graph/cache/analysis-cache.js'
import type { Graph as AnalysisGraph } from '../graph/interfaces/analyzer.interface.js'
import { loadGraphCache, saveGraphCache } from '../persistence/graph-cache.js'
import type { RepoIndex } from '../shared/types.js'

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

function graphifyStructureCacheKey(graph: GraphifyGraph): string {
  const content = JSON.stringify({
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    nodeIds: graph.nodes.map(n => n.id).sort(),
    edges: graph.edges.map(e => `${e.source}|${e.target}|${e.type}`).sort(),
  })
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return `graphify-${Math.abs(hash)}`
}

export class GraphService {
  private _analysis: GraphifyAnalysis | null = null
  private _graph: GraphifyGraph | null = null
  private readonly sessionAnalysisCache = new InMemoryAnalysisCache()
  private readonly graphAnalyzer: GraphAnalyzer

  constructor() {
    this.graphAnalyzer = new GraphAnalyzer(new InMemoryAnalysisCache())
  }

  get analysis(): GraphifyAnalysis | null {
    return this._analysis
  }
  get graph(): GraphifyGraph | null {
    return this._graph
  }

  /**
   * Run graph analysis natively from a RepoIndex (no external graphify needed).
   * Converts the index into a GraphifyGraph on the fly, runs all 5 algorithms,
   * and caches the result.
   */
  async analyzeFromIndex(index: RepoIndex, projectRoot: string, cacheDir: string): Promise<GraphResult> {
    const fp = indexFingerprint(index)

    // Try cache with index-fingerprinted key
    const cached = await loadGraphCache(cacheDir, undefined, fp)
    if (cached) {
      const cachedWithGraph = cached as GraphifyAnalysis & { _restoredGraph?: GraphifyGraph }
      this._graph = cachedWithGraph._restoredGraph ?? null
      this._analysis = cached
      return { graph: this._graph!, analysis: cached }
    }

    // Build GraphifyGraph from RepoIndex
    const graph = repoIndexToGraphifyGraph(index, projectRoot)
    this._graph = graph

    const result = await this.runAlgorithms(graph)
    this._analysis = result.analysis

    // Cache with fingerprint so it invalidates when index changes
    await saveGraphCache(cacheDir, result.analysis, graph, fp).catch(() => {})

    return result
  }

  /**
   * Run all algorithms on the graph.
   */
  private async runAlgorithms(graph: GraphifyGraph): Promise<GraphResult> {
    const key = graphifyStructureCacheKey(graph)
    const cached = this.sessionAnalysisCache.get(key) as GraphifyAnalysis | null
    if (cached) {
      return { graph, analysis: cached }
    }
    const analyzerResult = await this.graphAnalyzer.analyze(this.toAnalysisGraph(graph))
    const analysis = assembleGraphifyAnalysis(graph, analyzerResult)
    this.sessionAnalysisCache.set(key, analysis)
    return { graph, analysis }
  }

  private toAnalysisGraph(graph: GraphifyGraph): AnalysisGraph {
    return {
      nodes: graph.nodes.map(n => ({
        id: n.id,
        type: n.type,
        properties: n.metadata,
      })),
      edges: graph.edges.map(e => ({
        from: e.source,
        to: e.target,
        type: e.type,
        weight: e.weight,
      })),
    }
  }
}
