import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { ContextInjector } from '../../context/dep-context.js'
import type { RepoIndex } from '../../types.js'

const ROOT = '/project'
const FOO = join(ROOT, 'src/foo.ts')
const BAR = join(ROOT, 'src/bar.ts')
const BAZ = join(ROOT, 'src/baz.ts')

function makeIndex(overrides: Partial<RepoIndex> = {}): RepoIndex {
  return {
    skeletons: new Map([
      [FOO, 'export function foo(): void { ... }'],
      [BAR, 'export function bar(): string { ... }'],
      [BAZ, 'export function baz(): number { ... }'],
    ]),
    deps: new Map([
      [FOO, new Set([BAR])],
      [BAR, new Set()],
      [BAZ, new Set()],
    ]),
    ...overrides,
  }
}

describe('ContextInjector', () => {
  it('detects file paths mentioned in messages', () => {
    const injector = new ContextInjector(ROOT, 8000, 10)
    const messages = [{ role: 'user', content: 'Please edit src/foo.ts' }]
    const result = injector.buildInjection(makeIndex(), messages as never)
    expect(result).toContain('foo.ts')
    expect(result).toContain('foo()')
  })

  it('includes 1st-degree dependencies of in-focus files', () => {
    const injector = new ContextInjector(ROOT, 8000, 10)
    const messages = [{ role: 'user', content: 'Edit src/foo.ts' }]
    const result = injector.buildInjection(makeIndex(), messages as never)
    expect(result).toContain('bar.ts')
    expect(result).toContain('bar()')
  })

  it('does not duplicate files already in active section', () => {
    const injector = new ContextInjector(ROOT, 8000, 10)
    const messages = [{ role: 'user', content: 'Edit src/foo.ts and src/bar.ts' }]
    const result = injector.buildInjection(makeIndex(), messages as never)
    const count = (result.match(/bar\.ts/g) ?? []).length
    expect(count).toBe(1)
  })

  it('returns empty string when no files are in focus', () => {
    const injector = new ContextInjector(ROOT, 8000, 10)
    const messages = [{ role: 'user', content: 'Hello!' }]
    const result = injector.buildInjection(makeIndex(), messages as never)
    expect(result).toBe('')
  })

  it('wraps output in <dep-context> tags', () => {
    const injector = new ContextInjector(ROOT, 8000, 10)
    const messages = [{ role: 'user', content: 'Edit src/foo.ts' }]
    const result = injector.buildInjection(makeIndex(), messages as never)
    expect(result).toMatch(/^<dep-context>/)
    expect(result).toMatch(/<\/dep-context>$/)
  })

  it('respects scanLastNMessages limit', () => {
    const injector = new ContextInjector(ROOT, 8000, 1)
    const messages = [
      { role: 'user', content: 'Edit src/baz.ts' },
      { role: 'user', content: 'Hello' },
    ]
    const result = injector.buildInjection(makeIndex(), messages as never)
    expect(result).toBe('')
  })
})
