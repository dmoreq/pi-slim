/**
 * `hashline_read` tool — read a file with LINE+BIGRAM anchors in the tool result.
 */

import { Type } from '@mariozechner/pi-ai'
import { type ExtensionAPI, defineTool } from '@mariozechner/pi-coding-agent'
import { produceDefaults } from '../context/schema.js'
import { formatHashlineRead } from '../commands/hashline-read.js'

const hashlineReadTool = defineTool({
  name: 'hashline_read',
  label: 'Hashline Read',
  description:
    'Read a source file with hashline LINE+BIGRAM anchors (e.g. `42nd|content`). ' +
    'Use before `hashline_edit` when dep-context anchors are missing or the edit is outside the injected range. ' +
    'Built-in `read` does not include anchors.',

  parameters: Type.Object({
    path: Type.String({ description: 'File path relative to project root or absolute' }),
    start_line: Type.Optional(
      Type.Integer({ minimum: 1, description: '1-based start line (inclusive). Omit for file start or auto region.' })
    ),
    end_line: Type.Optional(
      Type.Integer({ minimum: 1, description: '1-based end line (inclusive). Omit to read through end of file or max_lines.' })
    ),
    max_lines: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: 'Cap lines returned when start/end omitted (default: no cap except file length)',
      })
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { path: string; start_line?: number; end_line?: number; max_lines?: number },
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: unknown
  ) {
    const cwd = (ctx as { cwd?: string })?.cwd ?? process.cwd()
    const hl = produceDefaults().hashline
    const text = await formatHashlineRead(cwd, params.path, {
      recordOnRead: true,
      startLine: params.start_line,
      endLine: params.end_line,
      maxLines: params.max_lines,
      streamAnnotateThresholdLines: hl.streamAnnotateThresholdLines,
      streamChunkLines: hl.streamChunkLines,
    })
    return {
      content: [{ type: 'text' as const, text }],
      details: { path: params.path, startLine: params.start_line, endLine: params.end_line },
    }
  },
})

export function registerHashlineReadTool(pi: ExtensionAPI): void {
  pi.registerTool(hashlineReadTool as unknown as Parameters<ExtensionAPI['registerTool']>[0])
}

export default hashlineReadTool
