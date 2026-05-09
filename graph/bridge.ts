/**
 * RepoIndex → GraphifyGraph Bridge
 *
 * Converts pi-scope's file-level RepoIndex into the symbol-level GraphifyGraph
 * format that all 5 graph algorithms expect. This lets the native TypeScript
 * graph engine run without requiring the external `graphify` tool.
 *
 * Strategy:
 *   - Each file becomes a "module" node
 *   - Each exported symbol becomes a separate node (file:symbol)
 *   - Import edges become file→file "imports" edges
 *   - Export names become file→symbol "depends_on" edges
 *   - Reverse deps are derived
 *
 * @module
 */

import type { RepoIndex } from '../shared/types.js'
import type { GraphifyGraph, GraphNode, GraphEdge } from '../context/graph-types.js'

/**
 * Convert a RepoIndex (from AST parsing) into a GraphifyGraph.
 *
 * @param index  The parsed RepoIndex from IndexEngine
 * @param projectRoot  Project root for generating relative labels
 * @returns A GraphifyGraph compatible with all 5 graph algorithms
 */
export function repoIndexToGraphifyGraph(
  index: RepoIndex,
  projectRoot: string,
): GraphifyGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()
  const fileNodeIds = new Map<string, string>()  // absPath → nodeId

  // Phase 1: Create file-level module nodes
  for (const absPath of index.skeletons.keys()) {
    const fileId = fileNodeId(absPath, projectRoot)
    nodes.push({
      id: fileId,
      type: 'module',
      label: fileLabel(absPath, projectRoot),
      description: undefined,
    })
    nodeIds.add(fileId)
    fileNodeIds.set(absPath, fileId)
  }

  // Phase 2: Create symbol-level nodes from exports
  for (const [absPath, symbols] of index.symbolIndex) {
    const fileId = fileNodeId(absPath, projectRoot)
    for (const sym of symbols) {
      const symId = `${fileId}:${sym}`
      // Skip duplicates (same symbol exported from multiple paths gets one node per file)
      if (nodeIds.has(symId)) continue
      nodeIds.add(symId)

      nodes.push({
        id: symId,
        type: inferSymbolType(sym),
        label: sym,
        description: undefined,
      })

      // Edge: file → symbol (owns/exports this symbol)
      edges.push({
        source: fileId,
        target: symId,
        type: 'depends_on',
        weight: 1,
      })
    }
  }

  // Phase 3: Import edges between files
  const processedEdges = new Set<string>()
  for (const [absPath, deps] of index.deps) {
    const srcFileId = fileNodeId(absPath, projectRoot)
    if (!srcFileId) continue

    for (const depPath of deps) {
      const tgtFileId = fileNodeId(depPath, projectRoot)
      if (!tgtFileId) continue

      const edgeKey = `${srcFileId}→${tgtFileId}`
      if (processedEdges.has(edgeKey)) continue
      processedEdges.add(edgeKey)

      edges.push({
        source: srcFileId,
        target: tgtFileId,
        type: 'imports',
        weight: 1,
      })

      // Also add file→symbol edges for all exports of the target file
      const targetSymbols = index.symbolIndex.get(depPath) ?? []
      for (const sym of targetSymbols) {
        const symId = `${tgtFileId}:${sym}`
        if (!nodeIds.has(symId)) {
          nodeIds.add(symId)
          nodes.push({
            id: symId,
            type: inferSymbolType(sym),
            label: sym,
          })
          // file → symbol edge
          edges.push({
            source: tgtFileId,
            target: symId,
            type: 'depends_on',
            weight: 1,
          })
        }
        // Edge: importer → imported symbol
        const symEdgeKey = `${srcFileId}→${symId}`
        if (!processedEdges.has(symEdgeKey)) {
          processedEdges.add(symEdgeKey)
          edges.push({
            source: srcFileId,
            target: symId,
            type: 'uses',
            weight: 0.8,
          })
        }
      }
    }
  }

  // Phase 4: Reverse edges — symbol → file (for algorithms that traverse in reverse)
  for (const [absPath, symbols] of index.symbolIndex) {
    const fileId = fileNodeId(absPath, projectRoot)
    for (const sym of symbols) {
      const symId = `${fileId}:${sym}`
      if (!nodeIds.has(symId)) continue
      // Symbol → file ownership is already handled above (depends_on)
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      version: '1.0.0',
      createdAt: Date.now(),
      filesAnalyzed: index.skeletons.size,
    },
  }
}

/**
 * Get the broader overview graph (file-level only, no symbol expansion).
 * More compact for large codebases; still powers all algorithms.
 */
export function repoIndexToFileGraph(
  index: RepoIndex,
  projectRoot: string,
): GraphifyGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const processedEdges = new Set<string>()
  const fileToId = new Map<string, string>()

  for (const absPath of index.skeletons.keys()) {
    const id = fileNodeId(absPath, projectRoot)
    fileToId.set(absPath, id)
    nodes.push({
      id,
      type: 'module',
      label: fileLabel(absPath, projectRoot),
    })
  }

  for (const [absPath, deps] of index.deps) {
    const src = fileToId.get(absPath)
    if (!src) continue
    for (const depPath of deps) {
      const tgt = fileToId.get(depPath)
      if (!tgt) continue
      const key = `${src}→${tgt}`
      if (processedEdges.has(key)) continue
      processedEdges.add(key)
      edges.push({ source: src, target: tgt, type: 'imports', weight: 1 })
    }
  }

  return { nodes, edges, metadata: { version: '1.0.0', createdAt: Date.now(), filesAnalyzed: index.skeletons.size } }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fileNodeId(absPath: string, projectRoot: string): string {
  const rel = absPath.startsWith(projectRoot)
    ? absPath.slice(projectRoot.length + 1)
    : absPath
  return `file:${rel}`
}

function fileLabel(absPath: string, projectRoot: string): string {
  return absPath.startsWith(projectRoot)
    ? absPath.slice(projectRoot.length + 1)
    : absPath
}

function inferSymbolType(name: string): 'function' | 'class' | 'interface' | 'variable' {
  if (/^[A-Z]/.test(name) && !name.includes('_')) return 'class'
  if (/^I[A-Z]/.test(name)) return 'interface'
  if (/^[a-z]/.test(name) || name.includes('_')) return 'function'
  return 'variable'
}
