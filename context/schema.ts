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

// ── Root schema ───────────────────────────────────────────────────────────

export const SlimConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRepoMapTokens: z.number().int().positive().default(4000),
  maxInjectionTokens: z.number().int().positive().default(8000),
  scanLastNMessages: z.number().int().positive().default(10),
  dependencyDepth: z.number().int().min(0).max(3).default(1),
  exclude: z.array(z.string()).default([
    '**/node_modules/**',
    '**/.git/**',
    '**/.pi-cache/**',
    '**/dist/**',
  ]),
  contextFiles: ContextFilesSchema.default({}),
  providerGuidance: ProviderGuidanceSchema.default({}),
}).default({})

export type SlimConfigInput = z.input<typeof SlimConfigSchema>

/**
 * Produce the fully-resolved default configuration.
 * This is the single source of truth — `types.ts` imports this value.
 */
export function produceDefaults(): SlimConfig {
  return SlimConfigSchema.parse({}) as SlimConfig
}
