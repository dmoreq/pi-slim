/**
 * Guidance block nudging agents toward LSP tools after compiler failures.
 */

import type { CompilerErrorHint } from '../shared/intelligence-types.js'

export function formatCompilerErrorLspGuidance(hints: CompilerErrorHint[]): string | null {
  if (hints.length === 0) return null

  const lines = hints.slice(0, 6).map(h => {
    return `- \`${h.relPath}\` → \`lsp_hover\` with \`line: ${h.line}\`, \`column: ${h.column}\``
  })

  if (hints.length > 6) {
    lines.push(`- ... and ${hints.length - 6} more error site(s)`)
  }

  return (
    '🔧 COMPILER ERRORS → LSP:\n' +
    'Recent build/test output references these locations. Prefer `lsp_hover` for type context ' +
    'and `lsp_go_to_definition` before patching.\n' +
    lines.join('\n')
  )
}
