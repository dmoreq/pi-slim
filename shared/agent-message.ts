/**
 * Loose message-shaped object from agent / host transcripts.
 * Used by SessionManager context events and intelligence pattern detection.
 */

export interface AgentMessage {
  role?: string
  content?: unknown
  [key: string]: unknown
}
