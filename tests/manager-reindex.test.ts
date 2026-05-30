import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watcherCallbacks: Array<(eventType: string, filename?: string | Buffer) => void> = []
const watcherCloses: Array<ReturnType<typeof vi.fn>> = []

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: vi.fn((_path: string, _options: object, listener: (eventType: string, filename?: string | Buffer) => void) => {
      watcherCallbacks.push(listener)
      const close = vi.fn()
      watcherCloses.push(close)
      return { close }
    }),
  }
})

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { produceDefaults } from '../context/schema.js'
import type { ExtensionContext } from '../manager.js'
import { SessionManager } from '../manager.js'

const DEFAULT_CONFIG = produceDefaults()

function configFlag(name: string): unknown {
  const d = DEFAULT_CONFIG
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

function ctxStub(cwd: string): ExtensionContext {
  return {
    cwd,
    ui: { notify: () => {}, setStatus: () => {} },
    hasUI: true,
    getSystemPrompt: () => '',
    sessionManager: { getSessionId: () => 'reindex-test-session' },
    model: { provider: 'anthropic', id: 'claude-3-sonnet' },
  }
}

async function writeFixture(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('SessionManager auto reindex', () => {
  let tmpDir: string
  let ctx: ExtensionContext

  beforeEach(async () => {
    watcherCallbacks.length = 0
    watcherCloses.length = 0
    tmpDir = await mkdtemp(join(tmpdir(), 'pi-reindex-test-'))
    ctx = ctxStub(tmpDir)

    await writeFixture(
      tmpDir,
      'src/auth.ts',
      `
export function authenticate(token: string): boolean {
  return token.length > 0
}
`
    )
    await writeFixture(
      tmpDir,
      'package.json',
      JSON.stringify({
        name: 'reindex-test-project',
        type: 'module',
      })
    )
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds instead of using a stale cached index on startup', async () => {
    const manager1 = new SessionManager()
    await manager1.start(tmpDir, configFlag, ctx)
    await manager1.shutdown(ctx)

    const storePath = join(tmpDir, '.pi', 'pi-scope', 'index.json.gz')
    const compressed = await readFile(storePath)
    const stored = JSON.parse(gunzipSync(compressed).toString('utf-8'))
    stored.builtAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    await writeFile(storePath, gzipSync(JSON.stringify(stored)))

    const manager2 = new SessionManager()
    await manager2.start(tmpDir, configFlag, ctx)

    expect(manager2.state).not.toBeNull()
    expect(manager2.state?.stats.indexSource).toBe('fresh')
    expect(manager2.state?.stats.indexAge).toBe(0)
  })

  it('reindexes after watched file changes and resets one-time injections', async () => {
    const manager = new SessionManager()
    await manager.start(tmpDir, configFlag, ctx)
    await manager.handleBeforeAgentStart(
      {
        type: 'before_agent_start',
        systemPrompt: 'You are a coding assistant.',
        prompt: 'edit the authenticate function',
      },
      ctx
    )

    expect(manager.state?.repoMapInjected).toBe(true)
    expect(watcherCallbacks).toHaveLength(1)

    await writeFixture(tmpDir, 'src/new-file.ts', 'export const newlyIndexed = 1\n')
    watcherCallbacks[0]('change', 'src/new-file.ts')

    await new Promise(resolve => setTimeout(resolve, 700))

    expect(manager.state?.index.skeletons.size).toBe(2)
    expect(manager.state?.index.skeletons.has(join(tmpDir, 'src/new-file.ts'))).toBe(true)
    expect(manager.state?.repoMapInjected).toBe(false)

    await manager.shutdown(ctx)
    expect(watcherCloses[0]).toHaveBeenCalledTimes(1)
  })
})
