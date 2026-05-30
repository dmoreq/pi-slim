/**
 * Steer risky edits on CRITICAL god nodes toward LSP impact tools first.
 */

import { godNodeMatchesSymbol } from '../context/god-node-match.js'
import type { GraphAnalysis } from '../context/graph-types.js'
import type { SessionState } from '../manager.js'
import type { Plugin, PluginToolCallResult } from './plugin.js'

const EDIT_TOOLS = new Set(['hashline_edit', 'edit', 'write', 'search_replace', 'str_replace', 'apply_patch'])
const LSP_IMPACT_TOOLS = new Set(['lsp_find_references', 'lsp_hover', 'graph_symbol_impact'])

function recentTools(state: SessionState, limit = 12): string[] {
  return state.recentToolNames.slice(-limit)
}

function hasRecentLspImpact(state: SessionState): boolean {
  return recentTools(state).some(t => LSP_IMPACT_TOOLS.has(t))
}

function criticalGodForSymbols(analysis: GraphAnalysis, symbols: string[]): boolean {
  if (symbols.length === 0) return false
  return analysis.godNodes.some(
    gn => gn.criticality === 'CRITICAL' && symbols.some(sym => godNodeMatchesSymbol(gn, sym))
  )
}

export class GraphSteerPlugin implements Plugin {
  readonly name = 'graph-steer'
  readonly version = '1.0.0'

  constructor(
    private readonly getState: () => SessionState | null,
    private readonly getGraph: () => GraphAnalysis | null,
    private readonly getAffectedSymbols: () => string[],
    private readonly onUserNotify?: (msg: string) => void
  ) {}

  async onToolCall(event: {
    toolName: string
    input: Record<string, unknown> | undefined
  }): Promise<PluginToolCallResult | undefined> {
    const state = this.getState()
    if (!state?.config.graph.enabled || !state.config.graph.steerOnCriticalGodNode) {
      return undefined
    }

    const tool = event.toolName.toLowerCase()
    if (!EDIT_TOOLS.has(tool)) return undefined

    const graph = this.getGraph()
    const symbols = this.getAffectedSymbols()
    if (!graph || !criticalGodForSymbols(graph, symbols)) return undefined
    if (hasRecentLspImpact(state)) return undefined

    const reason =
      'Target symbol is a CRITICAL god node — run `lsp_find_references` and `lsp_hover` (or `graph_symbol_impact`) before editing.'

    state.stats.recordGraphSteer()

    const symbolNames = symbols.slice(0, 2).join(', ')
    const godNode = graph.godNodes.find(
      gn => gn.criticality === 'CRITICAL' && symbols.some(sym => godNodeMatchesSymbol(gn, sym))
    )
    const depLabel = godNode ? ` (${godNode.inDegree} dependents)` : ''
    this.onUserNotify?.(
      `🛡 Guiding AI to check impact before editing CRITICAL symbol \`${symbolNames}\`${depLabel}`
    )

    if (state.config.graph.strictGraphImpact) {
      return { allowed: false, reason }
    }

    return { allowed: true, reason }
  }
}
