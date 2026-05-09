/**
 * Graphify Integration Types
 *
 * Core type definitions for loading and analyzing graphify's knowledge graphs.
 * These types represent both the input from graphify (GraphifyGraph) and the
 * computed analysis output (GraphifyAnalysis).
 */

import type { ContextInsights, EnhancedContextLayer } from '../shared/intelligence-types.js'

// ── Input: Graphify Graph Structure ────────────────────────────────────────

/**
 * A node in the knowledge graph.
 * Represents a code symbol (function, class, module, etc.) or concept.
 */
export interface GraphNode {
  /** Unique identifier, typically "file:symbol" or "concept-name" */
  id: string

  /** Node type: function, class, module, concept, interface, etc. */
  type: 'function' | 'class' | 'module' | 'concept' | 'interface' | 'variable'

  /** Human-readable label */
  label: string

  /** Optional description of what this node represents */
  description?: string

  /** Optional metadata (confidence, source, etc.) */
  metadata?: Record<string, unknown>
}

/**
 * An edge in the knowledge graph.
 * Represents a relationship between two nodes.
 */
export interface GraphEdge {
  /** Source node ID */
  source: string

  /** Target node ID */
  target: string

  /** Type of relationship */
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'uses' | 'depends_on'

  /** Optional strength of relationship (0-1, where 1 is strongest) */
  weight?: number

  /** Optional flag indicating this is a surprising/unexpected connection */
  surprising?: boolean

  /** Optional metadata about the relationship */
  metadata?: Record<string, unknown>
}

/**
 * A community (module/domain) detected in the graph.
 * Groups related nodes that form a functional unit.
 */
export interface Community {
  /** Unique identifier for this community */
  id: string

  /** Human-readable label (e.g., "Auth Module") */
  label: string

  /** Node IDs that belong to this community */
  nodes: string[]

  /** Edges within this community (high density) */
  internal: GraphEdge[]

  /** Edges crossing community boundaries (lower density) */
  external: GraphEdge[]

  /** Optional: how tightly connected (0-1, higher = tighter) */
  density?: number
}

/**
 * Confidence scores for different types of information in the graph.
 * Helps understand how certain we are about different findings.
 */
export interface ConfidenceScore {
  /** Percentage (0-100) of information directly extracted from code */
  extracted: number

  /** Percentage (0-100) of information inferred from patterns */
  inferred: number

  /** Percentage (0-100) of information that's ambiguous/uncertain */
  ambiguous: number
}

/**
 * Complete knowledge graph from graphify.
 * This is the input we receive from the graphify CLI tool.
 */
export interface GraphifyGraph {
  /** All nodes in the graph */
  nodes: GraphNode[]

  /** All edges in the graph */
  edges: GraphEdge[]

  /** Optional communities detected by graphify */
  communities?: Community[]

  /** Optional confidence scores for different information types */
  confidence?: ConfidenceScore

  /** Optional metadata about the graph */
  metadata?: {
    version?: string
    createdAt?: number
    codebaseRoot?: string
    filesAnalyzed?: number
    [key: string]: unknown
  }
}

// ── Output: Computed Analysis ──────────────────────────────────────────────

/**
 * A node identified as a "god node" - central to many operations.
 * These are nodes that many other nodes depend on or connect through.
 */
export interface GodNode {
  /** Node ID */
  nodeId: string

  /** Human-readable label */
  label: string

  /** Number of nodes that depend on this (incoming edges) */
  inDegree: number

  /** Number of nodes this depends on (outgoing edges) */
  outDegree: number

  /** Betweenness centrality (0-1): how many shortest paths go through this */
  betweenness: number

  /** PageRank score (0-1): overall importance */
  pageRank: number

  /** Community this node belongs to */
  community: string

  /** How critical this node is */
  criticality: 'CRITICAL' | 'IMPORTANT' | 'NORMAL'
}

/**
 * Analysis of a detected community (module/domain).
 * Includes density metrics and interface identification.
 */
export interface CommunityAnalysis {
  /** Community ID */
  id: string

  /** Human-readable label */
  label: string

  /** Node IDs in this community */
  nodes: string[]

  /** How tightly connected (0-1, higher = tighter) */
  internalDensity: number

  /** Cross-community connection density (0-1) */
  externalDensity: number

  /** Nodes on the boundary (interface between communities) */
  interfaceNodes: string[]

  /** Critical nodes within this community */
  bottlenecks: string[]

  /** Optional: other metrics about community health */
  metrics?: {
    cohesion?: number
    coupling?: number
    [key: string]: unknown
  }
}

/**
 * A surprising connection found in the graph.
 * These are unexpected edges that reveal hidden patterns.
 */
export interface SurprisingConnection {
  /** Source node ID */
  source: string

  /** Target node ID */
  target: string

  /** Why this connection is surprising */
  reason: 'cross-community' | 'legacy' | 'circular' | 'hidden' | 'unexpected'

  /** How surprising (0-1, higher = more surprising) */
  confidence: number

  /** Optional explanation */
  explanation?: string
}

/**
 * A bottleneck node - critical for many paths.
 * If this node breaks, many parts of the codebase are affected.
 */
export interface Bottleneck {
  /** Node ID */
  nodeId: string

  /** Betweenness score (0-1): how critical as a path node */
  betweenness: number

  /** Impact analysis */
  impact: {
    /** Node IDs that would be affected if this changes */
    ifRemoved: string[]

    /** Number of shortest paths going through this node */
    pathsThrough: number

    /** Rough estimate of how many files depend on this */
    dependentCount: number
  }
}

/**
 * An anomaly detected in the graph.
 * Indicates potentially problematic patterns.
 */
export interface Anomaly {
  /** Type of anomaly */
  type: 'circular_dependency' | 'god_node_violation' | 'fragile_pattern' | 'bottleneck'

  /** Node IDs involved in this anomaly */
  nodes: string[]

  /** Severity level */
  severity: 'ERROR' | 'WARNING' | 'INFO'

  /** Human-readable description */
  description: string

  /** Optional suggestion for fixing */
  suggestion?: string
}

/**
 * A link between symbols (for Wikipedia entries).
 * Represents a reference from one symbol to another.
 */
export interface SymbolLink {
  /** The symbol being linked to (e.g., "src/auth.ts:authenticate") */
  symbol: string

  /** Type of relationship */
  relationship: 'calls' | 'uses' | 'imports' | 'extends' | 'implements'

  /** File where this relationship occurs */
  file: string

  /** Line number (if available) */
  line?: number
}

/**
 * Wikipedia-style entry for a symbol.
 * Combines graph information with navigational metadata.
 */
export interface WikipediaEntry {
  /** The node ID this entry represents */
  nodeId: string

  /** Title for display */
  title: string

  /** Brief summary of what this symbol does */
  summary: string

  /** Symbol type */
  type: string

  /** Symbols that reference this one */
  references: {
    inbound: SymbolLink[]
    outbound: SymbolLink[]
  }

  /** Graph-based metrics */
  metrics: {
    godNode: boolean
    centrality: number
    bottleneck: boolean
    community: string
  }

  /** Related symbols in the same module/community */
  relatedSymbols: string[]

  /** Any anomalies associated with this symbol */
  anomalies: Anomaly[]
}

/**
 * Query interface for Wikipedia entries.
 * Used to find symbols by various criteria.
 */
export interface WikipediaQueryParams {
  godNode?: boolean
  bottleneck?: boolean
  community?: string
  type?: string
  surprising?: boolean
  circular?: boolean
  limit?: number
  offset?: number
}

/**
 * Wikipedia index - queryable symbol encyclopedia.
 */
export interface WikipediaIndex {
  entries: Map<string, WikipediaEntry>
  query(params: WikipediaQueryParams): WikipediaEntry[]
  get(nodeId: string): WikipediaEntry | undefined
  find(predicate: (entry: WikipediaEntry) => boolean): WikipediaEntry[]
}

/**
 * Aggregate metrics about the graph.
 */
export interface GraphMetrics {
  totalNodes: number
  totalEdges: number
  godNodeCount: number
  communityCount: number
  averageDegree: number
  maxDegree: number
  graphDensity: number
  avgClusteringCoeff: number
  cycleCount: number
  bottleneckCount: number
}

/**
 * Complete analysis results from running graph algorithms.
 * This is what we compute from the graphify input and feed into pi-scope.
 */
export interface GraphifyAnalysis {
  /** God nodes detected via centrality analysis */
  godNodes: GodNode[]

  /** Communities detected via Louvain algorithm */
  communities: CommunityAnalysis[]

  /** Surprising connections found via edge analysis */
  surprises: SurprisingConnection[]

  /** Bottlenecks identified via betweenness centrality */
  bottlenecks: Bottleneck[]

  /** Anomalies detected (cycles, violations, etc.) */
  anomalies: Anomaly[]

  /** Queryable symbol encyclopedia */
  wikipedia: WikipediaIndex

  /** Aggregate metrics */
  metrics: GraphMetrics

  /** When this analysis was computed */
  computedAt: number

  /** Version of analysis format (for cache invalidation) */
  version: string
}

/**
 * Graph context injected into RepoIndex.
 * Extends pi-scope's existing RepoIndex with graph information.
 */
export interface GraphContext {
  graph: GraphifyGraph
  analysis: GraphifyAnalysis
  valid: boolean
  lastUpdated: number
  errors: string[]
}

/**
 * Result of graph validation.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Graph analysis plus actionable guidance for the intelligence system.
 */
export interface EnhancedGraphInsights extends GraphifyAnalysis {
  actionableGuidance: {
    workflowOptimization: string
    riskWarnings: string
    architecturalGuidance: string
    contextualSuggestions: string
  }
  intelligenceMetadata: {
    generatedAt: number
    conversationContext: ContextInsights
    guidanceVersion: string
  }
}

/**
 * Tunable limits for smart / enhanced context generation.
 */
export interface SmartContextConfig {
  maxToolHints: number
  riskWarningThreshold: number
  communityBoundaryStrict: boolean
  proactiveGuidance: boolean
}
