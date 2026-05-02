export interface FileIndex {
  path: string
  skeleton: string
  imports: string[]
  contentHash: string
}

export interface RepoIndex {
  skeletons: Map<string, string>
  deps: Map<string, Set<string>>
  reverseDeps: Map<string, Set<string>>
}

export interface SmartContextConfig {
  enabled: boolean
  maxRepoMapTokens: number
  maxInjectionTokens: number
  scanLastNMessages: number
  exclude: string[]
}

export const DEFAULT_CONFIG: SmartContextConfig = {
  enabled: true,
  maxRepoMapTokens: 4000,
  maxInjectionTokens: 8000,
  scanLastNMessages: 10,
  exclude: ['**/node_modules/**', '**/.git/**', '**/.pi-cache/**', '**/dist/**'],
}

export interface CacheFile {
  version: number
  entries: Record<string, FileIndex>
}

export const CACHE_VERSION = 1
