import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { RepoMapGenerator } from '../../context/repo-map.js'
import type { RepoIndex } from '../../types.js'

function makeIndex(files: Record<string, string>): RepoIndex {
  const skeletons = new Map(Object.entries(files))
  return {
    skeletons,
    deps: new Map(),
  }
}

describe('RepoMapGenerator', () => {
  it('produces a non-empty map for a single file', () => {
    const index = makeIndex({
      '/project/src/foo.ts': 'export function foo(): void { ... }',
    })
    const gen = new RepoMapGenerator('/project', 4000)
    const map = gen.generate(index)
    expect(map).toContain('foo.ts')
    expect(map).toContain('foo')
  })

  it('groups files by directory', () => {
    const index = makeIndex({
      '/project/src/core/agent.ts': 'export class Agent { ... }',
      '/project/src/utils/helper.ts': 'export function help(): void { ... }',
    })
    const gen = new RepoMapGenerator('/project', 4000)
    const map = gen.generate(index)
    expect(map).toContain('src/core/')
    expect(map).toContain('src/utils/')
  })

  it('wraps output in <repo-map> tags', () => {
    const index = makeIndex({ '/project/src/foo.ts': 'export function foo() { ... }' })
    const gen = new RepoMapGenerator('/project', 4000)
    const map = gen.generate(index)
    expect(map).toMatch(/^<repo-map>/)
    expect(map).toMatch(/<\/repo-map>$/)
  })

  it('respects token budget by trimming entries', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      files[`/project/src/file${i}.ts`] = `export function fn${i}(): void { ... }`
    }
    const index = makeIndex(files)
    const gen = new RepoMapGenerator('/project', 100) // very small budget
    const map = gen.generate(index)
    const estimatedTokens = map.length / 4
    expect(estimatedTokens).toBeLessThanOrEqual(120) // small tolerance
  })

  it('returns empty map for empty index', () => {
    const index = makeIndex({})
    const gen = new RepoMapGenerator('/project', 4000)
    const map = gen.generate(index)
    expect(map).toBe('<repo-map>\n</repo-map>')
  })
})
