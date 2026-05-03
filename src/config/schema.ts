/**
 * Configuration schema for pi-smart-context.
 *
 * Single source of truth for all config defaults and validation.
 * Used by both `config/loader.ts` and `types.ts`.
 */

import { z } from 'zod'

export type SmartContextConfig = z.infer<typeof SmartContextConfigSchema>

// ── Sub-schemas ───────────────────────────────────────────────────────────

const ContextFilesSchema = z.object({
  enabled: z.boolean().default(true),
  filenames: z.array(z.string()).default(['AGENTS.local.md', 'CLAUDE.local.md']),
  sectionTitle: z.string().default('Extra Context Files'),
})

const ProviderGuidanceSchema = z.object({
  enabled: z.boolean().default(true),
})

// ── Root schema ───────────────────────────────────────────────────────────

export const SmartContextConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRepoMapTokens: z.number().int().positive().default(4000),
  maxInjectionTokens: z.number().int().positive().default(8000),
  scanLastNMessages: z.number().int().positive().default(10),
  exclude: z.array(z.string()).default([
    '**/node_modules/**',
    '**/.git/**',
    '**/.pi-cache/**',
    '**/dist/**',
  ]),
  contextFiles: ContextFilesSchema.default({}),
  providerGuidance: ProviderGuidanceSchema.default({}),
}).default({})

export type SmartContextConfigInput = z.input<typeof SmartContextConfigSchema>

/**
 * Produce the fully-resolved default configuration.
 * This is the single source of truth — `types.ts` imports this value.
 */
export function produceDefaults(): SmartContextConfig {
  return SmartContextConfigSchema.parse({}) as SmartContextConfig
}
