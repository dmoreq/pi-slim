/**
 * Graphify Graph Loader
 *
 * Loads and validates graphify's graph.json file.
 * Provides error handling and graceful fallback.
 */

import fs from 'fs'
import path from 'path'
import type { GraphifyGraph, ValidationResult } from './graphify-types.js'
import {
  validateGraphSchema,
  isValidGraphifyGraph,
  formatValidationErrors
} from './graphify-schema.js'

/**
 * Result of attempting to load a graph file.
 */
export interface LoadResult {
  success: boolean
  graph?: GraphifyGraph
  error?: string
  warnings: string[]
}

/**
 * Load graphify's graph.json from a file path.
 *
 * @param filePath Path to graph.json (absolute or relative to cwd)
 * @returns LoadResult with graph or error details
 */
export async function loadGraphifyJson(filePath: string): Promise<LoadResult> {
  const warnings: string[] = []

  try {
    // ── Resolve path ───────────────────────────────────────────────────────

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath)

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: `Graph file not found: ${absolutePath}`,
        warnings
      }
    }

    // ── Read file ──────────────────────────────────────────────────────────

    const content = await fs.promises.readFile(absolutePath, 'utf-8')

    let graph: unknown

    try {
      graph = JSON.parse(content)
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
        warnings
      }
    }

    // ── Validate schema ────────────────────────────────────────────────────

    const validation = validateGraphSchema(graph)

    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings)
    }

    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid graph structure:\n${formatValidationErrors(validation)}`,
        warnings
      }
    }

    // ── Final type check ───────────────────────────────────────────────────

    if (!isValidGraphifyGraph(graph)) {
      return {
        success: false,
        error: 'Graph does not conform to GraphifyGraph interface',
        warnings
      }
    }

    return {
      success: true,
      graph,
      warnings
    }
  } catch (e) {
    return {
      success: false,
      error: `Error loading graph: ${e instanceof Error ? e.message : String(e)}`,
      warnings
    }
  }
}

/**
 * Load graph from default locations.
 * Tries multiple common paths.
 *
 * @returns LoadResult with graph or error
 */
export async function loadGraphifyJsonFromDefaults(): Promise<LoadResult> {
  const defaultPaths = [
    'graphify-out/graph.json',
    './graphify-out/graph.json',
    '../graphify-out/graph.json',
    'graph.json',
    './graph.json'
  ]

  for (const filePath of defaultPaths) {
    const result = await loadGraphifyJson(filePath)

    if (result.success) {
      return result
    }
  }

  return {
    success: false,
    error: `Could not find graph.json in any default location: ${defaultPaths.join(', ')}`,
    warnings: []
  }
}

/**
 * Load graph synchronously (for compatibility).
 * Note: Generally prefer async version.
 *
 * @param filePath Path to graph.json
 * @returns LoadResult with graph or error
 */
export function loadGraphifyJsonSync(filePath: string): LoadResult {
  const warnings: string[] = []

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath)

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: `Graph file not found: ${absolutePath}`,
        warnings
      }
    }

    const content = fs.readFileSync(absolutePath, 'utf-8')

    let graph: unknown

    try {
      graph = JSON.parse(content)
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
        warnings
      }
    }

    const validation = validateGraphSchema(graph)

    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings)
    }

    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid graph structure:\n${formatValidationErrors(validation)}`,
        warnings
      }
    }

    if (!isValidGraphifyGraph(graph)) {
      return {
        success: false,
        error: 'Graph does not conform to GraphifyGraph interface',
        warnings
      }
    }

    return {
      success: true,
      graph,
      warnings
    }
  } catch (e) {
    return {
      success: false,
      error: `Error loading graph: ${e instanceof Error ? e.message : String(e)}`,
      warnings
    }
  }
}

/**
 * Write a GraphifyGraph to a file (for testing/caching).
 *
 * @param graph The graph to write
 * @param filePath Where to write it
 */
export async function saveGraphifyJson(
  graph: GraphifyGraph,
  filePath: string
): Promise<boolean> {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath)

    const dir = path.dirname(absolutePath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    await fs.promises.writeFile(absolutePath, JSON.stringify(graph, null, 2))

    return true
  } catch (e) {
    console.error('Failed to save graph:', e)
    return false
  }
}

/**
 * Get basic statistics about a graph.
 *
 * @param graph The graph to analyze
 * @returns Basic stats
 */
export function getGraphStats(graph: GraphifyGraph): {
  nodeCount: number
  edgeCount: number
  nodeTypes: Record<string, number>
  edgeTypes: Record<string, number>
  avgDegree: number
  density: number
} {
  const nodeCount = graph.nodes.length
  const edgeCount = graph.edges.length

  // Count node types
  const nodeTypes: Record<string, number> = {}
  for (const node of graph.nodes) {
    nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1
  }

  // Count edge types
  const edgeTypes: Record<string, number> = {}
  for (const edge of graph.edges) {
    edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1
  }

  // Calculate metrics
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0
  const maxPossibleEdges = nodeCount * (nodeCount - 1)
  const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0

  return {
    nodeCount,
    edgeCount,
    nodeTypes,
    edgeTypes,
    avgDegree,
    density
  }
}
