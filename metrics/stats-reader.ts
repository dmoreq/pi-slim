/**
 * Read and summarize historical session records from stats.jsonl.
 */

import { readFile } from 'node:fs/promises'
import { scopeDir } from '../shared/paths.js'
import { PathUtils } from '../shared/utils/path-utils.js'
import type { SessionRecord } from './tracker.js'

export interface StatsTrend {
  sessions: SessionRecord[]
  averages: {
    depContextTriggers: number
    totalTokensSaved: number
    savingsRatio: number
    totalInjectionTokens: number
  }
}

export async function readRecentSessions(projectRoot: string, limit = 5): Promise<SessionRecord[]> {
  const path = PathUtils.joinSafe(scopeDir(projectRoot), 'stats.jsonl')
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return []
  }

  const lines = raw.split('\n').filter(l => l.trim().length > 0)
  const records: SessionRecord[] = []

  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as SessionRecord)
    } catch {
      // skip corrupt lines
    }
  }

  return records.slice(-limit).reverse()
}

export function summarizeTrend(sessions: SessionRecord[]): StatsTrend {
  if (sessions.length === 0) {
    return {
      sessions: [],
      averages: {
        depContextTriggers: 0,
        totalTokensSaved: 0,
        savingsRatio: 0,
        totalInjectionTokens: 0,
      },
    }
  }

  const n = sessions.length
  const sum = sessions.reduce(
    (acc, s) => ({
      depContextTriggers: acc.depContextTriggers + s.depContextTriggers,
      totalTokensSaved: acc.totalTokensSaved + s.totalTokensSaved,
      savingsRatio: acc.savingsRatio + s.savingsRatio,
      totalInjectionTokens: acc.totalInjectionTokens + (s.totalInjectionTokens ?? 0),
    }),
    { depContextTriggers: 0, totalTokensSaved: 0, savingsRatio: 0, totalInjectionTokens: 0 }
  )

  return {
    sessions,
    averages: {
      depContextTriggers: Math.round((sum.depContextTriggers / n) * 10) / 10,
      totalTokensSaved: Math.round(sum.totalTokensSaved / n),
      savingsRatio: Math.round((sum.savingsRatio / n) * 100) / 100,
      totalInjectionTokens: Math.round(sum.totalInjectionTokens / n),
    },
  }
}
