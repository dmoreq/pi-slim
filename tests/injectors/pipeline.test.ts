import { describe, it, expect } from 'vitest'
import { InjectionPipeline } from '../../src/injectors/pipeline.js'

describe('InjectionPipeline', () => {
  it('returns empty result when no sources registered', () => {
    const pipeline = new InjectionPipeline()
    const result = pipeline.build()
    expect(result.content).toBe('')
    expect(result.sources).toHaveLength(0)
    expect(result.totalTokens).toBe(0)
  })

  it('builds content from a single source', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({
      name: 'repo-map',
      priority: 1,
      produce: () => '<repo-map>src/</repo-map>',
    })
    const result = pipeline.build()
    expect(result.content).toContain('<repo-map>')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].injected).toBe(true)
    expect(result.totalTokens).toBeGreaterThan(0)
  })

  it('orders output by priority (ascending)', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'low', priority: 5, produce: () => 'low-pri' })
    pipeline.register({ name: 'high', priority: 1, produce: () => 'high-pri' })
    pipeline.register({ name: 'mid', priority: 3, produce: () => 'mid-pri' })

    const result = pipeline.build()
    const parts = result.content.split('\n\n')
    expect(parts[0]).toBe('high-pri')
    expect(parts[1]).toBe('mid-pri')
    expect(parts[2]).toBe('low-pri')
  })

  it('skips sources that produce null', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'a', priority: 1, produce: () => 'content-a' })
    pipeline.register({ name: 'b', priority: 2, produce: () => null })
    pipeline.register({ name: 'c', priority: 3, produce: () => 'content-c' })

    const result = pipeline.build()
    expect(result.content).toContain('content-a')
    expect(result.content).toContain('content-c')
    expect(result.content).not.toContain('content-b')
    expect(result.sources).toHaveLength(2)
  })

  it('trims lowest-priority sources when over budget', () => {
    const pipeline = new InjectionPipeline()
    // Each source produces 48 chars → 12 tokens
    pipeline.register({ name: 'a', priority: 1, produce: () => 'a'.repeat(48) })
    pipeline.register({ name: 'b', priority: 2, produce: () => 'b'.repeat(48) })
    pipeline.register({ name: 'c', priority: 3, produce: () => 'c'.repeat(48) })

    // Budget of 12 tokens ≈ 48 chars → only 'a' fits
    const result = pipeline.build(12)
    expect(result.content).toContain('a'.repeat(48))
    expect(result.content).not.toContain('b')
    expect(result.sources[0].injected).toBe(true)   // a
    expect(result.sources[0].trimmed).toBe(false)
    expect(result.sources[1].injected).toBe(false)  // b trimmed
    expect(result.sources[1].trimmed).toBe(true)
    expect(result.sources[2].injected).toBe(false)  // c trimmed
    expect(result.sources[2].trimmed).toBe(true)
  })

  it('overwrites source with same name on re-register', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'x', priority: 1, produce: () => 'first' })
    pipeline.register({ name: 'x', priority: 1, produce: () => 'second' })
    const result = pipeline.build()
    expect(result.content).toContain('second')
    expect(result.content).not.toContain('first')
    expect(result.sources).toHaveLength(1)
  })

  it('unregister removes a source', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'a', priority: 1, produce: () => 'content' })
    pipeline.register({ name: 'b', priority: 2, produce: () => 'other' })
    pipeline.unregister('a')
    const result = pipeline.build()
    expect(result.content).not.toContain('content')
    expect(result.content).toContain('other')
  })

  it('clear removes all sources', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'a', priority: 1, produce: () => 'content' })
    pipeline.clear()
    expect(pipeline.isEmpty()).toBe(true)
    const result = pipeline.build()
    expect(result.content).toBe('')
  })

  it('isEmpty returns true when no sources', () => {
    const pipeline = new InjectionPipeline()
    expect(pipeline.isEmpty()).toBe(true)
  })

  it('isEmpty returns false when sources exist', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'a', priority: 1, produce: () => 'x' })
    expect(pipeline.isEmpty()).toBe(false)
  })

  it('separates sources with double newlines', () => {
    const pipeline = new InjectionPipeline()
    pipeline.register({ name: 'a', priority: 1, produce: () => 'first' })
    pipeline.register({ name: 'b', priority: 2, produce: () => 'second' })
    const result = pipeline.build()
    expect(result.content).toBe('first\n\nsecond')
  })
})
