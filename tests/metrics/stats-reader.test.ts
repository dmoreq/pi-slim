import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { readRecentSessions, summarizeTrend } from '../../metrics/stats-reader.js'
import type { SessionRecord } from '../../metrics/tracker.js'

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 's1',
    startedAt: '2026-05-01T10:00:00.000Z',
    endedAt: '2026-05-01T11:00:00.000Z',
    indexSource: 'cache',
    indexedFiles: 10,
    depEdges: 5,
    repoMapTokens: 100,
    depContextTriggers: 2,
    depContextTotalTokens: 200,
    uniqueFilesInjected: 3,
    topFiles: [],
    contextFilesTokens: 0,
    contextFilesCount: 0,
    providerGuidanceTokens: 0,
    providerGuidanceCount: 0,
    graphInsightsTokens: 50,
    intelligenceTokens: 30,
    smartDepContextTokens: 20,
    totalTokensSaved: 1000,
    savingsRatio: 0.5,
    totalInjectionTokens: 400,
    ...overrides,
  }
}

describe('stats-reader', () => {
  it('readRecentSessions returns empty when file missing', async () => {
    const dir = join(tmpdir(), `pi-scope-stats-${Date.now()}`)
    await mkdir(join(dir, '.pi', 'pi-scope'), { recursive: true })
    const sessions = await readRecentSessions(dir, 5)
    expect(sessions).toEqual([])
  })

  it('readRecentSessions parses lines and skips corrupt entries', async () => {
    const dir = join(tmpdir(), `pi-scope-stats-${Date.now()}-b`)
    const scopePath = join(dir, '.pi', 'pi-scope')
    await mkdir(scopePath, { recursive: true })
    const lines = [
      JSON.stringify(makeRecord({ sessionId: 'a', totalTokensSaved: 100 })),
      'not json',
      JSON.stringify(makeRecord({ sessionId: 'b', totalTokensSaved: 200 })),
      JSON.stringify(makeRecord({ sessionId: 'c', totalTokensSaved: 300 })),
    ]
    await writeFile(join(scopePath, 'stats.jsonl'), lines.join('\n') + '\n', 'utf-8')

    const sessions = await readRecentSessions(dir, 2)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].sessionId).toBe('c')
    expect(sessions[1].sessionId).toBe('b')
  })

  it('summarizeTrend computes averages', () => {
    const trend = summarizeTrend([
      makeRecord({ depContextTriggers: 2, totalTokensSaved: 100, savingsRatio: 0.4, totalInjectionTokens: 400 }),
      makeRecord({ depContextTriggers: 4, totalTokensSaved: 200, savingsRatio: 0.6, totalInjectionTokens: 600 }),
    ])
    expect(trend.averages.depContextTriggers).toBe(3)
    expect(trend.averages.totalTokensSaved).toBe(150)
    expect(trend.averages.savingsRatio).toBe(0.5)
    expect(trend.averages.totalInjectionTokens).toBe(500)
  })

  it('summarizeTrend handles empty input', () => {
    const trend = summarizeTrend([])
    expect(trend.sessions).toEqual([])
    expect(trend.averages.totalTokensSaved).toBe(0)
  })
})
