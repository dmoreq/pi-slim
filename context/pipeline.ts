import type { ContextInsights } from '../shared/intelligence-types.js'
/**
 * Injection Pipeline — orchestrates all context injection sources.
 *
 * Collects multiple sources (repo-map, context-files, provider-guidance,
 * dep-context), orders by priority, trims to a shared token budget,
 * and produces a single combined block for system prompt injection.
 *
 * Enhanced helpers (`buildEnhancedDependencyContext`, `enhanceRepoMapWithGraphPriorities`)
 * layer graph + conversation intelligence without changing the legacy `register` / `build` flow.
 */
import { estimateTokens } from '../shared/token.js'
import type { GraphAnalysis } from './graph-types.js'
import { SmartDependencyContextGenerator } from './smart-dep-context.js'
import { SmartRepositoryMapGenerator } from './smart-repo-map.js'

// ── Types ─────────────────────────────────────────────────────────────────

export interface PipelineSource {
  name: string
  priority: number
  produce(): string | null
}

export interface PipelineBuildResult {
  content: string
  sources: Array<{
    name: string
    injected: boolean
    tokens: number
    trimmed: boolean
  }>
  totalTokens: number
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export class InjectionPipeline {
  private readonly smartDependencyContext = new SmartDependencyContextGenerator()
  private readonly smartRepositoryMap = new SmartRepositoryMapGenerator()
  private sources: PipelineSource[] = []

  /** Graph- and insight-aware dependency context (optional; callers still use `register` for injection). */
  buildEnhancedDependencyContext(insights: ContextInsights, graphAnalysis: GraphAnalysis | null): string {
    return this.smartDependencyContext.generateEnhancedDependencyContext(insights, graphAnalysis)
  }

  /** Prefix repo-map with high-value graph navigation hints when analysis is available. */
  enhanceRepoMapWithGraphPriorities(
    baseRepoMap: string,
    insights: ContextInsights,
    graphAnalysis: GraphAnalysis | null
  ): string {
    return this.smartRepositoryMap.generatePrioritizedRepoMap(baseRepoMap, insights, graphAnalysis)
  }

  register(source: PipelineSource): void {
    const existing = this.sources.findIndex(s => s.name === source.name)
    if (existing >= 0) {
      this.sources[existing] = source
    } else {
      this.sources.push(source)
    }
  }

  unregister(name: string): void {
    this.sources = this.sources.filter(s => s.name !== name)
  }

  isEmpty(): boolean {
    return this.sources.length === 0
  }

  clear(): void {
    this.sources = []
  }

  build(maxTokens?: number): PipelineBuildResult {
    if (this.sources.length === 0) {
      return { content: '', sources: [], totalTokens: 0 }
    }

    const entries: Array<{
      source: PipelineSource
      content: string
      tokens: number
    }> = []

    for (const source of this.sources) {
      const content = source.produce()
      if (!content) continue
      entries.push({ source, content, tokens: estimateTokens(content) })
    }

    if (entries.length === 0) {
      return { content: '', sources: [], totalTokens: 0 }
    }

    entries.sort((a, b) => a.source.priority - b.source.priority)

    const budget = maxTokens ?? Number.POSITIVE_INFINITY
    const parts: string[] = []
    let totalTokens = 0
    const sourceStats: Array<{
      name: string
      injected: boolean
      tokens: number
      trimmed: boolean
    }> = []

    for (const entry of entries) {
      const wouldBe = totalTokens + entry.tokens

      if (wouldBe > budget && parts.length > 0) {
        sourceStats.push({
          name: entry.source.name,
          injected: false,
          tokens: entry.tokens,
          trimmed: true,
        })
        continue
      }

      parts.push(entry.content)
      totalTokens = wouldBe
      sourceStats.push({
        name: entry.source.name,
        injected: true,
        tokens: entry.tokens,
        trimmed: false,
      })
    }

    return {
      content: parts.join('\n\n'),
      sources: sourceStats,
      totalTokens,
    }
  }
}
