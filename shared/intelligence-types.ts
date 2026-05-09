/**
 * Intelligence System Types
 *
 * Type definitions for the Enhanced Context Intelligence System
 */

export interface ContextInsights {
  editingIntent: EditingContext
  navigationRequests: NavigationContext
  suboptimalPatterns: OptimizationSuggestion[]
  conversationContext: ConversationContext
}

export interface EditingContext {
  detected: boolean
  targetSymbols: string[]
  targetFiles: string[]
  hasHashAnnotations: boolean
  affectedGodNodes: string[]
}

export interface NavigationContext {
  detected: boolean
  requestedSymbols: string[]
  requestType: 'definition' | 'references' | 'file_location' | 'none'
}

export interface ConversationContext {
  recentMessages: number
  codebaseRelevant: boolean
  mentionedCommunities: string[]
  mentionedFiles: string[]
}

export interface OptimizationSuggestion {
  type: 'tool_usage' | 'context_awareness' | 'workflow_optimization'
  pattern: string
  recommendation: string
  confidence: number
  context: string
  toolSuggestion?: string
}

export interface EnhancedContextLayer {
  type: 'actionable_insights' | 'smart_dep_context' | 'smart_repo_map'
  content: string
  priority: number
  relevanceScore: number
}

export interface GuidanceMetrics {
  suggestionsOffered: number
  suggestionsFollowed: number
  patternDetections: number
  toolUsageImprovements: number
}
