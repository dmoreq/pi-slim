/**
 * LSP Navigation Service — wraps LSP client into a simple tool-callable API.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'
import { formatDiagnosticsForFile, formatSignatureHelp } from './diagnostic-format.js'
import { type LSPClientInfo, createLSPClient } from '../lsp/client.js'
import type { LSPLocation, LSPSymbol } from '../lsp/client.js'
import { formatMissingLspServerMessage, isLspServerAvailable } from '../lsp/health.js'
import { getLanguageId } from '../lsp/language.js'
import { killLSPProcess, launchLSP } from '../lsp/launch.js'
import type { LSPProcess } from '../lsp/launch.js'

interface ServerDef {
  command: string
  args: string[]
}

const SERVERS: Record<string, ServerDef> = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pyright-langserver', args: ['--stdio'] },
  go: { command: 'gopls', args: [] },
  rust: { command: 'rust-analyzer', args: [] },
}

const SYMBOL_KIND: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  22: 'enum-member',
  23: 'struct',
}

export function resolveServerKey(languageId: string | undefined): string | undefined {
  if (!languageId) return undefined
  if (
    languageId === 'typescript' ||
    languageId === 'typescriptreact' ||
    languageId.startsWith('javascript')
  ) {
    return 'typescript'
  }
  if (languageId === 'python') return 'python'
  if (languageId === 'go') return 'go'
  if (languageId === 'rust') return 'rust'
  return undefined
}

export function formatLocation(loc: LSPLocation): string {
  return `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`
}

export function locationsToRelPaths(locations: LSPLocation[], projectRoot: string): string[] {
  const out = new Set<string>()
  for (const loc of locations) {
    try {
      const abs = fileURLToPath(loc.uri.split('#')[0] ?? loc.uri)
      const rel = relative(projectRoot, abs).replace(/\\/g, '/')
      if (!rel.startsWith('..')) out.add(rel)
    } catch {
      /* skip bad uri */
    }
  }
  return [...out]
}

export interface LspTextResult {
  text: string
  paths: string[]
}

export class LspNavigationService {
  private clients = new Map<string, LSPClientInfo>()
  private processes = new Map<string, LSPProcess>()
  private openedDocs = new Set<string>()

  private async ensureDocumentOpen(absPath: string, client: LSPClientInfo): Promise<void> {
    if (this.openedDocs.has(absPath)) return
    const content = await readFile(absPath, 'utf-8')
    const languageId = getLanguageId(absPath)
    await client.notify.open(absPath, content, languageId)
    this.openedDocs.add(absPath)
  }

  async ensureServer(filePath: string, projectRoot: string): Promise<LSPClientInfo> {
    const languageId = getLanguageId(filePath)
    const serverKey = resolveServerKey(languageId)
    if (!serverKey) throw new Error(`No language server available for ${filePath}`)

    const existing = this.clients.get(serverKey)
    if (existing?.isAlive()) return existing

    const serverDef = SERVERS[serverKey]
    if (!serverDef) throw new Error(`No language server defined for ${serverKey}`)

    if (!isLspServerAvailable(serverKey)) {
      throw new Error(formatMissingLspServerMessage(serverKey))
    }

    const proc = await launchLSP(serverDef.command, serverDef.args, { cwd: projectRoot })
    this.processes.set(serverKey, proc)

    const client = await createLSPClient({ serverId: serverKey, root: projectRoot, process: proc })
    this.clients.set(serverKey, client)
    return client
  }

  private formatLocations(
    label: string,
    locations: LSPLocation[],
    projectRoot: string
  ): LspTextResult {
    const paths = locationsToRelPaths(locations, projectRoot)
    if (locations.length === 0) {
      return { text: `No ${label} found.`, paths: [] }
    }
    const lines = locations.map(loc => `  ${formatLocation(loc)}`)
    return {
      text: `${label}${locations.length > 1 ? 's' : ''} found (${locations.length}):\n${lines.join('\n')}`,
      paths,
    }
  }

  async goToDefinition(
    filePath: string,
    line: number,
    column: number,
    projectRoot: string
  ): Promise<LspTextResult> {
    const abs = resolve(projectRoot, filePath)
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    const result = await client.definition(abs, line, column)
    return this.formatLocations('Definition', result ?? [], projectRoot)
  }

  async findReferences(
    filePath: string,
    line: number,
    column: number,
    projectRoot: string,
    maxListed = 50
  ): Promise<LspTextResult> {
    const abs = resolve(projectRoot, filePath)
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    const result = await client.references(abs, line, column, false)
    const all = result ?? []
    const listed = all.slice(0, maxListed)
    const formatted = this.formatLocations('Reference', listed, projectRoot)
    if (all.length > maxListed) {
      formatted.text += `\n  ... and ${all.length - maxListed} more`
    }
    formatted.paths = locationsToRelPaths(all, projectRoot)
    return formatted
  }

  async hoverInfo(filePath: string, line: number, column: number, projectRoot: string): Promise<string> {
    const abs = resolve(projectRoot, filePath)
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    const hover = await client.hover(abs, line, column)
    if (!hover) return 'No hover info available.'
    const parts: string[] = []
    const c = hover.contents
    if (typeof c === 'string') parts.push(c)
    else if (Array.isArray(c)) {
      for (const item of c) parts.push(typeof item === 'string' ? item : item.value)
    } else if (c && typeof c === 'object' && 'value' in c) parts.push((c as { value: string }).value)
    return parts.join('\n').trim()
  }

  async implementation(
    filePath: string,
    line: number,
    column: number,
    projectRoot: string
  ): Promise<LspTextResult> {
    const abs = resolve(projectRoot, filePath)
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    const result = await client.implementation(abs, line, column)
    return this.formatLocations('Implementation', result ?? [], projectRoot)
  }

  async documentSymbol(filePath: string, projectRoot: string): Promise<LspTextResult> {
    const client = await this.ensureServer(filePath, projectRoot)
    const abs = resolve(projectRoot, filePath)
    const symbols = await client.documentSymbol(abs)
    if (!symbols?.length) {
      return { text: 'No document symbols found.', paths: [relative(projectRoot, abs).replace(/\\/g, '/')] }
    }
    const rel = relative(projectRoot, abs).replace(/\\/g, '/')
    const lines = flattenDocumentSymbols(symbols, 0)
    return {
      text:
        `Document outline for ${rel} (${symbols.length} top-level symbols).\n` +
        'Use 0-based line/col with `lsp_hover` or `lsp_go_to_definition`.\n\n' +
        lines.join('\n'),
      paths: [rel],
    }
  }

  async fileDiagnostics(
    filePath: string,
    projectRoot: string,
    waitMs = 2500
  ): Promise<LspTextResult> {
    const abs = resolve(projectRoot, filePath)
    const rel = relative(projectRoot, abs).replace(/\\/g, '/')
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    await client.waitForDiagnostics(abs, waitMs)
    const diags = client.getDiagnostics(abs)
    return {
      text: formatDiagnosticsForFile(rel, diags),
      paths: [rel],
    }
  }

  async signatureHelp(
    filePath: string,
    line: number,
    column: number,
    projectRoot: string
  ): Promise<LspTextResult> {
    const abs = resolve(projectRoot, filePath)
    const rel = relative(projectRoot, abs).replace(/\\/g, '/')
    const client = await this.ensureServer(filePath, projectRoot)
    await this.ensureDocumentOpen(abs, client)
    const help = await client.signatureHelp(abs, line, column)
    return {
      text: formatSignatureHelp(help),
      paths: [rel],
    }
  }

  async workspaceSymbol(
    query: string,
    projectRoot: string,
    filePathHint: string | undefined,
    limit: number
  ): Promise<LspTextResult> {
    const hint = filePathHint ?? 'package.json'
    const client = await this.ensureServer(hint, projectRoot)
    const symbols = await client.workspaceSymbol(query)
    if (!symbols?.length) {
      return { text: `No workspace symbols matching "${query}".`, paths: [] }
    }
    const paths = new Set<string>()
    const rows: string[] = []
    for (const sym of symbols.slice(0, limit)) {
      const loc = sym.location
      if (!loc?.uri) continue
      try {
        const abs = fileURLToPath(loc.uri.split('#')[0] ?? loc.uri)
        const rel = relative(projectRoot, abs).replace(/\\/g, '/')
        if (!rel.startsWith('..')) paths.add(rel)
        const kind = SYMBOL_KIND[sym.kind] ?? String(sym.kind)
        const line = loc.range.start.line
        const col = loc.range.start.character
        rows.push(`${sym.name} | ${kind} | ${rel}:${line}:${col}`)
      } catch {
        /* skip */
      }
    }
    return {
      text: `Workspace symbols for "${query}" (showing ${rows.length}):\n\n${rows.join('\n')}`,
      paths: [...paths],
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.clients].map(([, c]) => c.shutdown().catch(() => {})))
    await Promise.all([...this.processes].map(([, p]) => killLSPProcess(p).catch(() => {})))
    this.clients.clear()
    this.processes.clear()
    this.openedDocs.clear()
  }
}

function flattenDocumentSymbols(symbols: LSPSymbol[], depth: number): string[] {
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  for (const sym of symbols) {
    const kind = SYMBOL_KIND[sym.kind] ?? String(sym.kind)
    const range = sym.range ?? sym.location?.range
    const pos =
      range != null ? ` (line ${range.start.line}, col ${range.start.character})` : ''
    lines.push(`${indent}${sym.name} [${kind}]${pos}`)
    const children = (sym as LSPSymbol & { children?: LSPSymbol[] }).children
    if (children?.length) {
      lines.push(...flattenDocumentSymbols(children, depth + 1))
    }
  }
  return lines
}
