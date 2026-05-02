import { describe, it, expect } from 'vitest'
import { TypeScriptParser } from '../../src/parsers/typescript-parser.js'

const parser = new TypeScriptParser()

describe('TypeScriptParser', () => {
  it('declares .ts and .tsx extensions', () => {
    expect(parser.extensions).toContain('.ts')
    expect(parser.extensions).toContain('.tsx')
  })

  it('extracts function declaration skeleton', () => {
    const result = parser.parseFile('/src/foo.ts', `
export function greet(name: string): string {
  return 'Hello ' + name
}
`)
    expect(result.skeleton).toContain('greet')
    expect(result.skeleton).toContain('{ ... }')
    expect(result.skeleton).not.toContain("return 'Hello'")
  })

  it('extracts class declaration skeleton', () => {
    const result = parser.parseFile('/src/foo.ts', `
export class Agent {
  private name: string
  constructor(name: string) { this.name = name }
  run(): void { console.log(this.name) }
}
`)
    expect(result.skeleton).toContain('Agent')
    expect(result.skeleton).toContain('{ ... }')
    expect(result.skeleton).not.toContain('console.log')
  })

  it('extracts interface skeleton', () => {
    const result = parser.parseFile('/src/foo.ts', `
export interface Config {
  name: string
  timeout: number
}
`)
    expect(result.skeleton).toContain('Config')
    expect(result.skeleton).toContain('{ ... }')
    expect(result.skeleton).not.toContain('name: string')
  })

  it('extracts type alias skeleton', () => {
    const result = parser.parseFile('/src/foo.ts', `
export type Status = 'idle' | 'running' | 'done'
`)
    expect(result.skeleton).toContain('Status')
    // union type alias has no body to elide — full RHS is part of the signature
  })

  it('extracts relative imports', () => {
    const result = parser.parseFile('/src/foo.ts', `
import { bar } from './bar'
import { baz } from '../utils/baz'
import { something } from 'external-pkg'
`)
    expect(result.imports).toContain('./bar')
    expect(result.imports).toContain('../utils/baz')
    expect(result.imports).toContain('external-pkg')
  })

  it('computes a non-empty contentHash', () => {
    const result = parser.parseFile('/src/foo.ts', 'export const x = 1')
    expect(result.contentHash).toHaveLength(64) // SHA-256 hex
  })

  it('sets the correct path', () => {
    const result = parser.parseFile('/src/foo.ts', 'export const x = 1')
    expect(result.path).toBe('/src/foo.ts')
  })
})
