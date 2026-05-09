/**
 * Notification port consumed by SessionOrchestrator.
 */
export interface NotificationService {
  notify(message: string, level?: string): void
  setStatus(key: string, value?: string): void
}
