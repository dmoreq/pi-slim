/**
 * Hashline streaming generators — extracted from oh-my-pi.
 * Formats file content hashline-prefixed, yielding incremental chunks.
 * @module
 */

import { formatHashLine } from './line-hash.js'

export interface HashlineStreamOptions {
  startLine?: number
  maxChunkLines?: number
  maxChunkBytes?: number
}

interface ResolvedOptions {
  startLine: number
  maxChunkLines: number
  maxChunkBytes: number
}

interface ChunkEmitter {
  pushLine: (line: string) => string[]
  flush: () => string | undefined
}

function resolveOptions(options: HashlineStreamOptions): ResolvedOptions {
  return {
    startLine: options.startLine ?? 1,
    maxChunkLines: options.maxChunkLines ?? 200,
    maxChunkBytes: options.maxChunkBytes ?? 64 * 1024,
  }
}

function createChunkEmitter(options: ResolvedOptions, formatLine = formatHashLine): ChunkEmitter {
  let lineNumber = options.startLine
  let outLines: string[] = []
  let outBytes = 0

  const flush = (): string | undefined => {
    if (outLines.length === 0) return undefined
    const chunk = outLines.join('\n')
    outLines = []
    outBytes = 0
    return chunk
  }

  const pushLine = (line: string): string[] => {
    const formatted = formatLine(lineNumber, line)
    lineNumber++
    const chunks: string[] = []
    const sepBytes = outLines.length === 0 ? 0 : 1
    const lineBytes = Buffer.byteLength(formatted, 'utf-8')

    if (
      outLines.length > 0 &&
      (outLines.length >= options.maxChunkLines || outBytes + sepBytes + lineBytes > options.maxChunkBytes)
    ) {
      const f = flush()
      if (f) chunks.push(f)
    }
    outLines.push(formatted)
    outBytes += (outLines.length === 1 ? 0 : 1) + lineBytes

    if (outLines.length >= options.maxChunkLines || outBytes >= options.maxChunkBytes) {
      const f = flush()
      if (f) chunks.push(f)
    }
    return chunks
  }

  return { pushLine, flush }
}

/**
 * Stream hashline-formatted output from lines.
 */
export async function* streamHashLinesFromLines(
  lines: Iterable<string> | AsyncIterable<string>,
  options: HashlineStreamOptions = {}
): AsyncGenerator<string> {
  const resolved = resolveOptions(options)
  const emitter = createChunkEmitter(resolved)
  let sawAny = false

  if (Symbol.asyncIterator in lines) {
    for await (const line of lines as AsyncIterable<string>) {
      sawAny = true
      for (const out of emitter.pushLine(line)) yield out
    }
  } else {
    for (const line of lines as Iterable<string>) {
      sawAny = true
      for (const out of emitter.pushLine(line)) yield out
    }
  }

  if (!sawAny) {
    for (const out of emitter.pushLine('')) yield out
  }
  const last = emitter.flush()
  if (last) yield last
}

export { createChunkEmitter, resolveOptions }
export type { ChunkEmitter, ResolvedOptions }
