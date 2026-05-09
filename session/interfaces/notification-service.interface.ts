export interface NotificationService {
  notify(message: string, level?: 'info' | 'warning' | 'error'): void
  setStatus(key: string, value?: string): void
}

export type NotificationLevel = 'info' | 'warning' | 'error'
