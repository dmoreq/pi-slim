import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { produceDefaults } from '../context/schema.js'
import type { ExtensionContext } from '../manager.js'
import { SessionManager } from '../manager.js'

function configFlag(name: string): unknown {
  const d = produceDefaults()
  switch (name) {
    case 'scope.enabled':
      return d.enabled
    case 'scope.maxRepoMapTokens':
      return d.maxRepoMapTokens
    case 'scope.maxInjectionTokens':
      return d.maxInjectionTokens
    case 'scope.scanLastNMessages':
      return d.scanLastNMessages
    case 'scope.contextFiles.enabled':
      return d.contextFiles.enabled
    case 'scope.providerGuidance.enabled':
      return d.providerGuidance.enabled
    default:
      return undefined
  }
}

async function writeFixture(dir: string): Promise<void> {
  await writeFile(
    join(dir, 'api.ts'),
    `
import { authenticate } from './auth'

export function handleRequest(token: string): string {
  return authenticate(token) ? 'ok' : 'unauthorized'
}
`.trimStart()
  )

  await writeFile(
    join(dir, 'auth.ts'),
    `
export function authenticate(token: string): boolean {
  return token.length > 0
}
`.trimStart()
  )
}

describe('SessionManager startup notifications', () => {
  let tmpDir: string
  let notifications: string[]

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pi-startup-notify-'))
    await writeFixture(tmpDir)
    notifications = []
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  function makeCtx(): ExtensionContext {
    return {
      cwd: tmpDir,
      ui: {
        notify: (msg: string) => {
          notifications.push(msg)
        },
        setStatus: vi.fn(),
      },
      hasUI: true,
      getSystemPrompt: () => '',
      sessionManager: { getSessionId: () => 'startup-notify-test' },
    }
  }

  it('emits "Analyzing codebase graph…" then enriched Graph message', async () => {
    const manager = new SessionManager()
    await manager.start(tmpDir, configFlag, makeCtx())

    expect(notifications.some(m => m.includes('Analyzing codebase graph'))).toBe(true)
    expect(notifications.some(m => /Graph: \d+ nodes.*(\d+ms|from cache)/.test(m))).toBe(true)
  })

  it('includes language in fresh-build success message', async () => {
    const manager = new SessionManager()
    await manager.start(tmpDir, configFlag, makeCtx())

    const indexedMsg = notifications.find(m => m.includes('Indexed') || m.includes('Loaded'))
    expect(indexedMsg).toBeDefined()
    expect(indexedMsg).toMatch(/typescript/i)
  })

  it('emits a welcome message with version, file count, and language', async () => {
    const manager = new SessionManager()
    await manager.start(tmpDir, configFlag, makeCtx())

    const welcome = notifications.find(m => m.includes('pi-scope v') && m.includes('active'))
    expect(welcome).toBeDefined()
    expect(welcome).toMatch(/\d+ files/)
  })
})
