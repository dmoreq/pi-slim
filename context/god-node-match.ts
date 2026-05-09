/**
 * Shared god-node ↔ conversation symbol matching for smart context generators.
 * Keeps dependency context and repo-map prioritization aligned.
 */

import type { GodNode } from './graph-types.js'

export function godNodeMatchesSymbol(godNode: GodNode, symbol: string): boolean {
  const symbolLower = symbol.toLowerCase()
  const nodeIdLower = godNode.nodeId.toLowerCase()
  const labelLower = godNode.label.toLowerCase()

  if (symbolLower === nodeIdLower || symbolLower === labelLower) {
    return true
  }

  if (symbol.length >= 4) {
    return nodeIdLower.includes(symbolLower) || labelLower.includes(symbolLower)
  }

  return false
}
