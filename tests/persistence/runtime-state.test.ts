import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readState, writeState, readStateSync, writeStateSync, removeState } from '../../src/persistence/runtime-state.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-state-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('state persistence (async)', () => {
  it('writes and reads state', async () => {
    await writeState(tmpDir, { counter: 5, enabled: true })
    const state = await readState(tmpDir)
    expect(state).toEqual({ counter: 5, enabled: true })
  })

  it('returns null when no state file exists', async () => {
    const state = await readState(tmpDir)
    expect(state).toBeNull()
  })

  it('overwrites existing state', async () => {
    await writeState(tmpDir, { counter: 1 })
    await writeState(tmpDir, { counter: 2 })
    const state = await readState(tmpDir)
    expect(state?.counter).toBe(2)
  })

  it('writes to correct path', async () => {
    await writeState(tmpDir, { foo: 'bar' })
    const raw = await readFile(join(tmpDir, '.pi', 'slim', 'state.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ foo: 'bar' })
  })

  it('removes state file', async () => {
    await writeState(tmpDir, { temp: true })
    await removeState(tmpDir)
    const state = await readState(tmpDir)
    expect(state).toBeNull()
  })
})

describe('state persistence (sync)', () => {
  it('writes and reads state synchronously', () => {
    writeStateSync(tmpDir, { mode: 'sync', count: 42 })
    const state = readStateSync(tmpDir)
    expect(state).toEqual({ mode: 'sync', count: 42 })
  })

  it('returns null when no state file exists (sync)', () => {
    const state = readStateSync(tmpDir)
    expect(state).toBeNull()
  })

  it('handles complex nested state', () => {
    const complex = {
      lastSession: {
        sessionId: 'abc-123',
        indexedFiles: 150,
        depContextTriggers: 12,
      },
      buildInfo: {
        version: 1,
        builtAt: '2026-05-03T00:00:00.000Z',
      },
    }
    writeStateSync(tmpDir, complex)
    const state = readStateSync<typeof complex>(tmpDir)
    expect(state?.lastSession.sessionId).toBe('abc-123')
    expect(state?.buildInfo.version).toBe(1)
  })
})
