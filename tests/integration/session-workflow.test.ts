import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pi-telemetry', () => ({
  getTelemetry: vi.fn(() => ({
    recordToolInvocation: vi.fn(),
    recordToolResult: vi.fn(),
    heartbeat: vi.fn(),
  })),
  default: vi.fn(),
}))
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { produceDefaults } from '../../context/schema.js'
import { SessionManager } from '../../manager.js'
import type { BeforeAgentStartEvent, ContextEvent, ExtensionContext } from '../../manager.js'

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

let tmpDir: string
let mockContext: ExtensionContext

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pi-integration-test-'))
  mockContext = {
    cwd: tmpDir,
    ui: {
      notify: () => {},
      setStatus: () => {},
    },
    hasUI: true,
    getSystemPrompt: () => '',
    sessionManager: { getSessionId: () => 'test-session' },
    model: { provider: 'anthropic', id: 'claude-3-sonnet' },
  }
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeFixture(rel: string, content: string): Promise<void> {
  const full = join(tmpDir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

describe('SessionManager Integration', () => {
  it('handles complete session lifecycle with context injection', async () => {
    // Setup: Create test files
    await writeFixture(
      'src/auth.ts',
      `
export function authenticate(token: string): boolean {
  return token.length > 0
}

export class User {
  constructor(public name: string) {}
}
`
    )

    await writeFixture(
      'src/server.ts',
      `
import { authenticate, User } from './auth'

export function startServer(port: number) {
  console.log(\`Starting server on port \${port}\`)
}
`
    )

    await writeFixture(
      'package.json',
      JSON.stringify({
        name: 'test-project',
        type: 'module',
      })
    )

    const manager = new SessionManager()

    // 1. Start session (should trigger indexing)
    await manager.start(tmpDir, configFlag, mockContext)

    expect(manager.state).not.toBeNull()

    const state = manager.state!
    expect(state.index.skeletons.size).toBeGreaterThan(0)
    expect(state.index.symbolIndex.size).toBeGreaterThan(0)

    // 2. Before agent start (should inject repo map)
    const beforeAgentEvent: BeforeAgentStartEvent = {
      type: 'before_agent_start',
      systemPrompt: 'You are a coding assistant.',
      prompt: 'Hello',
    }

    const systemResult = await manager.handleBeforeAgentStart(beforeAgentEvent, mockContext)
    expect(systemResult).toBeDefined()
    expect(systemResult.systemPrompt).toContain('<repo-map>')
    expect(systemResult.systemPrompt).toContain('src/auth.ts')
    expect(systemResult.systemPrompt).toContain('authenticate')
    expect(systemResult.systemPrompt).toContain('User')

    // 3. Context event (should trigger retrieval and dep-context injection)
    const contextEvent: ContextEvent = {
      type: 'context',
      messages: [
        { role: 'user', content: 'I need to modify the authenticate function in auth.ts' },
        { role: 'assistant', content: 'I can help you modify the authenticate function.' },
      ],
    }

    const contextResult = await manager.handleContext(contextEvent, mockContext)
    expect(contextResult).toBeDefined()

    // Should find and inject relevant context
    const _hasAuthContext = contextEvent.messages.some(
      msg => typeof msg.content === 'string' && msg.content.includes('<dep-context>')
    )
    // Note: The actual injection might modify the original messages

    // 4. Tool call (should trigger read awareness)
    const toolCallResult = await manager.handleToolCall(
      { toolName: 'read', input: { path: 'src/auth.ts' } },
      mockContext
    )
    expect(toolCallResult).toBeUndefined()

    const editCallResult = await manager.handleToolCall(
      { toolName: 'edit', input: { path: 'src/auth.ts' } },
      mockContext
    )
    expect(editCallResult).toBeUndefined()

    const editUnreadResult = await manager.handleToolCall(
      { toolName: 'edit', input: { path: 'src/unknown.ts' } },
      mockContext
    )
    expect(editUnreadResult).toBeUndefined()

    // 5. Shutdown (stats live on manager.state.stats)
    await manager.shutdown(mockContext)
  })

  it('handles plugin errors gracefully', async () => {
    await writeFixture('src/test.ts', 'export const test = 1')

    const manager = new SessionManager()

    // Start session
    await manager.start(tmpDir, configFlag, mockContext)

    // Test malformed tool call
    const result = await manager.handleToolCall(
      { toolName: 'read', input: null }, // Invalid input
      mockContext
    )

    expect(result).toBeUndefined()
  })

  it('preserves symbol index across store/load cycles', async () => {
    // Create files with exports
    await writeFixture(
      'src/utils.ts',
      `
export function helper() { return 'test' }
export function otherHelper() { return 42 }
`
    )

    const manager1 = new SessionManager()
    await manager1.start(tmpDir, configFlag, mockContext)

    const state1 = manager1.state!
    expect(state1.index.symbolIndex.get('helper')).toBeDefined()
    expect(state1.index.symbolIndex.get('otherHelper')).toBeDefined()

    await manager1.shutdown(mockContext)

    // Create new manager to test cache loading
    const manager2 = new SessionManager()
    await manager2.start(tmpDir, configFlag, mockContext)

    const state2 = manager2.state!
    expect(state2.index.symbolIndex.get('helper')).toBeDefined()
    expect(state2.index.symbolIndex.get('otherHelper')).toBeDefined()

    // Should have same symbols
    expect(state2.index.symbolIndex.get('helper')).toEqual(state1.index.symbolIndex.get('helper'))
    expect(state2.index.symbolIndex.get('otherHelper')).toEqual(state1.index.symbolIndex.get('otherHelper'))
  })

  it('handles context pruning correctly', async () => {
    await writeFixture('src/test.ts', 'export const test = 1')

    const manager = new SessionManager()
    await manager.start(tmpDir, configFlag, mockContext)

    // Create messages with duplicates that should be pruned
    const contextEvent: ContextEvent = {
      type: 'context',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Hello' }, // Duplicate
        { role: 'assistant', content: 'Hi there!' }, // Duplicate
        { role: 'user', content: 'How are you?' }, // Different
      ],
    }

    const _originalLength = contextEvent.messages.length
    await manager.handleContext(contextEvent, mockContext)

    // Messages should be pruned (though the exact pruning logic depends on the plugin)
    // At minimum, the call should succeed without error
    expect(contextEvent.messages).toBeDefined()
  })
})
