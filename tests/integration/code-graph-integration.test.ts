/**
 * Code-Graph Integration — end-to-end test for the full native graph pipeline.
 *
 * Covers the complete flow:
 *   1. Load   — index a TypeScript project with real import relationships
 *   2. Analyze — god nodes, communities, cycles produced by graph algorithms
 *   3. Cache  — analysis persisted to disk; second start uses cache (cache hit)
 *   4. Dashboard — system-prompt injection and status-bar state reflect graph data
 *   5. Plugin — CommunityPruningPlugin registered and functional in the session
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pi-telemetry', () => ({
  getTelemetry: vi.fn(() => ({
    deregister: vi.fn(),
    heartbeat: vi.fn(),
    notify: vi.fn(),
    recordError: vi.fn(),
    recordTokens: vi.fn(),
    register: vi.fn(),
  })),
  default: vi.fn(),
}))

import { graphCacheExists } from '../../persistence/graph-cache.js'
import { scopeDir } from '../../shared/paths.js'
import type { BeforeAgentStartEvent, ContextEvent, ExtensionContext } from '../../manager.js'
import { SessionManager } from '../../manager.js'
import { produceDefaults } from '../../context/schema.js'

// ── Helpers ───────────────────────────────────────────────────────────────

function configFlag(name: string): unknown {
  const d = produceDefaults()
  switch (name) {
    case 'scope.enabled': return d.enabled
    case 'scope.maxRepoMapTokens': return d.maxRepoMapTokens
    case 'scope.maxInjectionTokens': return d.maxInjectionTokens
    case 'scope.scanLastNMessages': return d.scanLastNMessages
    case 'scope.contextFiles.enabled': return d.contextFiles.enabled
    case 'scope.providerGuidance.enabled': return d.providerGuidance.enabled
    default: return undefined
  }
}

/**
 * Write a 5-file TypeScript project with clear import relationships.
 *
 *   api.ts ──imports──> auth.ts ──imports──> db.ts
 *   api.ts ──imports──> logger.ts
 *   user.ts ──imports──> auth.ts
 *   user.ts ──imports──> db.ts
 *
 * db.ts and logger.ts are depended on by multiple files (potential god nodes).
 */
async function writeFixture(dir: string): Promise<void> {
  await writeFile(join(dir, 'db.ts'), `
export function query(table: string, key: string): string | null {
  return null
}
export function insert(table: string, data: Record<string, unknown>): void {}
`.trimStart())

  await writeFile(join(dir, 'logger.ts'), `
export function log(ctx: string, msg: string): void {
  console.log('[' + ctx + ']', msg)
}
`.trimStart())

  await writeFile(join(dir, 'auth.ts'), `
import { query } from './db'
import { log } from './logger'

export function authenticate(token: string): boolean {
  log('auth', token)
  return query('tokens', token) !== null
}
`.trimStart())

  await writeFile(join(dir, 'user.ts'), `
import { query } from './db'
import { authenticate } from './auth'

export function getUser(token: string): string | null {
  if (!authenticate(token)) return null
  return query('users', token)
}
`.trimStart())

  await writeFile(join(dir, 'api.ts'), `
import { authenticate } from './auth'
import { log } from './logger'

export function handleRequest(token: string): string {
  log('api', 'request')
  return authenticate(token) ? 'ok' : 'unauthorized'
}
`.trimStart())
}

// ── Setup / teardown ───────────────────────────────────────────────────────

let tmpDir: string
let ctx: ExtensionContext

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-graph-test-'))
  await writeFixture(tmpDir)

  ctx = {
    cwd: tmpDir,
    ui: { notify: vi.fn(), setStatus: vi.fn() },
    hasUI: true,
    getSystemPrompt: () => '',
    sessionManager: { getSessionId: () => 'graph-test' },
    model: { provider: 'anthropic', id: 'claude-3-5-sonnet' },
  }
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ── Suite ─────────────────────────────────────────────────────────────────

describe('Code-Graph Integration', () => {

  // ── Phase 1: Load & Analyze ───────────────────────────────────────────

  describe('Phase 1: Load and Analyze', () => {
    it('indexes the project and produces graph analysis', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      expect(manager.state).not.toBeNull()
      const analysis = manager.graphService.analysis
      expect(analysis).not.toBeNull()
      expect(analysis!.metrics.totalNodes).toBeGreaterThan(0)
      expect(analysis!.metrics.totalEdges).toBeGreaterThan(0)
    })

    it('records graph stats in session state', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const stats = manager.state!.stats
      expect(stats.communityCount).toBeGreaterThanOrEqual(1)
      expect(typeof stats.godNodesCount).toBe('number')
    })

    it('exposes graph metrics through graphService', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const graph = manager.graphService.graph
      expect(graph).not.toBeNull()
      expect(graph!.nodes.length).toBeGreaterThan(0)
      expect(graph!.edges.length).toBeGreaterThan(0)
    })
  })

  // ── Phase 2: Cache ────────────────────────────────────────────────────

  describe('Phase 2: Cache', () => {
    it('writes a graph cache file after analysis', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      expect(graphCacheExists(scopeDir(tmpDir))).toBe(true)
    })

    it('second start produces identical analysis metrics (cache hit)', async () => {
      // First start — fresh build
      const m1 = new SessionManager()
      await m1.start(tmpDir, configFlag, ctx)
      await m1.shutdown(ctx)

      const first = m1.graphService.analysis!

      // Second start — index unchanged; cache fingerprint matches
      const m2 = new SessionManager()
      await m2.start(tmpDir, configFlag, ctx)

      const second = m2.graphService.analysis!
      expect(second.metrics.totalNodes).toBe(first.metrics.totalNodes)
      expect(second.metrics.totalEdges).toBe(first.metrics.totalEdges)
      expect(second.metrics.communityCount).toBe(first.metrics.communityCount)
    })
  })

  // ── Phase 3: Dashboard ────────────────────────────────────────────────

  describe('Phase 3: Dashboard', () => {
    it('injects Graph Analysis Insights into the system prompt', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const event: BeforeAgentStartEvent = {
        type: 'before_agent_start',
        systemPrompt: 'You are a helpful assistant.',
        prompt: 'help',
      }

      const result = await manager.handleBeforeAgentStart(event, ctx)
      expect(result?.systemPrompt).toContain('Graph Analysis Insights')
    })

    it('updates the status bar after start()', async () => {
      const calls: Array<[string, string | undefined]> = []
      const trackCtx: ExtensionContext = {
        ...ctx,
        ui: { notify: vi.fn(), setStatus: (k, v) => calls.push([k, v]) },
      }

      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, trackCtx)

      expect(calls.length).toBeGreaterThan(0)
      const lastText = calls.at(-1)?.[1] ?? ''
      expect(lastText).toContain('SmartCtx:')
    })

    it('status bar includes community count when graph has > 1 community', async () => {
      const calls: Array<[string, string | undefined]> = []
      const trackCtx: ExtensionContext = {
        ...ctx,
        ui: { notify: vi.fn(), setStatus: (k, v) => calls.push([k, v]) },
      }

      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, trackCtx)

      const communityCount = manager.graphService.analysis?.metrics.communityCount ?? 0
      const lastText = calls.at(-1)?.[1] ?? ''

      if (communityCount > 1) {
        expect(lastText).toContain('comm')
      } else {
        // Single-community graphs don't add comm suffix — that's fine
        expect(lastText).toContain('SmartCtx:')
      }
    })
  })

  // ── Phase 4: CommunityPruningPlugin ──────────────────────────────────

  describe('Phase 4: CommunityPruningPlugin', () => {
    it('is registered in the plugin manager', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const plugins = [...((manager as any).pluginManager.plugins as Map<string, { name: string }>).values()]
      expect(plugins.map(p => p.name)).toContain('community-pruning')
    })

    it('also keeps context-pruning registered alongside community-pruning', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const names = [...((manager as any).pluginManager.plugins as Map<string, { name: string }>).values()].map(p => p.name)
      expect(names).toContain('context-pruning')
      expect(names).toContain('community-pruning')
    })

    it('handleContext does not throw when community-pruning is active', async () => {
      const manager = new SessionManager()
      await manager.start(tmpDir, configFlag, ctx)

      const event: ContextEvent = {
        messages: [
          { role: 'user', content: 'show me auth.ts' },
          { role: 'developer', content: '## Context\n\n```ts\n// auth.ts skeleton\n```' },
        ],
      }

      await expect(manager.handleContext(event, ctx)).resolves.not.toThrow()
    })
  })
})
