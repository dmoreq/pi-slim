/**
 * LSP Navigation Tools — go-to-definition, find-references, hover info.
 *
 * Registers three tools that use LSP for code intelligence.
 * LSP servers are started lazily and shut down at session end.
 *
 * @module
 */

import { relative, resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'
import { extractSymbolFromHoverText, resolveGraphLookupKey } from '../context/graph-node-id.js'
import { enhanceHoverWithGraphMetrics, formatHoverAsMarkdown } from '../context/graph-lsp-hover.js'
import type { GraphAnalysis } from '../context/graph-types.js'
import { appendHashlineHoverSection, setHashlineHoverEnabled } from '../hashline/lsp-hover-anchor.js'
import { LspNavigationService } from '../lsp/service.js'

// Module-level cache of current graph analysis, set by SessionManager.
let currentAnalysis: GraphAnalysis | null = null

/**
 * Set the current graph analysis for hover tool enrichment.
 * Called by SessionManager when graph data is loaded/unloaded.
 */
export function setLspGraphAnalysis(a: GraphAnalysis | null): void {
  currentAnalysis = a
}

/** Enable hashline anchor appendix on `lsp_hover` (SessionManager sets from config). */
export function setHashlineLspHoverEnabled(enabled: boolean): void {
  setHashlineHoverEnabled(enabled)
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

/** Resolve graph lookup key from LSP hover body and file path. */
function resolveHoverLookupKey(fp: string, hoverText: string, cwd: string): string {
  const rel = relative(cwd, fp).replace(/\\/g, '/')
  const fromLsp = extractSymbolFromHoverText(hoverText)
  const stem = rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  return resolveGraphLookupKey(fromLsp ?? stem, rel)
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

      const cwd = ctxDir(ctx)
      let text = result

      if (currentAnalysis && result && !result.startsWith('No hover info')) {
        const rel = relative(cwd, fp).replace(/\\/g, '/')
        const symbol = resolveHoverLookupKey(fp, result, cwd)
        const enhanced = enhanceHoverWithGraphMetrics(symbol, result, currentAnalysis, rel)
        text = formatHoverAsMarkdown(enhanced)
      }

      text = await appendHashlineHoverSection(fp, p.line, cwd, text)

      return { content: [{ type: 'text' as const, text }], details: { ok: true } }
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
