import type { GraphifyAnalysis } from '../context/graph-types.js'

/**
 * Optional hook implementations may merge onto {@link GraphService} (e.g. tests)
 * to supply graph analysis without going through disk cache / native analysis.
 *
 * Production {@link GraphService} does not implement this shape; callers use
 * `'loadGraphifyAnalysis' in svc` checks only via {@link SessionManager}.
 */
export interface OptionalGraphAnalysisLoader {
  loadGraphifyAnalysis?: () => Promise<GraphifyAnalysis | null>
}
