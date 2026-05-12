/**
 * LSP Navigation Tools — go-to-definition, find-references, hover info.
 *
 * Registers three tools that use LSP for code intelligence.
 * LSP servers are started lazily and shut down at session end.
 *
 * @module
 */

import { resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'
import { enhanceHoverWithGraphMetrics, formatHoverAsMarkdown } from '../context/graph-lsp-hover.js'
import type { GraphifyAnalysis } from '../context/graph-types.js'
import { LspNavigationService } from '../lsp/service.js'

// Module-level cache of current graph analysis, set by SessionManager.
let currentAnalysis: GraphifyAnalysis | null = null

/**
 * Set the current graph analysis for hover tool enrichment.
 * Called by SessionManager when graph data is loaded/unloaded.
 */
export function setLspGraphAnalysis(a: GraphifyAnalysis | null): void {
  currentAnalysis = a
}

let service: LspNavigationService | null = null

function getService(): LspNavigationService {
  if (!service) service = new LspNavigationService()
  return service
}

export async function shutdownLsp(): Promise<void> {
  if (service) {
    await service.shutdown()
    service = null
  }
}

// ── Common helpers ───────────────────────────────────────────────────────

const fpParams = Type.Object({
  path: Type.String({ description: 'File path (relative to cwd or absolute)' }),
  line: Type.Integer({ description: 'Line number (0-indexed)' }),
  column: Type.Integer({ description: 'Column number (0-indexed)' }),
})

function ctxDir(ctx: unknown): string {
  return (ctx as { cwd?: string })?.cwd ?? process.cwd()
}

// ── Tool: goToDefinition ─────────────────────────────────────────────────

const goToDefTool = defineTool({
  name: 'lsp_go_to_definition',
  label: 'Go to Definition',
  description: 'Find the definition of a symbol at a specific file position using LSP.',
  parameters: fpParams,
  async execute(
    _tid: string,
    p: { path: string; line: number; column: number },
    _sig: AbortSignal | undefined,
    _upd: unknown,
    ctx: unknown
  ) {
    try {
      const fp = resolve(ctxDir(ctx), p.path)
      const result = await getService().goToDefinition(fp, p.line, p.column, ctxDir(ctx))
      return { content: [{ type: 'text' as const, text: result }], details: { ok: true } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `LSP error: ${message}` }],
        details: { ok: false },
      }
    }
  },
})

// ── Tool: findReferences ─────────────────────────────────────────────────

const findRefsTool = defineTool({
  name: 'lsp_find_references',
  label: 'Find References',
  description: 'Find all references to a symbol at a specific file position using LSP.',
  parameters: fpParams,
  async execute(
    _tid: string,
    p: { path: string; line: number; column: number },
    _sig: AbortSignal | undefined,
    _upd: unknown,
    ctx: unknown
  ) {
    try {
      const fp = resolve(ctxDir(ctx), p.path)
      const result = await getService().findReferences(fp, p.line, p.column, ctxDir(ctx))
      return { content: [{ type: 'text' as const, text: result }], details: { ok: true } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `LSP error: ${message}` }],
        details: { ok: false },
      }
    }
  },
})

// ── Tool: hoverInfo ──────────────────────────────────────────────────────

/** Extract a symbol name from file path + line/column — crude but sufficient for graph matching. */
function symbolFromPosition(fp: string, _line: number, _column: number): string {
  // Use the filename stem as the symbol hint (LSP hover text has the actual symbol name)
  const name =
    fp
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? ''
  return name
}

const hoverTool = defineTool({
  name: 'lsp_hover',
  label: 'Hover Info',
  description:
    'Get type information and documentation at a cursor position using LSP. Enriched with graph metrics when available.',
  parameters: fpParams,
  async execute(
    _tid: string,
    p: { path: string; line: number; column: number },
    _sig: AbortSignal | undefined,
    _upd: unknown,
    ctx: unknown
  ) {
    try {
      const fp = resolve(ctxDir(ctx), p.path)
      const result = await getService().hoverInfo(fp, p.line, p.column, ctxDir(ctx))

      // Enrich with graph metrics if analysis data is available
      if (currentAnalysis && result && !result.startsWith('No hover info')) {
        const symbol = symbolFromPosition(fp, p.line, p.column)
        const enhanced = enhanceHoverWithGraphMetrics(symbol, result, currentAnalysis)
        const markdown = formatHoverAsMarkdown(enhanced)
        return { content: [{ type: 'text' as const, text: markdown }], details: { ok: true } }
      }

      return { content: [{ type: 'text' as const, text: result }], details: { ok: true } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `LSP error: ${message}` }],
        details: { ok: false },
      }
    }
  },
})

// ── Registration ─────────────────────────────────────────────────────────

export function registerLspTools(pi: ExtensionAPI): void {
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(goToDefTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(findRefsTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(hoverTool)
}

export default registerLspTools
