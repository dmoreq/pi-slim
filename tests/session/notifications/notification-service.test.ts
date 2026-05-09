import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationService } from '../../../session/notifications/notification-service.js'
import type { ExtensionContext } from '../../../manager.js'

describe('NotificationService', () => {
  let notificationService: NotificationService
  let mockContext: ExtensionContext

  beforeEach(() => {
    mockContext = {
      cwd: '/test',
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
      },
      hasUI: true,
      getSystemPrompt: vi.fn(),
      sessionManager: { getSessionId: vi.fn() },
    }

    notificationService = new NotificationService(mockContext)
  })

  it('should send notification through context UI', () => {
    notificationService.notify('Test message', 'info')

    expect(mockContext.ui.notify).toHaveBeenCalledWith('Test message', 'info')
  })

  it('should set status through context UI', () => {
    notificationService.setStatus('status-key', 'status-value')

    expect(mockContext.ui.setStatus).toHaveBeenCalledWith('status-key', 'status-value')
  })

  it('should not crash when no UI available', () => {
    const noUIContext = { ...mockContext, hasUI: false }
    const service = new NotificationService(noUIContext)

    expect(() => service.notify('Test')).not.toThrow()
    expect(() => service.setStatus('key', 'value')).not.toThrow()
  })

  it('should default to info level when no level specified', () => {
    notificationService.notify('Default message')

    expect(mockContext.ui.notify).toHaveBeenCalledWith('Default message', 'info')
  })

  it('should handle all notification levels', () => {
    notificationService.notify('Info message', 'info')
    notificationService.notify('Warning message', 'warning')
    notificationService.notify('Error message', 'error')

    expect(mockContext.ui.notify).toHaveBeenCalledWith('Info message', 'info')
    expect(mockContext.ui.notify).toHaveBeenCalledWith('Warning message', 'warning')
    expect(mockContext.ui.notify).toHaveBeenCalledWith('Error message', 'error')
  })

  it('should use console fallback in headless mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const noUIContext = { ...mockContext, hasUI: false }
    const service = new NotificationService(noUIContext)

    service.notify('Test message', 'warning')

    expect(consoleSpy).toHaveBeenCalledWith('[WARNING] Test message')
    expect(mockContext.ui.notify).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should handle setStatus with undefined value', () => {
    notificationService.setStatus('key')

    expect(mockContext.ui.setStatus).toHaveBeenCalledWith('key', undefined)
  })

  it('should not call setStatus in headless mode', () => {
    const noUIContext = { ...mockContext, hasUI: false }
    const service = new NotificationService(noUIContext)

    service.setStatus('key', 'value')

    expect(mockContext.ui.setStatus).not.toHaveBeenCalled()
  })

  it('should handle empty message gracefully', () => {
    notificationService.notify('')

    expect(mockContext.ui.notify).toHaveBeenCalledWith('', 'info')
  })

  it('should handle special characters in messages', () => {
    const specialMessage = 'Message with "quotes" and \n newlines'
    notificationService.notify(specialMessage, 'error')

    expect(mockContext.ui.notify).toHaveBeenCalledWith(specialMessage, 'error')
  })
})
