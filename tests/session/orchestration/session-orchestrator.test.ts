import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionOrchestrator } from '../../../session/orchestration/session-orchestrator.js'
import type { StateManager } from '../../../session/state/state-manager.js'
import type { ConfigManager } from '../../../session/configuration/config-manager.js'
import type { NotificationService } from '../../../session/notifications/notification-service.js'

describe('SessionOrchestrator', () => {
  let orchestrator: SessionOrchestrator
  let mockStateManager: StateManager
  let mockConfigManager: ConfigManager
  let mockNotificationService: NotificationService

  beforeEach(() => {
    mockStateManager = {
      getState: vi.fn(),
      updateState: vi.fn(),
      clearState: vi.fn(),
    } as any

    mockConfigManager = {
      loadConfig: vi.fn(),
      getConfig: vi.fn(),
    } as any

    mockNotificationService = {
      notify: vi.fn(),
      setStatus: vi.fn(),
    } as any

    orchestrator = new SessionOrchestrator(
      mockStateManager,
      mockConfigManager,
      mockNotificationService,
    )
  })

  it('should start session successfully', async () => {
    const mockConfig = { projectRoot: '/test' }
    mockConfigManager.loadConfig.mockResolvedValue(mockConfig)
    mockStateManager.getState.mockReturnValue(null)

    const result = await orchestrator.start('/test')

    expect(mockConfigManager.loadConfig).toHaveBeenCalledWith('/test')
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      'Session started successfully',
    )
    expect(result).toBe(true)
  })

  it('should update state during startup', async () => {
    const mockConfig = { projectRoot: '/test', enabled: true }
    mockConfigManager.loadConfig.mockResolvedValue(mockConfig)

    await orchestrator.start('/test')

    expect(mockStateManager.updateState).toHaveBeenCalledWith({
      projectRoot: '/test',
      config: mockConfig,
      initialized: true,
    })
  })

  it('should stop session and clear state', async () => {
    await orchestrator.stop()

    expect(mockStateManager.clearState).toHaveBeenCalled()
    expect(mockNotificationService.notify).toHaveBeenCalledWith('Session stopped')
  })

  it('should handle context when initialized', async () => {
    mockStateManager.getState.mockReturnValue({ initialized: true })

    const result = await orchestrator.handleContext(['message1'])

    expect(result).toBe('Context processed successfully')
  })

  it('should throw error when handling context without initialization', async () => {
    mockStateManager.getState.mockReturnValue({ initialized: false })

    await expect(orchestrator.handleContext(['message1'])).rejects.toThrow(
      'Session not initialized',
    )
  })

  it('should return session statistics', () => {
    const stats = orchestrator.getSessionStats()

    expect(stats).toHaveProperty('startTime')
    expect(stats).toHaveProperty('requestCount')
    expect(stats).toHaveProperty('errorCount')
    expect(typeof stats.startTime).toBe('object')
    expect(typeof stats.requestCount).toBe('number')
    expect(typeof stats.errorCount).toBe('number')
  })

  it('should increment error count on startup failure', async () => {
    mockConfigManager.loadConfig.mockRejectedValue(new Error('Config error'))

    const result = await orchestrator.start('/test')

    expect(result).toBe(false)
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      'Failed to start session: Error: Config error',
      'error',
    )

    const stats = orchestrator.getSessionStats()
    expect(stats.errorCount).toBe(1)
  })

  it('should increment error count and request count on handleContext', async () => {
    mockStateManager.getState.mockReturnValue({ initialized: true })

    // First successful call
    await orchestrator.handleContext(['message1'])

    // Second call that fails
    mockStateManager.getState.mockReturnValue(null)
    await expect(orchestrator.handleContext(['message2'])).rejects.toThrow()

    const stats = orchestrator.getSessionStats()
    expect(stats.requestCount).toBe(2)
    expect(stats.errorCount).toBe(1)
  })
})
