/**
 * Append hashline anchor hints to LSP hover output.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { computeLineHash, formatHashLine, initHash } from './line-hash.js'

let hashlineHoverEnabled = true

export function setHashlineHoverEnabled(enabled: boolean): void {
  hashlineHoverEnabled = enabled
}

export async function appendHashlineHoverSection(
  absPath: string,
  line: number,
  projectRoot: string,
  markdownBody: string
): Promise<string> {
  if (!hashlineHoverEnabled || line < 1) return markdownBody

  await initHash()

  let raw: string
  try {
    raw = readFileSync(absPath, 'utf-8')
  } catch {
    return markdownBody
  }

  const lines = raw.split('\n')
  if (line > lines.length) return markdownBody

  const lineText = lines[line - 1] ?? ''
  const anchorLine = formatHashLine(line, lineText)
  const tag = `${line}${computeLineHash(line, lineText)}`
  const rel = relative(projectRoot, absPath)

  return (
    `${markdownBody}\n\n### Hashline anchor\n` +
    `- Cursor line **${line}**: use anchor \`${tag}\` with \`hashline_edit\` (\`dry_run: true\` first).\n` +
    `- Full context: \`hashline_read\` path=\`${rel}\` start_line=${Math.max(1, line - 5)} end_line=${Math.min(lines.length, line + 5)}\`\n` +
    '```\n' +
    `${anchorLine}\n` +
    '```'
  )
}
