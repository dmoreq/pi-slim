/**
 * Shared parsing and matching for pi-scope graph node IDs (`file:path` / `file:path:Symbol`).
 */

import type { GodNode } from './graph-types.js'

/** Parsed `file:` node id from {@link repoIndexToCodeGraph}. */
export interface ParsedGraphNodeId {
  pathPart: string
  symbolPart?: string
}

/**
 * Parse `file:relative/path.ts` or `file:relative/path.ts:SymbolName`.
 */
export function parseGraphNodeId(nodeId: string): ParsedGraphNodeId {
  if (!nodeId.startsWith('file:')) {
    return { pathPart: nodeId }
  }
  const rest = nodeId.slice(5)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon < 0) {
    return { pathPart: rest }
  }
  const after = rest.slice(lastColon + 1)
  if (!after.includes('/') && !after.includes('.')) {
    return { pathPart: rest.slice(0, lastColon), symbolPart: after }
  }
  return { pathPart: rest }
}

export function basenameFromNodeId(nodeId: string): string {
  const { pathPart } = parseGraphNodeId(nodeId)
  return pathPart.split('/').pop() ?? pathPart
}

export function symbolFromNodeId(nodeId: string): string | undefined {
  return parseGraphNodeId(nodeId).symbolPart
}

/** Lowercase alphanumeric key used for fuzzy graph node matching. */
export function normalizeNodeIdForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * True when a project-relative file path corresponds to this god node (file or symbol node).
 */
export function godNodeMatchesFilePath(relPath: string, godNode: GodNode): boolean {
  const rel = relPath.replace(/\\/g, '/').toLowerCase()
  const stem = rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  const parsed = parseGraphNodeId(godNode.nodeId)
  const pathLower = parsed.pathPart.toLowerCase()
  const labelLower = godNode.label.toLowerCase()

  if (parsed.symbolPart) {
    const sym = parsed.symbolPart.toLowerCase()
    if (stem === sym || labelLower === sym) {
      return rel === pathLower || rel.endsWith(`/${pathLower}`)
    }
    return false
  }
  return rel === pathLower || rel.endsWith(`/${pathLower}`)
}

/**
 * Extract a symbol identifier from LSP hover markdown/plain text.
 */
export function extractSymbolFromHoverText(hoverText: string): string | null {
  const lines = hoverText.split('\n').map(l => l.trim()).filter(Boolean)
  const patterns = [
    /^\(method\)\s+([\w$]+)/i,
    /^(?:async\s+)?function\s+([\w$]+)/i,
    /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/i,
    /^(?:export\s+)?class\s+([\w$]+)/i,
    /^(?:export\s+)?interface\s+([\w$]+)/i,
    /^(?:export\s+)?type\s+([\w$]+)/i,
    /^(?:export\s+)?enum\s+([\w$]+)/i,
    /^(?:export\s+)?const\s+([\w$]+)/i,
    /^(?:export\s+)?let\s+([\w$]+)/i,
    /^(?:export\s+)?var\s+([\w$]+)/i,
    /^\(property\)\s+([\w$]+)/i,
    /^\(variable\)\s+([\w$]+)/i,
  ]
  for (const line of lines) {
    for (const re of patterns) {
      const m = line.match(re)
      if (m?.[1]) return m[1]
    }
  }
  return null
}

/**
 * Resolve the best lookup key for graph enrichment (symbol-first, then file stem).
 */
export function resolveGraphLookupKey(
  symbolHint: string,
  relativeFilePath: string | undefined
): string {
  const fromHover = symbolHint.trim()
  if (fromHover && fromHover.length > 0) {
    return fromHover
  }
  if (relativeFilePath) {
    return relativeFilePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? relativeFilePath
  }
  return symbolHint
}
