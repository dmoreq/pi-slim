import type { StateManager } from '../state/state-manager.js'
import type { ConfigManager } from '../interfaces/config-manager.interface.js'
import type { NotificationService } from '../interfaces/notification-service.interface.js'
import type { SessionOrchestrator as ISessionOrchestrator, SessionStats } from '../interfaces/orchestrator.interface.js'

export class SessionOrchestrator implements ISessionOrchestrator {
  private startTime: Date | null = null
  private requestCount = 0
  private errorCount = 0

  constructor(
    private stateManager: StateManager,
    private configManager: ConfigManager,
    private notificationService: NotificationService,
  ) {}

  async start(projectRoot: string): Promise<boolean> {
    try {
      this.startTime = new Date()

      // Load configuration
      const config = await this.configManager.loadConfig(projectRoot)

      // Initialize state
      await this.stateManager.updateState({
        projectRoot,
        config,
        initialized: true,
      })

      this.notificationService.notify('Session started successfully')
      return true
    } catch (error) {
      this.errorCount++
      this.notificationService.notify(`Failed to start session: ${error}`, 'error')
      return false
    }
  }

  async stop(): Promise<void> {
    try {
      await this.stateManager.clearState()
      this.notificationService.notify('Session stopped')
    } catch (error) {
      this.errorCount++
      throw error
    }
  }

  async handleContext(messages: any[]): Promise<string> {
    this.requestCount++

    try {
      // Orchestrate context handling
      const state = this.stateManager.getState()
      if (!state?.initialized) {
        throw new Error('Session not initialized')
      }

      // Context handling logic will be implemented in later tasks
      return 'Context processed successfully'
    } catch (error) {
      this.errorCount++
      throw error
    }
  }

  getSessionStats(): SessionStats {
    return {
      startTime: this.startTime || new Date(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
    }
  }
}
