/**
 * Session state port consumed by SessionOrchestrator.
 * A concrete StateManager class is introduced in a follow-up task.
 */
export interface OrchestratorSessionState {
  projectRoot?: string
  config?: unknown
  initialized?: boolean
}

export interface StateManager {
  getState(): OrchestratorSessionState | null
  updateState(partial: Partial<OrchestratorSessionState>): Promise<void>
  clearState(): Promise<void>
}
