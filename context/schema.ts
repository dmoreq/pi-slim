/**
 * Configuration schema for pi-scope.
 *
 * Single source of truth for all config defaults and validation.
 * Used by both `config/loader.ts` and `types.ts`.
 */

import { z } from 'zod'

export type SlimConfig = z.infer<typeof SlimConfigSchema>

// ── Sub-schemas ───────────────────────────────────────────────────────────

const ContextFilesSchema = z.object({
  enabled: z.boolean().default(true),
  filenames: z.array(z.string()).default(['AGENTS.local.md', 'CLAUDE.local.md']),
  sectionTitle: z.string().default('Extra Context Files'),
})

const ProviderGuidanceSchema = z.object({
  enabled: z.boolean().default(true),
})

const IntelligenceSchema = z.object({
  enabled: z.boolean().default(true),
  /** When false (default), WORKFLOW OPTIMIZATION is injected once per session. */
  repeatWorkflowGuidance: z.boolean().default(false),
})

const MetricsSchema = z.object({
  enabled: z.boolean().default(true),
  notifyOnShutdown: z.boolean().default(true),
  notifyQualityOnStart: z.boolean().default(true),
  notifyGraphProgress: z.boolean().default(true),
  notifyWelcome: z.boolean().default(true),
  notifyGodNodeProtection: z.boolean().default(true),
  notifyMilestones: z.boolean().default(true),
  notifyPeriodic: z.boolean().default(false),
  warnQualityBelow: z.number().int().min(0).max(100).default(60),
  warnCyclesAbove: z.number().int().min(0).default(5),
  historyLimit: z.number().int().positive().default(5),
})

const HashlineSchema = z.object({
  enabled: z.boolean().default(true),
  annotateDepContext: z.boolean().default(true),
  annotateMaxLinesPerFile: z.number().int().positive().default(80),
  annotateBySymbolRange: z.boolean().default(true),
  annotateRangePaddingLines: z.number().int().min(0).default(15),
  preferDryRun: z.boolean().default(true),
  steerFromBuiltinEdit: z.boolean().default(true),
  strictMode: z.boolean().default(false),
  contextualStrictMode: z.boolean().default(false),
  recordOnRead: z.boolean().default(true),
  anchorOnLspHover: z.boolean().default(true),
  streamAnnotateThresholdLines: z.number().int().positive().default(500),
  streamChunkLines: z.number().int().positive().default(200),
  injectDryRunFollowUp: z.boolean().default(true),
})

const GraphSchema = z.object({
  enabled: z.boolean().default(true),
  compactPulseEachTurn: z.boolean().default(true),
  repeatFullInsights: z.boolean().default(false),
  dedupeGodNodesAcrossSources: z.boolean().default(true),
  boostRetrievalWithGodNodes: z.boolean().default(true),
  boostRetrievalWithActiveCommunity: z.boolean().default(true),
  surfaceAnomaliesInInsights: z.boolean().default(true),
  surfaceSurprisesMax: z.number().int().min(0).default(5),
  warnWhenEditingCycleParticipant: z.boolean().default(true),
  warnOnNewImports: z.boolean().default(false),
  communityPruningEnabled: z.boolean().default(true),
  steerOnCriticalGodNode: z.boolean().default(true),
  strictGraphImpact: z.boolean().default(false),
})

const LspSchema = z.object({
  enabled: z.boolean().default(true),
  enrichHoverWithGraph: z.boolean().default(true),
  injectPathsSameTurn: z.boolean().default(true),
  steerFromManualSearch: z.boolean().default(true),
  strictNavigation: z.boolean().default(false),
  hoverMaxReferencesListed: z.number().int().positive().default(10),
  recordToolMetrics: z.boolean().default(true),
  probeServersOnStart: z.boolean().default(true),
  suggestHoverOnCompilerErrors: z.boolean().default(true),
})

// ── Root schema ───────────────────────────────────────────────────────────

export const SlimConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxRepoMapTokens: z.number().int().positive().default(4000),
    maxInjectionTokens: z.number().int().positive().default(8000),
    scanLastNMessages: z.number().int().positive().default(10),
    dependencyDepth: z.number().int().min(0).max(3).default(1),
    exclude: z.array(z.string()).default(['**/node_modules/**', '**/.git/**', '**/.pi-cache/**', '**/dist/**']),
    contextFiles: ContextFilesSchema.default({}),
    providerGuidance: ProviderGuidanceSchema.default({}),
    intelligence: IntelligenceSchema.default({}),
    metrics: MetricsSchema.default({}),
    hashline: HashlineSchema.default({}),
    graph: GraphSchema.default({}),
    lsp: LspSchema.default({}),
  })
  .default({})

export type SlimConfigInput = z.input<typeof SlimConfigSchema>

/**
 * Produce the fully-resolved default configuration.
 * This is the single source of truth — `types.ts` imports this value.
 */
export function produceDefaults(): SlimConfig {
  return SlimConfigSchema.parse({}) as SlimConfig
}
