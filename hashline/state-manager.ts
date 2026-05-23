import * as diff from 'diff'
import { computeLineHash } from './line-hash.js'

export interface DocumentState {
  lines: string[]
  hashes: Uint32Array
}

export class AnchorStateManager {
  private static storage = new Map<string, DocumentState>()

  /**
   * Record the state of a file (typically on read or after a successful write).
   */
  public static record(filePath: string, content: string): void {
    const lines = content.split('\n')
    const hashes = new Uint32Array(lines.length)
    for (let i = 0; i < lines.length; i++) {
      hashes[i] = this.simpleHash(lines[i])
    }
    this.storage.set(filePath, { lines, hashes })
  }

  /**
   * Reconcile expected anchors from the agent's view against the current disk content.
   * Uses Myers Diff over line hashes to map agent's line numbers to current disk line numbers.
   */
  public static reconcile(
    filePath: string,
    currentContent: string,
    expectedEdits: Array<{ pos: { line: number; hash: string }; end?: { line: number; hash: string } }>
  ): {
    warnings: string[]
    rebasedEdits: Array<{ pos: { line: number; hash: string }; end?: { line: number; hash: string } }>
  } {
    const currentLines = currentContent.split('\n')
    const currentHashes = new Uint32Array(currentLines.length)
    for (let i = 0; i < currentLines.length; i++) {
      currentHashes[i] = this.simpleHash(currentLines[i])
    }

    let tracked = this.storage.get(filePath)
    if (!tracked) {
      // If no history exists, initialize last known content to current disk content.
      // This is a safe fallback assuming no external shifts occurred since the read.
      this.record(filePath, currentContent)
      tracked = this.storage.get(filePath)!
    }

    // Run Myers Diff on line hashes between the old (tracked) and current (disk) state.
    const changes = diff.diffArrays(Array.from(tracked.hashes), Array.from(currentHashes))
    
    // Build a map of old index (1-based) -> current index (1-based)
    const indexMap = new Map<number, number>()
    let oldIdx = 1
    let newIdx = 1

    for (const change of changes) {
      if (change.added) {
        newIdx += change.count!
      } else if (change.removed) {
        oldIdx += change.count!
      } else {
        for (let i = 0; i < change.count!; i++) {
          indexMap.set(oldIdx, newIdx)
          oldIdx++
          newIdx++
        }
      }
    }

    const warnings: string[] = []
    const rebasedEdits = expectedEdits.map(edit => {
      const rebased = { ...edit }
      const rebaseAnchor = (anchor: { line: number; hash: string }) => {
        const mappedLine = indexMap.get(anchor.line)
        if (mappedLine !== undefined) {
          if (mappedLine !== anchor.line) {
            warnings.push(
              `Auto-rebased anchor ${anchor.line}${anchor.hash} \u2192 ${mappedLine}${anchor.hash} (line shifted; mapped via stateful Myers Diff).`
            )
            anchor.line = mappedLine
          }
        } else {
          // If the line was deleted or couldn't be mapped directly, fall back to sliding window search
          const center = Math.min(anchor.line, currentLines.length)
          const lo = Math.max(1, center - 10)
          const hi = Math.min(currentLines.length, center + 10)
          let found: number | null = null
          for (let line = lo; line <= hi; line++) {
            if (computeLineHash(line, currentLines[line - 1]) === anchor.hash) {
              if (found !== null) {
                found = null // Ambiguous, clear search
                break
              }
              found = line
            }
          }
          if (found !== null) {
            warnings.push(
              `Auto-rebased deleted/drifted anchor ${anchor.line}${anchor.hash} \u2192 ${found}${anchor.hash} (mapped via fallback window search).`
            )
            anchor.line = found
          }
        }
      }

      if (rebased.pos) rebaseAnchor(rebased.pos)
      if (rebased.end) rebaseAnchor(rebased.end)
      return rebased
    })

    return { warnings, rebasedEdits }
  }

  /**
   * Reset state (useful for testing or session boundaries).
   */
  public static reset(): void {
    this.storage.clear()
  }

  private static simpleHash(str: string): number {
    str = str.replace(/\r/g, '').trimEnd()
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619)
    }
    return h >>> 0
  }
}
