import { describe, expect, it } from 'vitest'
import { detectCompilerErrorLocations } from '../../shared/compiler-error-locations.js'

describe('detectCompilerErrorLocations', () => {
  it('parses TypeScript tsc parentheses format', () => {
    const text = 'src/app.ts(12,5): error TS2304: Cannot find name'
    const locs = detectCompilerErrorLocations(text, { validateExistence: false })
    expect(locs).toHaveLength(1)
    expect(locs[0].path).toContain('app.ts')
    expect(locs[0].startLine).toBe(12)
    expect(locs[0].startColumn).toBe(4)
  })

  it('parses colon-separated error format', () => {
    const text = 'lib/util.ts:3:10 - error TS1005: expected'
    const locs = detectCompilerErrorLocations(text, { validateExistence: false })
    expect(locs).toHaveLength(1)
    expect(locs[0].startLine).toBe(3)
    expect(locs[0].startColumn).toBe(9)
  })

  it('parses rustc arrow format', () => {
    const text = 'error[E0425]: not found\n  --> src/main.rs:8:3'
    const locs = detectCompilerErrorLocations(text, { validateExistence: false })
    expect(locs).toHaveLength(1)
    expect(locs[0].path).toContain('main.rs')
    expect(locs[0].startLine).toBe(8)
    expect(locs[0].startColumn).toBe(2)
  })

  it('deduplicates identical locations', () => {
    const text = [
      'src/a.ts(1,1): error TS1: x',
      'src/a.ts(1,1): error TS2: y',
    ].join('\n')
    const locs = detectCompilerErrorLocations(text, { validateExistence: false })
    expect(locs).toHaveLength(1)
  })
})
