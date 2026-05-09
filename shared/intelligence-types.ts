/**
 * @fileoverview Types for the Enhanced Context Intelligence System.
 *
 * These interfaces connect conversation analysis, pattern detection, and dynamic
 * guidance. Callers should treat **probabilities and scores** as follows unless
 * noted otherwise:
 *
 * - **`confidence` / `relevanceScore`**: real numbers in **[0, 1]** (inclusive).
 * - **`recentMessages`**, **`priority`**, and **GuidanceMetrics** counters:
 *   non-negative integers (**≥ 0**).
 *
 * Runtime validation (e.g. Zod) may be added later; these are structural contracts.
 */

/**
 * Aggregated view of the current conversation for guidance decisions.
 */
export interface ContextInsights {
  /** Whether the transcript suggests the agent intends to edit code. */
  editingIntent: EditingContext

  /** Whether the user or agent is trying to locate symbols or files. */
  navigationRequests: NavigationContext

  /** Detected opportunities to steer toward better tooling or workflows. */
  suboptimalPatterns: OptimizationSuggestion[]

  /** High-level relevance of recent messages to the codebase. */
  conversationContext: ConversationContext
}

/**
 * Signals extracted when the transcript suggests code edits.
 */
export interface EditingContext {
  /** True when edit-related intent is inferred. */
  detected: boolean

  /** Symbol names the conversation appears to focus on (functions, classes, etc.). */
  targetSymbols: string[]

  /** File paths explicitly mentioned or implied as edit targets. */
  targetFiles: string[]

  /** True when hashline / hash-annotated content is present for safer edits. */
  hasHashAnnotations: boolean

  /** Graph god-node IDs (or labels) overlapping target symbols from this context. */
  affectedGodNodes: string[]
}

/**
 * Navigation-oriented intent (find definition, references, or a file path).
 */
export interface NavigationContext {
  /** True when the transcript suggests a lookup/navigation goal (vs. incidental mention). */
  detected: boolean

  /** Symbols the user or agent appears to be looking for. */
  requestedSymbols: string[]

  /**
   * Kind of navigation being sought:
   *
   * - **`definition`** — locate a symbol's definition / declaration.
   * - **`references`** — find usages or call sites.
   * - **`file_location`** — resolve which file contains something.
   * - **`none`** — no navigation signal detected; other fields should be treated as inactive.
   */
  requestType: 'definition' | 'references' | 'file_location' | 'none'
}

/**
 * Lightweight metadata summarizing recent conversation against the repo.
 */
export interface ConversationContext {
  /**
   * Number of recent messages included in this summary (typically a sliding window).
   * Intended range: **integer ≥ 0**.
   */
  recentMessages: number

  /** Whether topics look codebase-related versus generic chat. */
  codebaseRelevant: boolean

  /** Community IDs or labels from graph analysis referenced in conversation. */
  mentionedCommunities: string[]

  /** Repo-relative or absolute file paths surfaced in conversation. */
  mentionedFiles: string[]
}

/**
 * A concrete suggestion to change agent behavior (tool choice, workflow, awareness).
 */
export interface OptimizationSuggestion {
  /**
   * Category of steering:
   *
   * - **`tool_usage`** — prefer a specific pi-scope / editor tool.
   * - **`context_awareness`** — factor in graph or risk signals.
   * - **`workflow_optimization`** — broader ordering or preview habits.
   */
  type: 'tool_usage' | 'context_awareness' | 'workflow_optimization'

  /** Stable pattern id from the detector (e.g. `basic_file_edit`). */
  pattern: string

  /** Human-readable recommendation for logs or injected guidance. */
  recommendation: string

  /**
   * Detector confidence in this suggestion, **[0, 1] inclusive**.
   * `1` = strongest signal; `0` = negligible.
   */
  confidence: number

  /** Short explanation of why this suggestion applies. */
  context: string

  /** Optional concrete tool name to prefer (e.g. `hashline_edit`). */
  toolSuggestion?: string
}

/**
 * One renderable slice of enhanced context (e.g. actionable insights block).
 */
export interface EnhancedContextLayer {
  /** Which pipeline segment produced this layer. */
  type: 'actionable_insights' | 'smart_dep_context' | 'smart_repo_map'

  /** Final string content to inject (often XML-tagged). */
  content: string

  /**
   * Relative ordering for injection. **Higher sort order first** unless the
   * pipeline defines otherwise. Intended range: **integer ≥ 0**.
   */
  priority: number

  /**
   * Relevance of this layer to the current turn, **[0, 1] inclusive**.
   * `1` = keep when trimming; `0` = safe to drop under token pressure.
   */
  relevanceScore: number
}

/**
 * Counters for observability and tuning the intelligence system.
 *
 * All fields are **non-negative integer** event counts (typically monotonic within a session).
 */
export interface GuidanceMetrics {
  /** Times a suggestion was surfaced to the model or user. */
  suggestionsOffered: number

  /** Times a suggestion was followed (defined by product/telemetry rules). */
  suggestionsFollowed: number

  /** Times a detector fired (any pattern). */
  patternDetections: number

  /** Times tool usage moved toward a recommended tool after guidance. */
  toolUsageImprovements: number
}
