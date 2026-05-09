export interface SessionOrchestrator {
  start(projectRoot: string): Promise<boolean>
  stop(): Promise<void>
  handleContext(messages: any[]): Promise<string>
  getSessionStats(): SessionStats
}

export interface SessionStats {
  startTime: Date
  requestCount: number
  errorCount: number
}
