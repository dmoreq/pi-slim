import { describe, expect, it, vi } from 'vitest'
import type { GraphAnalysis } from '../../context/graph-types'
import { CommunityPruningPlugin } from '../../plugins/community-pruning-plugin'
import type { GraphService } from '../../services/graph-service'

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeAnalysis(communities: Array<{ id: string; nodes: string[] }>): GraphAnalysis {
  return {
    godNodes: [],
    communities: communities.map(c => ({
      id: c.id,
      label: c.id,
      nodes: c.nodes,
      internalDensity: 0.8,
      externalDensity: 0.1,
      interfaceNodes: [],
      bottlenecks: [],
    })),
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: communities.flatMap(c => c.nodes).length,
      totalEdges: 0,
      godNodeCount: 0,
      communityCount: communities.length,
      averageDegree: 0,
      maxDegree: 0,
      graphDensity: 0,
      avgClusteringCoeff: 0,
      cycleCount: 0,
      bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1.0.0',
  }
}

function makeGraphService(analysis: GraphAnalysis | null): GraphService {
  return { analysis, graph: null } as unknown as GraphService
}

// Two-community graph matching the bridge.ts node-id format
const TWO_COMM_ANALYSIS = makeAnalysis([
  { id: 'comm-auth', nodes: ['file:auth.ts', 'file:auth.ts:authenticate', 'file:user.ts'] },
  { id: 'comm-infra', nodes: ['file:db.ts', 'file:db.ts:query', 'file:logger.ts'] },
])

// ── Constructor & initial state ────────────────────────────────────────────

describe('CommunityPruningPlugin', () => {
  it('exposes name and version', () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(null))
    expect(plugin.name).toBe('community-pruning')
    expect(plugin.version).toBe('1.0.0')
  })

  it('starts with null activeCommunityId', () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(null))
    expect(plugin.activeCommunityId).toBeNull()
  })

  it('resets stats on onSessionStart', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    ;(plugin as any)._pruneCount = 5
    ;(plugin as any)._activeCommunityId = 'comm-auth'
    await plugin.onSessionStart!()
    expect(plugin.getStats()).toEqual({ pruneCount: 0, processedTurns: 0, activeCommunityId: null })
  })

  // ── No-op guards ─────────────────────────────────────────────────────

  it('no-ops when graphService has no analysis', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(null))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'edit auth.ts' },
      { role: 'developer', content: 'old context' },
      { role: 'developer', content: 'new context' },
    ]
    await plugin.onContext!(messages)
    expect(messages).toHaveLength(3)
    expect(plugin.activeCommunityId).toBeNull()
  })

  it('no-ops for single-community graph', async () => {
    const singleComm = makeAnalysis([{ id: 'comm0', nodes: ['file:auth.ts', 'file:db.ts'] }])
    const plugin = new CommunityPruningPlugin(makeGraphService(singleComm))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'edit auth.ts' },
      { role: 'developer', content: 'some context about db.ts' },
      { role: 'developer', content: 'newer context' },
    ]
    await plugin.onContext!(messages)
    expect(messages).toHaveLength(3)
  })

  it('no-ops when messages array has fewer than 3 entries', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'edit auth.ts' },
      { role: 'developer', content: 'context' },
    ]
    await plugin.onContext!(messages)
    expect(messages).toHaveLength(2)
  })

  // ── Community detection ───────────────────────────────────────────────

  it('detects active community from user message file references', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'help me fix auth.ts' },
      { role: 'developer', content: 'context A' },
      { role: 'developer', content: 'context B' },
    ]
    await plugin.onContext!(messages)
    expect(plugin.activeCommunityId).toBe('comm-auth')
  })

  it('detects infra community when db.ts is mentioned', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'add an index to db.ts' },
      { role: 'developer', content: 'context A' },
      { role: 'developer', content: 'context B' },
    ]
    await plugin.onContext!(messages)
    expect(plugin.activeCommunityId).toBe('comm-infra')
  })

  it('leaves activeCommunityId null when no file references match', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'what does this project do?' },
      { role: 'developer', content: 'context A' },
      { role: 'developer', content: 'context B' },
    ]
    await plugin.onContext!(messages)
    expect(plugin.activeCommunityId).toBeNull()
  })

  // ── Pruning behaviour ──────────────────────────────────────────────────

  it('prunes older developer messages outside active community', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'edit auth.ts' },
      // Old injection — only mentions db.ts (infra community)
      { role: 'developer', content: 'Context from db.ts: export function query()' },
      // New injection — mentions auth.ts (auth community) — PRESERVED as latest
      { role: 'developer', content: 'Context from auth.ts: export function authenticate()' },
    ]
    await plugin.onContext!(messages)

    // The old infra-only message should be pruned
    expect(messages.some(m => (m.content as string).includes('db.ts'))).toBe(false)
    // The latest developer message (auth) should be preserved
    expect(messages.some(m => (m.content as string).includes('auth.ts'))).toBe(true)
    expect(plugin.getStats().pruneCount).toBe(1)
  })

  it('always preserves the last developer message regardless of community', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'look at auth.ts' },
      { role: 'developer', content: 'old: only logger.ts context' },
      // Last developer message is infra (not active community) but MUST be kept
      { role: 'developer', content: 'latest: db.ts and logger.ts context' },
    ]
    await plugin.onContext!(messages)

    // Latest dev message must survive even though it's infra, not auth
    expect(messages.some(m => (m.content as string).includes('latest: db.ts'))).toBe(true)
  })

  it('does not prune developer messages that match active community', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'modify auth.ts' },
      { role: 'developer', content: 'Prior context: user.ts exports getUser()' },
      { role: 'developer', content: 'Latest context: auth.ts exports authenticate()' },
    ]
    await plugin.onContext!(messages)
    // Both developer messages mention auth community — neither should be pruned
    expect(messages).toHaveLength(3)
    expect(plugin.getStats().pruneCount).toBe(0)
  })

  it('emits friendly focused-context message when pruning fires', async () => {
    const msgs: string[] = []
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS), () => null, m => msgs.push(m))
    const messages: Record<string, unknown>[] = [
      { role: 'user', content: 'edit auth.ts' },
      { role: 'developer', content: 'Context from db.ts: export function query()' },
      { role: 'developer', content: 'Context from auth.ts: export function authenticate()' },
    ]
    await plugin.onContext!(messages)
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs[0]).toMatch(/Context focused on.*cleared/)
    expect(msgs[0]).not.toMatch(/off-community/)
  })

  it('increments processedTurns on each qualifying call', async () => {
    const plugin = new CommunityPruningPlugin(makeGraphService(TWO_COMM_ANALYSIS))
    const makeMessages = (): Record<string, unknown>[] => [
      { role: 'user', content: 'edit auth.ts' },
      { role: 'developer', content: 'ctx A' },
      { role: 'developer', content: 'ctx B' },
    ]
    await plugin.onContext!(makeMessages())
    await plugin.onContext!(makeMessages())
    expect(plugin.getStats().processedTurns).toBe(2)
  })
})
