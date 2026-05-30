/**
 * graph_symbol_impact — graph-only blast-radius lookup (no LSP required).
 */

import { relative, resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'
import { enhanceHoverWithGraphMetrics, formatHoverAsMarkdown } from '../context/graph-lsp-hover.js'
import { resolveGraphLookup } from '../context/graph-lsp-resolve.js'
import type { GraphAnalysis } from '../context/graph-types.js'

let currentAnalysis: GraphAnalysis | null = null

export function setGraphImpactAnalysis(a: GraphAnalysis | null): void {
  currentAnalysis = a
}

function ctxDir(ctx: unknown): string {
  return (ctx as { cwd?: string })?.cwd ?? process.cwd()
}

const graphImpactTool = defineTool({
  name: 'graph_symbol_impact',
  label: 'Graph symbol impact',
  description:
    'Show graph-derived impact for a symbol (god node status, dependents, community) without LSP.',
  parameters: Type.Object({
    path: Type.String({ description: 'File path relative to project root' }),
    symbol: Type.Optional(Type.String({ description: 'Symbol name (class, function, etc.)' })),
  }),
  async execute(
    _toolCallId: string,
    args: { path: string; symbol?: string },
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: unknown
  ) {
    const analysis = currentAnalysis
    if (!analysis) {
      return {
        content: [{ type: 'text' as const, text: 'No graph analysis loaded for this session.' }],
        details: { ok: false },
      }
    }

    const cwd = ctxDir(ctx)
    const abs = resolve(cwd, args.path)
    const rel = relative(cwd, abs).replace(/\\/g, '/')
    const symbol = (args.symbol ?? rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'unknown').trim()
    const resolved = resolveGraphLookup(rel, symbol, analysis)
    const lookupSymbol = resolved.nodeId?.split(':').pop() ?? symbol

    const hover = enhanceHoverWithGraphMetrics(
      lookupSymbol,
      `(graph lookup: ${resolved.lookupKey})`,
      analysis,
      rel
    )

    const md = formatHoverAsMarkdown(hover)
    return {
      content: [{ type: 'text' as const, text: md }],
      details: { ok: true, lookupKey: resolved.lookupKey },
    }
  },
})

export function registerGraphImpactTool(pi: ExtensionAPI): void {
  pi.registerTool(graphImpactTool as unknown as Parameters<ExtensionAPI['registerTool']>[0])
}

export default graphImpactTool
