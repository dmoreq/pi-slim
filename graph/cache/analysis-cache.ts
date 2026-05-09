/**
 * In-memory analysis cache for graph analyzers (session-scoped memoization).
 */

export interface AnalysisCache {
  get(key: string): unknown | null
  set(key: string, value: unknown): void
  has(key: string): boolean
  clear(): void
}

export class InMemoryAnalysisCache implements AnalysisCache {
  private cache = new Map<string, unknown>()

  get(key: string): unknown | null {
    return this.cache.get(key) ?? null
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, value)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    this.cache.clear()
  }
}
