import { relative } from 'node:path'
import { appendHashlineToEntry, type HashlineInjectOptions } from './hashline-inject.js'
import { extractText } from '../shared/message.js'
import { isBroadCodebaseQuery } from '../shared/query-intent.js'
import { estimateTokens } from '../shared/token.js'
import type { RepoIndex } from '../shared/types.js'
import { godNodeMatchesFilePath, parseGraphNodeId } from './graph-node-id.js'
import type { GraphAnalysis } from './graph-types.js'
import { RetrievalEngine, type ScoredFile } from './retrieval.js'

const FILE_PATH_RE = /(?:^|[\s'"`(])([.\/\w-]+\/[\w.\/-]+\.(?:tsx|ts|py|rs))/g

interface Message {
  role: string
  content: string | Array<{ type: string; text?: string }>
}

export { RetrievalEngine, type ScoredFile }

export class ContextInjector {
  private readonly projectRoot: string
  private readonly maxTokens: number
  private readonly scanLastN: number

  /** Last explanation for /scope explain */
  lastExplanation: ScoredFile[] = []

  constructor(projectRoot: string, maxTokens: number, scanLastN: number) {
    this.projectRoot = projectRoot
    this.maxTokens = maxTokens
    this.scanLastN = scanLastN
  }

  buildInjection(
    index: RepoIndex,
    messages: Message[],
    extraPaths?: Set<string>,
    retrieval?: RetrievalEngine,
    transitiveDepth = 1,
    graphAnalysis?: GraphAnalysis | null,
    hashline?: HashlineInjectOptions
  ): string {
    const inFocus = this.detectInFocusFiles(index, messages, extraPaths, retrieval, graphAnalysis)

    // Broad codebase overview: inject top files by centrality when the query
    // is a high-level codebase question with no specific paths/symbols.
    const query = messages.length > 0 ? extractText(messages[messages.length - 1].content) : ''
    let isBroadOverview = false
    if (inFocus.size === 0 && isBroadCodebaseQuery(query)) {
      const overviewFiles = getBroadOverviewFiles(index, graphAnalysis, 5)
      for (const f of overviewFiles) inFocus.add(f)
      isBroadOverview = true
    }

    if (inFocus.size === 0) return ''

    const sections: string[] = []
    let tokenBudget = this.maxTokens

    if (isBroadOverview) {
      sections.push(`## Codebase Overview (${index.skeletons.size} files, ${index.symbolIndex.size} symbols)`)
      const communityOverview = buildBroadCommunityOverview(graphAnalysis)
      if (communityOverview) sections.push(communityOverview)
      const moduleListing = buildModuleStructureListing(index, this.projectRoot)
      if (moduleListing) sections.push(moduleListing)
    }

    const activeLines: string[] = ['## Key files']
    for (const absPath of inFocus) {
      const skeleton = index.skeletons.get(absPath)
      if (!skeleton) continue
      const rel = relative(this.projectRoot, absPath)
      let entry = `### ${rel}\n${skeleton}`
      let cost = estimateTokens(entry)
      if (hashline?.enabled) {
        const annotated = appendHashlineToEntry(entry, absPath, this.projectRoot, hashline, tokenBudget)
        entry = annotated.entry
        cost = annotated.cost
      }
      if (cost > tokenBudget) continue
      activeLines.push(entry)
      tokenBudget -= cost
    }
    if (activeLines.length > 1) sections.push(activeLines.join('\n'))

    // Dep graph with transitive resolution
    const depPaths = new Set<string>()
    let currentLevel = new Set<string>()
    for (const absPath of inFocus) {
      for (const dep of index.deps.get(absPath) ?? []) {
        if (!inFocus.has(dep) && !depPaths.has(dep)) {
          depPaths.add(dep)
          currentLevel.add(dep)
        }
      }
    }

    for (let depth = 2; depth <= transitiveDepth; depth++) {
      const nextLevel = new Set<string>()
      for (const dep of currentLevel) {
        for (const subDep of index.deps.get(dep) ?? []) {
          if (!inFocus.has(subDep) && !depPaths.has(subDep)) {
            nextLevel.add(subDep)
            depPaths.add(subDep)
          }
        }
      }
      if (nextLevel.size === 0) break
      currentLevel = nextLevel
    }

    if (depPaths.size > 0) {
      const depLines: string[] = ['## Direct dependencies']
      for (const dep of depPaths) {
        const skeleton = index.skeletons.get(dep)
        if (!skeleton) continue
        const rel = relative(this.projectRoot, dep)
        let entry = `### ${rel}\n${skeleton}`
        let cost = estimateTokens(entry)
        if (hashline?.enabled) {
          const annotated = appendHashlineToEntry(entry, dep, this.projectRoot, hashline, tokenBudget)
          entry = annotated.entry
          cost = annotated.cost
        }
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
    retrieval?: RetrievalEngine,
    graphAnalysis?: GraphAnalysis | null
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

    // Scored retrieval via RetrievalEngine
    if (retrieval && index.symbolIndex?.size) {
      const query = recent.map(m => extractText(m.content)).join(' ')
      let scored = retrieval.retrieveTopK(query, 20)

      // Graph-aware boost: promote files that match god nodes (file:path ids, not stems only)
      if (graphAnalysis?.godNodes?.length) {
        scored = scored
          .map(f => {
            const rel = relative(this.projectRoot, f.file)
            const matchesGod = graphAnalysis.godNodes.some(gn => godNodeMatchesFilePath(rel, gn))
            if (matchesGod) {
              return { ...f, score: f.score + Math.max(f.score, 1) }
            }
            return f
          })
          .sort((a, b) => b.score - a.score)
      }

      this.lastExplanation = scored

      const inFocus = new Set<string>()
      for (const { file } of scored) inFocus.add(file)
      for (const absPath of index.skeletons.keys()) {
        const rel = relative(this.projectRoot, absPath)
        for (const mention of mentioned) {
          if (rel.endsWith(mention) || rel === mention || absPath.endsWith(mention)) inFocus.add(absPath)
        }
      }
      return inFocus
    }

    // Fallback: regex matching
    const inFocus = new Set<string>()
    for (const absPath of index.skeletons.keys()) {
      const rel = relative(this.projectRoot, absPath)
      for (const mention of mentioned) {
        if (rel.endsWith(mention) || rel === mention || absPath.endsWith(mention)) inFocus.add(absPath)
      }
    }
    return inFocus
  }
}

// ── Broad codebase overview helpers ─────────────────────────────────

/** Entry-point file basenames that are important for understanding a codebase. */
const ENTRY_POINT_NAMES = new Set([
  'extension.ts',
  'extension.js',
  'manager.ts',
  'manager.js',
  'index.ts',
  'index.js',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
  'server.ts',
  'server.js',
])

/**
 * Get the top-N most important files for understanding the codebase.
 * Uses reverse-dependency centrality (most depended-on) and entry-point detection.
 */
function getBroadOverviewFiles(index: RepoIndex, graphAnalysis?: GraphAnalysis | null, k = 5): Set<string> {
  const files = new Set<string>()

  // 1. Entry points
  for (const absPath of index.skeletons.keys()) {
    const name = absPath.split('/').pop() ?? ''
    if (ENTRY_POINT_NAMES.has(name)) {
      files.add(absPath)
    }
  }

  // 2. One representative file per graph community (when available)
  if (graphAnalysis && graphAnalysis.communities.length > 1) {
    for (const comm of graphAnalysis.communities) {
      const fileNode = comm.nodes.find(n => n.startsWith('file:') && !parseGraphNodeId(n).symbolPart)
      if (fileNode) {
        const pathPart = parseGraphNodeId(fileNode).pathPart
        for (const absPath of index.skeletons.keys()) {
          if (absPath.endsWith(pathPart)) {
            files.add(absPath)
            break
          }
        }
      }
    }
  }

  // 3. Top-N by reverse dependency count
  const byDepCount = new Map<string, number>()
  for (const [path, rdeps] of index.reverseDeps) {
    byDepCount.set(path, rdeps.size)
  }
  const top = [...byDepCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
  for (const [path] of top) files.add(path)

  return files
}

function buildBroadCommunityOverview(graphAnalysis?: GraphAnalysis | null): string {
  if (!graphAnalysis || graphAnalysis.communities.length < 2) return ''
  const lines = ['## Communities (graph)']
  for (const c of graphAnalysis.communities.slice(0, 8)) {
    lines.push(`- **${c.label}**: ${c.nodes.length} nodes`)
  }
  if (graphAnalysis.communities.length > 8) {
    lines.push(`- ... and ${graphAnalysis.communities.length - 8} more`)
  }
  return lines.join('\n')
}

/**
 * Build a compact module structure listing grouped by top-level directory.
 */
function buildModuleStructureListing(index: RepoIndex, projectRoot: string): string {
  const dirs = new Map<string, Set<string>>()

  for (const absPath of index.skeletons.keys()) {
    const rel = relative(projectRoot, absPath)
    const parts = rel.split('/')
    if (parts.length <= 1) continue // root-level file, skip
    const dir = parts[0] // top-level directory
    const baseName = parts[parts.length - 1]?.replace(/\.[^.]+$/, '') ?? ''
    if (!dirs.has(dir)) dirs.set(dir, new Set())
    dirs.get(dir)?.add(baseName)
  }

  if (dirs.size === 0) return ''

  const lines: string[] = ['## Module Structure']
  for (const [dir, files] of [...dirs.entries()].sort()) {
    const fileList = [...files].sort().slice(0, 8).join(', ')
    const suffix = files.size > 8 ? ` ... +${files.size - 8} more` : ''
    lines.push(`- ${dir}/ (${fileList}${suffix})`)
  }

  return lines.join('\n')
}
