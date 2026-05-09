/**
 * Graph Cache — persistent caching of graph analysis results.
 *
 * Avoids recomputing graph analysis on every session startup.
 * Caches GraphifyAnalysis in the .pi/scope/ store alongside the index.
 * On cache hit, deserializes and reconstructs the analysis from stored data.
 *
 * Cache invalidation:
 *   - Version mismatch → recompute
 *   - Index checksum change → recompute (future)
 *   - TTL expired → recompute (future)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type {
  GraphifyGraph,
  GraphifyAnalysis,
  GodNode,
  CommunityAnalysis,
  SurprisingConnection,
  Bottleneck,
  Anomaly,
  WikipediaEntry,
  WikipediaIndex,
  WikipediaQueryParams
} from '../context/graphify-types'

// ── Cache Schema ───────────────────────────────────────────────────────────

export const GRAPH_CACHE_VERSION = 1

/**
 * Storable graph analysis data.
 * Minified JSON-serializable version of GraphifyAnalysis.
 */
export interface CachedGraphData {
  version: number
  cachedAt: string
  
  // Graph
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ source: string; target: string; type: string; surprising?: boolean }>
  
  // Communities
  communities: Array<{
    id: string
    label: string
    nodes: string[]
    internalDensity: number
    externalDensity: number
    interfaceNodes: string[]
    bottlenecks: string[]
  }>
  
  // God nodes
  godNodes: Array<{
    nodeId: string
    label: string
    inDegree: number
    outDegree: number
    betweenness: number
    pageRank: number
    community: string
    criticality: 'CRITICAL' | 'IMPORTANT' | 'NORMAL'
  }>
  
  // Surprises
  surprises: Array<{
    source: string
    target: string
    reason: string
    confidence: number
  }>
  
  // Bottlenecks
  bottlenecks: Array<{
    nodeId: string
    betweenness: number
  }>
  
  // Anomalies
  anomalies: Array<{
    type: string
    severity: string
    nodes: string[]
    description: string
  }>
  
  // Metrics
  metrics: {
    totalNodes: number
    totalEdges: number
    godNodeCount: number
    communityCount: number
    averageDegree: number
    maxDegree: number
    graphDensity: number
    cycleCount: number
    bottleneckCount: number
  }
  
  // Computed stats
  computedAt: number
}

// ── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize a full GraphifyAnalysis to cacheable format.
 * Requires a GraphifyGraph for node/edge data (not part of GraphifyAnalysis).
 */
export function serializeAnalysis(analysis: GraphifyAnalysis, graph: GraphifyGraph): CachedGraphData {
  return {
    version: GRAPH_CACHE_VERSION,
    cachedAt: new Date().toISOString(),
    nodes: graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
    })),
    edges: graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      surprising: e.surprising,
    })),
    communities: analysis.communities.map(c => ({
      id: c.id,
      label: c.label,
      nodes: c.nodes,
      internalDensity: c.internalDensity,
      externalDensity: c.externalDensity,
      interfaceNodes: c.interfaceNodes,
      bottlenecks: c.bottlenecks,
    })),
    godNodes: analysis.godNodes.map(g => ({
      nodeId: g.nodeId,
      label: g.label,
      inDegree: g.inDegree,
      outDegree: g.outDegree,
      betweenness: g.betweenness,
      pageRank: g.pageRank,
      community: g.community,
      criticality: g.criticality,
    })),
    surprises: analysis.surprises.map(s => ({
      source: s.source,
      target: s.target,
      reason: s.reason,
      confidence: s.confidence,
    })),
    bottlenecks: analysis.bottlenecks.map(b => ({
      nodeId: b.nodeId,
      betweenness: b.betweenness,
    })),
    anomalies: analysis.anomalies.map(a => ({
      type: a.type,
      severity: a.severity,
      nodes: a.nodes,
      description: a.description,
    })),
    metrics: {
      totalNodes: analysis.metrics.totalNodes,
      totalEdges: analysis.metrics.totalEdges,
      godNodeCount: analysis.metrics.godNodeCount,
      communityCount: analysis.metrics.communityCount,
      averageDegree: analysis.metrics.averageDegree,
      maxDegree: analysis.metrics.maxDegree,
      graphDensity: analysis.metrics.graphDensity,
      cycleCount: analysis.metrics.cycleCount,
      bottleneckCount: analysis.metrics.bottleneckCount,
    },
    computedAt: analysis.computedAt,
  }
}

/**
 * Deserialize cached data back into a full GraphifyAnalysis.
 * Note: The wikipedia index is not cached and must be rebuilt on load.
 */
export function deserializeAnalysis(
  cached: CachedGraphData,
  graph: GraphifyGraph
): GraphifyAnalysis {
  // Reconstruct GraphifyGraph from the cached data merged with the original graph
  const reconstructedGraph: GraphifyGraph = graph || {
    nodes: cached.nodes.map(n => ({
      id: n.id,
      type: n.type as GraphifyGraph['nodes'][0]['type'],
      label: n.label,
    })),
    edges: cached.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type as GraphifyGraph['edges'][0]['type'],
      surprising: e.surprising,
    })),
  }

  return {
    graph: reconstructedGraph,
    godNodes: cached.godNodes.map(g => ({
      nodeId: g.nodeId,
      label: g.label,
      inDegree: g.inDegree,
      outDegree: g.outDegree,
      betweenness: g.betweenness,
      pageRank: g.pageRank,
      community: g.community,
      criticality: g.criticality,
    })),
    communities: cached.communities.map(c => ({
      id: c.id,
      label: c.label,
      nodes: c.nodes,
      internalDensity: c.internalDensity,
      externalDensity: c.externalDensity,
      interfaceNodes: c.interfaceNodes,
      bottlenecks: c.bottlenecks,
    })),
    surprises: cached.surprises.map(s => ({
      source: s.source,
      target: s.target,
      reason: s.reason as SurprisingConnection['reason'],
      confidence: s.confidence,
    })),
    bottlenecks: cached.bottlenecks.map(b => ({
      nodeId: b.nodeId,
      betweenness: b.betweenness,
      impact: {
        ifRemoved: [],
        pathsThrough: 0,
        dependentCount: 0,
      },
    })),
    anomalies: cached.anomalies.map(a => ({
      type: a.type as Anomaly['type'],
      severity: a.severity as Anomaly['severity'],
      nodes: a.nodes,
      description: a.description,
    })),
    wikipedia: {
      entries: new Map(),
      query: (_params: WikipediaQueryParams) => [],
      get: (_nodeId: string) => undefined,
      find: (_predicate: (entry: WikipediaEntry) => boolean) => [],
    },
    metrics: cached.metrics,
    computedAt: cached.computedAt,
    version: `${GRAPH_CACHE_VERSION}.0`,
  }
}

// ── File I/O ───────────────────────────────────────────────────────────────

/**
 * Save graph analysis to cache file.
 *
 * @param cacheDir Directory to store cache file (e.g., .pi/scope/)
 * @param analysis Graph analysis to cache
 * @param graph The original GraphifyGraph (nodes/edges not in analysis)
 */
export async function saveGraphCache(
  cacheDir: string,
  analysis: GraphifyAnalysis,
  graph: GraphifyGraph
): Promise<boolean> {
  try {
    const dir = dirname(join(cacheDir, 'graph-cache.json'))
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const cached = serializeAnalysis(analysis, graph)
    const filePath = join(cacheDir, 'graph-cache.json')
    await writeFile(filePath, JSON.stringify(cached, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('[graph-cache] Failed to save:', err)
    return false
  }
}

/**
 * Load graph analysis from cache file.
 *
 * @param cacheDir Directory to look for cache file
 * @param graph The original GraphifyGraph (edges/nodes not cached in full detail)
 * @returns Deserialized analysis or null if cache doesn't exist or version mismatch
 */
export async function loadGraphCache(
  cacheDir: string,
  graph: GraphifyGraph
): Promise<GraphifyAnalysis | null> {
  try {
    const filePath = join(cacheDir, 'graph-cache.json')

    if (!existsSync(filePath)) {
      return null
    }

    const content = await readFile(filePath, 'utf-8')
    const cached: CachedGraphData = JSON.parse(content)

    // Version check
    if (cached.version !== GRAPH_CACHE_VERSION) {
      console.warn('[graph-cache] Version mismatch, ignoring cache')
      return null
    }

    return deserializeAnalysis(cached, graph)
  } catch (err) {
    console.warn('[graph-cache] Failed to load cache:', err)
    return null
  }
}

/**
 * Check if a graph cache exists.
 *
 * @param cacheDir Directory to look for cache file
 */
export function graphCacheExists(cacheDir: string): boolean {
  return existsSync(join(cacheDir, 'graph-cache.json'))
}

/**
 * Delete the graph cache file.
 *
 * @param cacheDir Directory containing cache file
 */
export async function clearGraphCache(cacheDir: string): Promise<boolean> {
  try {
    const { unlink } = await import('node:fs/promises')
    const filePath = join(cacheDir, 'graph-cache.json')
    if (existsSync(filePath)) {
      await unlink(filePath)
    }
    return true
  } catch (err) {
    console.error('[graph-cache] Failed to clear cache:', err)
    return false
  }
}

/**
 * Get cache stats for diagnostics.
 *
 * @param cacheDir Directory containing cache file
 */
export async function getGraphCacheStats(cacheDir: string): Promise<{
  exists: boolean
  size: number
  version: number
  cachedAt: string | null
} | null> {
  try {
    const filePath = join(cacheDir, 'graph-cache.json')
    if (!existsSync(filePath)) {
      return { exists: false, size: 0, version: 0, cachedAt: null }
    }

    const content = await readFile(filePath, 'utf-8')
    const cached: CachedGraphData = JSON.parse(content)

    return {
      exists: true,
      size: Buffer.byteLength(content, 'utf-8'),
      version: cached.version,
      cachedAt: cached.cachedAt,
    }
  } catch {
    return null
  }
}
