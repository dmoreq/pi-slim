/**
 * LSP Navigation Tools — go-to-definition, find-references, hover, and extended navigation.
 */

import { relative, resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'
import { extractSymbolFromHoverText } from '../context/graph-node-id.js'
import { enhanceHoverWithGraphMetrics, formatHoverAsMarkdown } from '../context/graph-lsp-hover.js'
import { resolveGraphLookup } from '../context/graph-lsp-resolve.js'
import type { GraphAnalysis } from '../context/graph-types.js'
import { appendHashlineHoverSection, setHashlineHoverEnabled } from '../hashline/lsp-hover-anchor.js'
import { LspNavigationService } from '../lsp/service.js'
import type { RepoIndex } from '../shared/types.js'

let currentAnalysis: GraphAnalysis | null = null
let currentIndex: RepoIndex | null = null
let enrichHoverWithGraph = true
let hoverMaxReferencesListed = 10
let hashlineHoverEnabled = true

export function setLspGraphAnalysis(a: GraphAnalysis | null): void {
  currentAnalysis = a
}

export function setLspRepoIndex(index: RepoIndex | null): void {
  currentIndex = index
}

export function setLspToolOptions(opts: {
  enrichHoverWithGraph?: boolean
  hoverMaxReferencesListed?: number
}): void {
  if (opts.enrichHoverWithGraph !== undefined) enrichHoverWithGraph = opts.enrichHoverWithGraph
  if (opts.hoverMaxReferencesListed !== undefined) hoverMaxReferencesListed = opts.hoverMaxReferencesListed
}

export function setHashlineLspHoverEnabled(enabled: boolean): void {
  hashlineHoverEnabled = enabled
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

const fpParams = Type.Object({
  path: Type.String({ description: 'File path (relative to cwd or absolute)' }),
  line: Type.Integer({ description: 'Line number (0-indexed)' }),
  column: Type.Integer({ description: 'Column number (0-indexed)' }),
})

function ctxDir(ctx: unknown): string {
  return (ctx as { cwd?: string })?.cwd ?? process.cwd()
}

function toolResult(text: string, paths: string[], ok = true) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { ok, paths },
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: `LSP error: ${message}` }],
    details: { ok: false, paths: [] as string[] },
  }
}

function reverseDepsForFileAbs(projectRoot: string, relPath: string): string[] {
  if (!currentIndex) return []
  const abs = resolve(projectRoot, relPath)
  const importers = currentIndex.reverseDeps.get(abs)
  if (!importers?.size) return []
  return [...importers]
    .map(p => relative(projectRoot, p).replace(/\\/g, '/'))
    .slice(0, 5)
}

function resolveHoverLookupKey(fp: string, hoverText: string, cwd: string): string {
  const rel = relative(cwd, fp).replace(/\\/g, '/')
  const fromLsp = extractSymbolFromHoverText(hoverText)
  const symbol = fromLsp ?? rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  const resolved = resolveGraphLookup(rel, symbol, currentAnalysis)
  return resolved.lookupKey
}

async function runLocationTool(
  fn: () => Promise<{ text: string; paths: string[] }>
): Promise<{ content: Array<{ type: 'text'; text: string }>; details: { ok: boolean; paths: string[] } }> {
  try {
    const { text, paths } = await fn()
    return toolResult(text, paths)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return toolError(message)
  }
}

const goToDefTool = defineTool({
  name: 'lsp_go_to_definition',
  label: 'Go to Definition',
  description:
    'Find the definition of a symbol at a file position using LSP. Prefer over reading whole files. Uses 0-based line and column.',
  parameters: fpParams,
  async execute(_tid, p: { path: string; line: number; column: number }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() => getService().goToDefinition(resolve(cwd, p.path), p.line, p.column, cwd))
  },
})

const findRefsTool = defineTool({
  name: 'lsp_find_references',
  label: 'Find References',
  description:
    'Find all references to a symbol at a position using LSP. Use before editing shared symbols. 0-based line/column.',
  parameters: fpParams,
  async execute(_tid, p: { path: string; line: number; column: number }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() =>
      getService().findReferences(resolve(cwd, p.path), p.line, p.column, cwd, hoverMaxReferencesListed)
    )
  },
})

const hoverTool = defineTool({
  name: 'lsp_hover',
  label: 'Hover Info',
  description:
    'Get type information at a cursor position using LSP, enriched with graph metrics and hashline anchor when available. 0-based line/column.',
  parameters: fpParams,
  async execute(_tid, p: { path: string; line: number; column: number }, _sig, _upd, ctx) {
    try {
      const cwd = ctxDir(ctx)
      const fp = resolve(cwd, p.path)
      const result = await getService().hoverInfo(fp, p.line, p.column, cwd)
      const rel = relative(cwd, fp).replace(/\\/g, '/')

      let text = result
      if (enrichHoverWithGraph && currentAnalysis && result && !result.startsWith('No hover info')) {
        const symbol = resolveHoverLookupKey(fp, result, cwd)
        const reverseDeps = reverseDepsForFileAbs(cwd, rel)
        const enhanced = enhanceHoverWithGraphMetrics(symbol, result, currentAnalysis, rel, reverseDeps)
        text = formatHoverAsMarkdown(enhanced)
      }

      text = await appendHashlineHoverSection(fp, p.line, cwd, text)

      return toolResult(text, [rel])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return toolError(message)
    }
  },
})

const implTool = defineTool({
  name: 'lsp_implementation',
  label: 'Go to Implementation',
  description:
    'Find concrete implementations for a symbol at a position (e.g. interface to impl). 0-based line/column.',
  parameters: fpParams,
  async execute(_tid, p: { path: string; line: number; column: number }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() => getService().implementation(resolve(cwd, p.path), p.line, p.column, cwd))
  },
})

const docSymbolTool = defineTool({
  name: 'lsp_document_symbol',
  label: 'Document Symbols',
  description: 'List symbols in a file (outline) with 0-based line hints for hover and goto-def.',
  parameters: Type.Object({
    path: Type.String({ description: 'File path relative to project root or absolute' }),
  }),
  async execute(_tid, p: { path: string }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() => getService().documentSymbol(p.path, cwd))
  },
})

const workspaceSymbolTool = defineTool({
  name: 'lsp_workspace_symbol',
  label: 'Workspace Symbol Search',
  description: 'Search symbols by name across the workspace using LSP.',
  parameters: Type.Object({
    query: Type.String({ description: 'Symbol name or substring to search' }),
    path_hint: Type.Optional(
      Type.String({ description: 'Optional file path to select language server (e.g. any .ts file)' })
    ),
    limit: Type.Optional(Type.Integer({ minimum: 1, description: 'Max results (default 25)' })),
  }),
  async execute(
    _tid,
    p: { query: string; path_hint?: string; limit?: number },
    _sig,
    _upd,
    ctx
  ) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() =>
      getService().workspaceSymbol(p.query, cwd, p.path_hint, p.limit ?? 25)
    )
  },
})

const batchGotoTool = defineTool({
  name: 'lsp_go_to_definition_batch',
  label: 'Batch Go to Definition',
  description:
    'Resolve definitions for multiple file:line:column positions in one call. Positions use 0-based line and column.',
  parameters: Type.Object({
    positions: Type.Array(
      Type.Object({
        path: Type.String(),
        line: Type.Integer(),
        column: Type.Integer(),
      }),
      { minItems: 1, maxItems: 10 }
    ),
  }),
  async execute(_tid, p: { positions: Array<{ path: string; line: number; column: number }> }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    const allPaths = new Set<string>()
    const sections: string[] = []

    try {
      for (const pos of p.positions) {
        const { text, paths } = await getService().goToDefinition(
          resolve(cwd, pos.path),
          pos.line,
          pos.column,
          cwd
        )
        sections.push(`### ${pos.path}:${pos.line}:${pos.column}\n${text}`)
        for (const path of paths) allPaths.add(path)
      }
      return toolResult(sections.join('\n\n'), [...allPaths])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return toolError(message)
    }
  },
})

const diagnosticsTool = defineTool({
  name: 'lsp_diagnostics',
  label: 'LSP Diagnostics',
  description:
    'List language-server diagnostics for a file after opening it. Use after build failures to compare with compiler output. 0-based positions in other LSP tools.',
  parameters: Type.Object({
    path: Type.String({ description: 'File path relative to project root or absolute' }),
    wait_ms: Type.Optional(
      Type.Integer({ minimum: 0, description: 'Ms to wait for diagnostics (default 2500)' })
    ),
  }),
  async execute(_tid, p: { path: string; wait_ms?: number }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() =>
      getService().fileDiagnostics(resolve(cwd, p.path), cwd, p.wait_ms ?? 2500)
    )
  },
})

const signatureHelpTool = defineTool({
  name: 'lsp_signature_help',
  label: 'LSP Signature Help',
  description:
    'Get function/method signature and parameter info at a call site. Uses 0-based line and column.',
  parameters: fpParams,
  async execute(_tid, p: { path: string; line: number; column: number }, _sig, _upd, ctx) {
    const cwd = ctxDir(ctx)
    return runLocationTool(() =>
      getService().signatureHelp(resolve(cwd, p.path), p.line, p.column, cwd)
    )
  },
})

export function registerLspTools(pi: ExtensionAPI): void {
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(goToDefTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(findRefsTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(hoverTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(implTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(docSymbolTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(workspaceSymbolTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(batchGotoTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(diagnosticsTool)
  // @ts-expect-error - Tool registration type mismatch
  pi.registerTool(signatureHelpTool)
}

export default registerLspTools
