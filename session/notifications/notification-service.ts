import type { ExtensionContext } from '../../manager.js'
import type {
  NotificationService as INotificationService,
  NotificationLevel,
} from '../interfaces/notification-service.interface.js'

export class NotificationService implements INotificationService {
  constructor(private context: ExtensionContext) {}

  notify(message: string, level: NotificationLevel = 'info'): void {
    if (this.context.hasUI) {
      this.context.ui.notify(message, level)
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`)
    }
  }

  setStatus(key: string, value?: string): void {
    if (this.context.hasUI) {
      this.context.ui.setStatus(key, value)
    }
  }
}
