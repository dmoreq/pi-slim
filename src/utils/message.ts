/**
 * Message content extraction utilities.
 *
 * Unifies text extraction from pi's multi-format message content
 * (plain string or content blocks array) into a single helper.
 */

/**
 * Extract plain text content from a message's content field.
 * Handles both string content and content block arrays.
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } => typeof c === 'object' && c !== null)
      .map(c => c.text ?? '')
      .join(' ')
  }
  return ''
}

/**
 * Extract injected file paths from a <dep-context> block.
 * Matches lines starting with `### ` which are the file headers.
 */
export function extractInjectedFilePaths(depContext: string): string[] {
  const matches = [...depContext.matchAll(/^### (.+)$/gm)]
  return matches.map(m => m[1])
}
