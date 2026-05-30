/**
 * Format LSP diagnostics and signature help for agent-facing tool output.
 */

import type { LSPDiagnostic, LSPSignatureHelp } from './client.js'

const SEVERITY_LABEL: Record<number, string> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
}

export function formatDiagnosticsForFile(relPath: string, diags: LSPDiagnostic[]): string {
  if (diags.length === 0) {
    return `No LSP diagnostics for ${relPath}.`
  }

  const lines = diags.map(d => {
    const sev = SEVERITY_LABEL[d.severity] ?? 'unknown'
    const line = d.range.start.line
    const col = d.range.start.character
    const code = d.code != null ? ` (${d.code})` : ''
    const src = d.source ? `[${d.source}] ` : ''
    return `  L${line + 1}:${col + 1} [${sev}]${code} ${src}${d.message}`
  })

  return `LSP diagnostics for ${relPath} (${diags.length}):\n\n${lines.join('\n')}`
}

export function formatSignatureHelp(help: LSPSignatureHelp | null): string {
  if (!help?.signatures?.length) {
    return 'No signature help available at this position.'
  }

  const idx = help.activeSignature ?? 0
  const sig = help.signatures[idx] ?? help.signatures[0]
  const parts: string[] = [`**${sig.label}**`]

  if (sig.documentation) {
    const doc = typeof sig.documentation === 'string' ? sig.documentation : sig.documentation.value
    if (doc.trim()) parts.push(doc.trim())
  }

  if (sig.parameters?.length) {
    const active = help.activeParameter ?? 0
    const paramLines = sig.parameters.map((p, i) => {
      const label = typeof p.label === 'string' ? p.label : `${p.label[0]}-${p.label[1]}`
      const marker = i === active ? '→ ' : '  '
      return `${marker}${label}`
    })
    parts.push('', 'Parameters:', ...paramLines)
  }

  return parts.join('\n')
}
