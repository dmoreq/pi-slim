import { describe, expect, it } from 'vitest'
import {
  basenameFromNodeId,
  extractSymbolFromHoverText,
  godNodeMatchesFilePath,
  parseGraphNodeId,
  symbolFromNodeId,
} from '../../context/graph-node-id'
import type { GodNode } from '../../context/graph-types'

describe('graph-node-id', () => {
  it('parses file-only node ids', () => {
    expect(parseGraphNodeId('file:src/auth.ts')).toEqual({ pathPart: 'src/auth.ts' })
  })

  it('parses file + symbol node ids', () => {
    expect(parseGraphNodeId('file:src/auth.ts:authenticate')).toEqual({
      pathPart: 'src/auth.ts',
      symbolPart: 'authenticate',
    })
  })

  it('extracts basename and symbol', () => {
    expect(basenameFromNodeId('file:context/auth.ts')).toBe('auth.ts')
    expect(symbolFromNodeId('file:context/auth.ts:authenticate')).toBe('authenticate')
  })

  it('matches god node file paths by relative path', () => {
    const gn: GodNode = {
      nodeId: 'file:src/auth.ts',
      label: 'auth',
      inDegree: 3,
      outDegree: 1,
      betweenness: 0,
      pageRank: 0,
      community: 'c0',
      criticality: 'IMPORTANT',
    }
    expect(godNodeMatchesFilePath('src/auth.ts', gn)).toBe(true)
    expect(godNodeMatchesFilePath('other/auth.ts', gn)).toBe(false)
  })

  it('extracts symbol from TypeScript hover text', () => {
    expect(extractSymbolFromHoverText('(method) authenticate(token: string): boolean')).toBe('authenticate')
    expect(extractSymbolFromHoverText('function validateToken(x: string): void')).toBe('validateToken')
  })
})
