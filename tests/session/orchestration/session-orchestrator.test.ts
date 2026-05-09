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
})
