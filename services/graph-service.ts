/**
 * GraphService — owns all graph analysis: loading, algorithms, caching, metadata.
 *
 * SRP: Only responsible for graph analysis.
 * OCP: Adding new algorithms doesn't require editing this service — algorithms
 * are standalone modules imported here.
 *
 * Algorithm pipeline (runs at startup when native graph data is computed):
 *   1. Assemble CodeGraph from RepoIndex
 *   2. Degree Centrality + PageRank → god nodes
 *   3. Louvain → communities
 *   4. DFS + Tarjan SCC → cycles
 *   5. Surprise detection → cross-community edges
 *   6. Cache results for fast reload
 */

import type { GraphAnalysis, CodeGraph } from '../context/graph-types.js'
import { assembleGraphAnalysis } from '../graph/analyzers/compute-graph-analysis.js'
import { GraphAnalyzer } from '../graph/analyzers/graph-analyzer.js'
import { repoIndexToCodeGraph } from '../graph/bridge.js'
import { InMemoryAnalysisCache } from '../graph/cache/analysis-cache.js'
import type { Graph as AnalysisGraph } from '../graph/interfaces/analyzer.interface.js'
import { loadGraphCache, saveGraphCache } from '../persistence/graph-cache.js'
import type { RepoIndex } from '../shared/types.js'

export interface GraphResult {
  graph: CodeGraph
  analysis: GraphAnalysis
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

function graphStructureCacheKey(graph: CodeGraph): string {
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
  return `graph-${Math.abs(hash)}`
}

export class GraphService {
  private _analysis: GraphAnalysis | null = null
  private _graph: CodeGraph | null = null
  private readonly sessionAnalysisCache = new InMemoryAnalysisCache()
  private readonly graphAnalyzer: GraphAnalyzer

  constructor() {
    this.graphAnalyzer = new GraphAnalyzer(new InMemoryAnalysisCache())
  }

  get analysis(): GraphAnalysis | null {
    return this._analysis
  }
  get graph(): CodeGraph | null {
    return this._graph
  }

  /**
   * Run graph analysis natively from a RepoIndex (no external tools needed).
   * Converts the index into a CodeGraph on the fly, runs all 5 algorithms,
   * and caches the result.
   */
  async analyzeFromIndex(index: RepoIndex, projectRoot: string, cacheDir: string): Promise<GraphResult> {
    const fp = indexFingerprint(index)

    // Try cache with index-fingerprinted key
    const cached = await loadGraphCache(cacheDir, undefined, fp)
    if (cached) {
      const cachedWithGraph = cached as GraphAnalysis & { _restoredGraph?: CodeGraph }
      this._graph = cachedWithGraph._restoredGraph ?? null
      this._analysis = cached
      return { graph: this._graph!, analysis: cached }
    }

    // Build CodeGraph from RepoIndex
    const graph = repoIndexToCodeGraph(index, projectRoot)
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
  private async runAlgorithms(graph: CodeGraph): Promise<GraphResult> {
    const key = graphStructureCacheKey(graph)
    const cached = this.sessionAnalysisCache.get(key) as GraphAnalysis | null
    if (cached) {
      return { graph, analysis: cached }
    }
    const analyzerResult = await this.graphAnalyzer.analyze(this.toAnalysisGraph(graph))
    const analysis = assembleGraphAnalysis(graph, analyzerResult)
    this.sessionAnalysisCache.set(key, analysis)
    return { graph, analysis }
  }

  private toAnalysisGraph(graph: CodeGraph): AnalysisGraph {
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
