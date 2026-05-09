/**
 * Configuration port consumed by SessionOrchestrator.
 */
export interface ConfigManager {
  loadConfig(projectRoot: string): Promise<unknown>
  getConfig(): unknown
}
