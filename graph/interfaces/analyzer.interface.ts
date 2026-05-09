/**
 * Analyzer-facing graph shapes (generic `from` / `to` edges).
 * Distinct from graphify loader types in `context/graph-types.ts`.
 */

export interface GraphNode {
  id: string
  type?: string
  properties?: Record<string, unknown>
}

export interface GraphEdge {
  from: string
  to: string
  type?: string
  weight?: number
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GodNode {
  id: string
  connectivity: number
  centrality: number
  influence: number
}

export interface Community {
  id: string
  nodes: string[]
  cohesion: number
  description?: string
}

export interface GraphMetrics {
  nodeCount: number
  edgeCount: number
  density: number
  avgClustering: number
}

export interface SurprisingConnection {
  from: string
  to: string
  reason: string
  confidence: number
}

export interface AnalysisResult {
  godNodes: GodNode[]
  communities: Community[]
  metrics: GraphMetrics
  surprisingConnections: SurprisingConnection[]
}

export interface GraphAnalyzer {
  analyze(graph: Graph): Promise<AnalysisResult>
}
