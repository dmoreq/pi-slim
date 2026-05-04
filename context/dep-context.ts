import { relative } from 'node:path'
import { extractText } from '../shared/message.js'
import { estimateTokens } from '../shared/token.js'
import type { RepoIndex } from '../shared/types.js'

const FILE_PATH_RE = /(?:^|[\s'"`(])([.\/\w-]+\/[\w.\/-]+\.(?:tsx|ts|py|rs))/g

interface Message {
  role: string
  content: string | Array<{ type: string; text?: string }>
}

export class ContextInjector {
  private readonly projectRoot: string
  private readonly maxTokens: number
  private readonly scanLastN: number

  constructor(projectRoot: string, maxTokens: number, scanLastN: number) {
    this.projectRoot = projectRoot
    this.maxTokens = maxTokens
    this.scanLastN = scanLastN
  }

  buildInjection(index: RepoIndex, messages: Message[], extraPaths?: Set<string>): string {
    const inFocus = this.detectInFocusFiles(index, messages, extraPaths)
    if (inFocus.size === 0) return ''

    const sections: string[] = []
    let tokenBudget = this.maxTokens

    const activeLines: string[] = ['## Active files']
    for (const absPath of inFocus) {
      const skeleton = index.skeletons.get(absPath)
      if (!skeleton) continue
      const rel = relative(this.projectRoot, absPath)
      const entry = `### ${rel}\n${skeleton}`
      const cost = estimateTokens(entry)
      if (cost > tokenBudget) continue
      activeLines.push(entry)
      tokenBudget -= cost
    }
    if (activeLines.length > 1) sections.push(activeLines.join('\n'))

    const depPaths = new Set<string>()
    for (const absPath of inFocus) {
      for (const dep of index.deps.get(absPath) ?? []) {
        if (!inFocus.has(dep)) depPaths.add(dep)
      }
    }

    if (depPaths.size > 0) {
      const depLines: string[] = ['## Direct dependencies']
      for (const dep of depPaths) {
        const skeleton = index.skeletons.get(dep)
        if (!skeleton) continue
        const rel = relative(this.projectRoot, dep)
        const entry = `### ${rel}\n${skeleton}`
        const cost = estimateTokens(entry)
        if (cost > tokenBudget) continue
        depLines.push(entry)
        tokenBudget -= cost
      }
      if (depLines.length > 1) sections.push(depLines.join('\n'))
    }

    const body = sections.join('\n\n')
    return `<dep-context>\n${body}\n</dep-context>`
  }

  private detectInFocusFiles(
    index: RepoIndex,
    messages: Message[],
    extraPaths?: Set<string>,
  ): Set<string> {
    const recent = messages.slice(-this.scanLastN)
    const mentioned = new Set<string>()

    for (const msg of recent) {
      const text = extractText(msg.content)
      for (const match of text.matchAll(FILE_PATH_RE)) {
        mentioned.add(match[1])
      }
    }

    if (extraPaths) {
      for (const p of extraPaths) {
        mentioned.add(p)
      }
    }

    const inFocus = new Set<string>()
    for (const absPath of index.skeletons.keys()) {
      const rel = relative(this.projectRoot, absPath)
      for (const mention of mentioned) {
        if (rel.endsWith(mention) || rel === mention || absPath.endsWith(mention)) {
          inFocus.add(absPath)
        }
      }
    }

    return inFocus
  }
}
