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

describe('SessionManager shutdown notifications', () => {
  let tmpDir: string
  let notifications: string[]

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pi-shutdown-notify-'))
    await writeFile(
      join(tmpDir, 'index.ts'),
      `export function main(): void { console.log('hi') }`
    )
    notifications = []
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  function makeCtx(): ExtensionContext {
    return {
      cwd: tmpDir,
      ui: {
        notify: (msg: string) => notifications.push(msg),
        setStatus: vi.fn(),
      },
      hasUI: true,
      getSystemPrompt: () => '',
      sessionManager: { getSessionId: () => 'shutdown-test' },
    }
  }

  it('always emits shutdown summary when notifyOnShutdown is enabled', async () => {
    const manager = new SessionManager()
    const ctx = makeCtx()
    await manager.start(tmpDir, configFlag, ctx)
    await manager.shutdown(ctx)
    expect(notifications.some(m => m.includes('Session complete'))).toBe(true)
  })

  it('includes token savings in shutdown when savings > 0', async () => {
    const manager = new SessionManager()
    const ctx = makeCtx()
    await manager.start(tmpDir, configFlag, ctx)
    manager.state!.stats.recordDepContextInjection(['/a.ts'], 100, 700)
    await manager.shutdown(ctx)
    const shutdownMsg = notifications.find(m => m.includes('Session complete'))
    expect(shutdownMsg).toMatch(/\d+t saved \(\d+%\)/)
  })
})
