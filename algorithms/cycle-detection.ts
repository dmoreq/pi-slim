/**
 * Cycle Detection Algorithms
 *
 * Detects circular dependencies in code graphs using multiple algorithms:
 * - DFS-based cycle detection (finds actual cycles)
 * - Strongly Connected Components (Tarjan's algorithm)
 * - Weakly Connected Components
 * - Anomaly detection for problematic patterns
 */

import type { GraphifyGraph } from '../context/graphify-types.js'

/**
 * Represents a cycle in the graph.
 */
export interface Cycle {
  id: string
  nodes: string[]
  edges: Array<[string, string]>
  length: number
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation: string
}

/**
 * Strongly connected component (cycles).
 */
export interface StronglyConnectedComponent {
  id: string
  nodes: string[]
  size: number
  isCycle: boolean
  density: number
}

/**
 * Cycle detection result.
 */
export interface CycleDetectionResult {
  hasCycles: boolean
  cycleCount: number
  totalNodesInCycles: number
  cycles: Cycle[]
  strongComponents: StronglyConnectedComponent[]
  anomalies: Anomaly[]
}

/**
 * Anomaly in the dependency graph.
 */
export interface Anomaly {
  type: 'circular' | 'crossLayer' | 'highCoupling' | 'orphan'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  affectedNodes: string[]
  description: string
  recommendation: string
}

/**
 * Detect all cycles in a graph using DFS.
 *
 * Time Complexity: O(n + m) for DFS
 * Space Complexity: O(n) for visited tracking
 *
 * @param graph The dependency graph
 * @returns Cycle detection result
 */
export function detectAllCycles(graph: GraphifyGraph): CycleDetectionResult {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const cycles: Cycle[] = []
  const anomalies: Anomaly[] = []

  // Build adjacency list
  const adj = new Map<string, string[]>()
  for (const node of graph.nodes) {
    adj.set(node.id, [])
  }
  for (const edge of graph.edges) {
    adj.get(edge.source)?.push(edge.target)
  }

  // DFS-based cycle detection
  const path: string[] = []
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      detectCyclesDFS(node.id, adj, visited, recursionStack, path, cycles, graph)
    }
  }

  // Detect strongly connected components (SCCs)
  const sccs = detectStronglyConnectedComponents(graph)

  // Find anomalies
  anomalies.push(...detectAnomalies(cycles, sccs, graph))

  // Calculate statistics
  const cycleNodes = new Set<string>()
  cycles.forEach((c) => c.nodes.forEach((n) => cycleNodes.add(n)))

  return {
    hasCycles: cycles.length > 0,
    cycleCount: cycles.length,
    totalNodesInCycles: cycleNodes.size,
    cycles: cycles.slice(0, 50),  // Limit to 50 cycles
    strongComponents: sccs,
    anomalies
  }
}

/**
 * Detect cycles using DFS recursion.
 *
 * @param node Current node
 * @param adj Adjacency list
 * @param visited Global visited set
 * @param recursionStack Current recursion stack
 * @param path Current path
 * @param cycles Found cycles
 * @param graph Original graph
 */
function detectCyclesDFS(
  node: string,
  adj: Map<string, string[]>,
  visited: Set<string>,
  recursionStack: Set<string>,
  path: string[],
  cycles: Cycle[],
  graph: GraphifyGraph
): void {
  visited.add(node)
  recursionStack.add(node)
  path.push(node)

  const neighbors = adj.get(node) || []

  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      detectCyclesDFS(neighbor, adj, visited, recursionStack, path, cycles, graph)
    } else if (recursionStack.has(neighbor)) {
      // Found a cycle
      const cycleStart = path.indexOf(neighbor)
      const cyclePath = path.slice(cycleStart).concat([neighbor])
      const cycleEdges = getCycleEdges(cyclePath, graph)

      cycles.push({
        id: `cycle-${cycles.length}`,
        nodes: cyclePath.slice(0, -1),
        edges: cycleEdges,
        length: cyclePath.length - 1,
        severity: determineCycleSeverity(cyclePath.length - 1),
        recommendation: getCycleRecommendation(cyclePath.length - 1)
      })
    }
  }

  path.pop()
  recursionStack.delete(node)
}

/**
 * Extract cycle edges from path.
 *
 * @param path Node path forming cycle
 * @param graph Graph data
 * @returns Array of edges
 */
function getCycleEdges(path: string[], graph: GraphifyGraph): Array<[string, string]> {
  const edges: Array<[string, string]> = []

  for (let i = 0; i < path.length - 1; i++) {
    edges.push([path[i], path[i + 1]])
  }

  return edges
}

/**
 * Determine cycle severity based on length.
 *
 * @param length Cycle length
 * @returns Severity level
 */
function determineCycleSeverity(length: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (length === 2) {
    return 'CRITICAL'  // Direct circular dependency
  }
  if (length <= 4) {
    return 'HIGH'
  }
  if (length <= 8) {
    return 'MEDIUM'
  }
  return 'LOW'
}

/**
 * Get recommendation for breaking a cycle.
 *
 * @param length Cycle length
 * @returns Recommendation string
 */
function getCycleRecommendation(length: number): string {
  if (length === 2) {
    return 'Direct circular dependency. One module must be split or refactored.'
  }
  if (length <= 4) {
    return 'Short circular chain. Consider extracting shared logic to a separate module.'
  }
  if (length <= 8) {
    return 'Moderate cycle detected. Review architecture and consider dependency inversion.'
  }
  return 'Long circular chain. Significant refactoring may be needed.'
}

/**
 * Detect strongly connected components using Tarjan's algorithm.
 *
 * Time Complexity: O(n + m)
 * Space Complexity: O(n)
 *
 * @param graph The graph
 * @returns Array of strongly connected components
 */
export function detectStronglyConnectedComponents(
  graph: GraphifyGraph
): StronglyConnectedComponent[] {
  const index = new Map<string, number>()
  const lowLink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccs: StronglyConnectedComponent[] = []
  let indexCounter = 0

  // Build adjacency
  const adj = new Map<string, string[]>()
  for (const node of graph.nodes) {
    adj.set(node.id, [])
  }
  for (const edge of graph.edges) {
    adj.get(edge.source)?.push(edge.target)
  }

  function strongConnect(node: string) {
    index.set(node, indexCounter)
    lowLink.set(node, indexCounter)
    indexCounter++
    stack.push(node)
    onStack.add(node)

    const neighbors = adj.get(node) || []
    for (const neighbor of neighbors) {
      if (!index.has(neighbor)) {
        strongConnect(neighbor)
        lowLink.set(node, Math.min(lowLink.get(node) ?? Infinity, lowLink.get(neighbor) ?? Infinity))
      } else if (onStack.has(neighbor)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? Infinity, index.get(neighbor) ?? Infinity))
      }
    }

    if (lowLink.get(node) === index.get(node)) {
      const component: string[] = []
      while (true) {
        const popped = stack.pop()!
        onStack.delete(popped)
        component.push(popped)
        if (popped === node) break
      }

      if (component.length > 1) {
        const density = computeComponentDensity(component, graph)
        sccs.push({
          id: `scc-${sccs.length}`,
          nodes: component,
          size: component.length,
          isCycle: component.length > 1,
          density
        })
      }
    }
  }

  for (const node of graph.nodes) {
    if (!index.has(node.id)) {
      strongConnect(node.id)
    }
  }

  return sccs
}

/**
 * Compute density of a component.
 *
 * @param nodes Component nodes
 * @param graph Graph data
 * @returns Density (0-1)
 */
function computeComponentDensity(nodes: string[], graph: GraphifyGraph): number {
  const nodeSet = new Set(nodes)
  let edges = 0

  for (const edge of graph.edges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      edges++
    }
  }

  const maxEdges = nodes.length * (nodes.length - 1)
  return maxEdges > 0 ? edges / maxEdges : 0
}

/**
 * Detect anomalies in the dependency graph.
 *
 * @param cycles Detected cycles
 * @param sccs Strongly connected components
 * @param graph Graph data
 * @returns Array of anomalies
 */
function detectAnomalies(
  cycles: Cycle[],
  sccs: StronglyConnectedComponent[],
  graph: GraphifyGraph
): Anomaly[] {
  const anomalies: Anomaly[] = []

  // Circular dependency anomalies
  if (cycles.length > 0) {
    const nodesInCycles = new Set<string>()
    cycles.forEach((c) => c.nodes.forEach((n) => nodesInCycles.add(n)))

    anomalies.push({
      type: 'circular',
      severity: cycles.some((c) => c.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
      affectedNodes: Array.from(nodesInCycles),
      description: `${cycles.length} circular dependencies detected`,
      recommendation: 'Break cycles by extracting shared dependencies or inverting dependencies'
    })
  }

  // High coupling anomalies
  const highCouplingNodes = detectHighCoupling(graph)
  if (highCouplingNodes.length > 0) {
    anomalies.push({
      type: 'highCoupling',
      severity: 'MEDIUM',
      affectedNodes: highCouplingNodes,
      description: `${highCouplingNodes.length} nodes have excessive coupling`,
      recommendation: 'Consider modularizing or extracting interfaces'
    })
  }

  // Orphan nodes (isolated components)
  const orphanNodes = detectOrphans(graph)
  if (orphanNodes.length > 0) {
    anomalies.push({
      type: 'orphan',
      severity: 'LOW',
      affectedNodes: orphanNodes,
      description: `${orphanNodes.length} isolated nodes detected`,
      recommendation: 'Review if these should be integrated or removed'
    })
  }

  return anomalies
}

/**
 * Detect nodes with high coupling.
 *
 * @param graph Graph data
 * @returns Nodes with >10 connections
 */
function detectHighCoupling(graph: GraphifyGraph): string[] {
  const coupling = new Map<string, number>()

  for (const edge of graph.edges) {
    coupling.set(edge.source, (coupling.get(edge.source) ?? 0) + 1)
    coupling.set(edge.target, (coupling.get(edge.target) ?? 0) + 1)
  }

  return Array.from(coupling.entries())
    .filter(([_, count]) => count > 10)
    .map(([node, _]) => node)
}

/**
 * Detect orphan nodes (no connections).
 *
 * @param graph Graph data
 * @returns Orphan node IDs
 */
function detectOrphans(graph: GraphifyGraph): string[] {
  const connected = new Set<string>()

  for (const edge of graph.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }

  return graph.nodes
    .map((n) => n.id)
    .filter((id) => !connected.has(id))
}

/**
 * Get cycle detection summary.
 *
 * @param result Cycle detection result
 * @returns Summary string
 */
export function getCycleDetectionSummary(result: CycleDetectionResult): string {
  const lines: string[] = [
    'Cycle Detection Report',
    '='.repeat(40),
    `Has Cycles: ${result.hasCycles ? 'YES' : 'NO'}`,
    `Total Cycles: ${result.cycleCount}`,
    `Nodes in Cycles: ${result.totalNodesInCycles}`,
    `Strongly Connected Components: ${result.strongComponents.length}`
  ]

  if (result.cycleCount > 0) {
    lines.push('')
    lines.push('Top Cycles:')
    result.cycles.slice(0, 5).forEach((c, i) => {
      lines.push(`  ${i + 1}. [${c.severity}] Length ${c.length}: ${c.nodes.join(' → ')}`)
    })
  }

  if (result.anomalies.length > 0) {
    lines.push('')
    lines.push(`Anomalies Detected: ${result.anomalies.length}`)
    result.anomalies.slice(0, 3).forEach((a) => {
      lines.push(`  • [${a.severity}] ${a.type}: ${a.description}`)
    })
  }

  return lines.join('\n')
}
