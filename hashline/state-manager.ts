import * as diff from 'diff'
import { computeLineHash } from './line-hash.js'

export interface DocumentState {
  lines: string[]
  /** LINE+bigram suffix per line — same scheme as `computeLineHash` / hashline_edit validation. */
  lineHashes: string[]
}

function lineHashesForContent(content: string): { lines: string[]; lineHashes: string[] } {
  const lines = content.split('\n')
  const lineHashes = lines.map((line, i) => computeLineHash(i + 1, line))
  return { lines, lineHashes }
}

export class AnchorStateManager {
  private static storage = new Map<string, DocumentState>()

  public static has(filePath: string): boolean {
    return this.storage.has(filePath)
  }

  public static record(filePath: string, content: string): void {
    this.storage.set(filePath, lineHashesForContent(content))
  }

  /**
   * Reconcile expected anchors from the agent's view against the current disk content.
   * Uses Myers Diff over line-hash strings (computeLineHash) to map line numbers.
   */
  public static reconcile(
    filePath: string,
    currentContent: string,
    expectedEdits: Array<{ pos?: { line: number; hash: string }; end?: { line: number; hash: string } }>
  ): {
    warnings: string[]
    rebasedEdits: typeof expectedEdits
  } {
    const { lines: currentLines, lineHashes: currentHashes } = lineHashesForContent(currentContent)

    let tracked = this.storage.get(filePath)
    if (!tracked) {
      this.record(filePath, currentContent)
      tracked = this.storage.get(filePath)!
    }

    const changes = diff.diffArrays(tracked.lineHashes, currentHashes)

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
          const center = Math.min(anchor.line, currentLines.length)
          const lo = Math.max(1, center - 10)
          const hi = Math.min(currentLines.length, center + 10)
          let found: number | null = null
          for (let line = lo; line <= hi; line++) {
            if (computeLineHash(line, currentLines[line - 1]) === anchor.hash) {
              if (found !== null) {
                found = null
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

  public static reset(): void {
    this.storage.clear()
  }
}
