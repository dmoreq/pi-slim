/**
 * Config loader for pi-scope.
 *
 * Loads from 4 layers (highest priority wins):
 *   1. CLI flag overrides
 *   2. Project-local .pi/scope.jsonc
 *   3. Global ~/.pi/agent/scope.jsonc
 *   4. Hardcoded defaults (from schema defaults)
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import { SlimConfigSchema, type SlimConfig } from './schema.js'

// ── JSONC parsing ─────────────────────────────────────────────────────────

function readConfigFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function parseJsonc(filePath: string, content: string): unknown {
  const errors: ParseError[] = []
  const value = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  })

  if (errors.length > 0) {
    const err = errors[0]!
    const location = getLineAndColumn(content, err.offset)
    const code = printParseErrorCode(err.error)
    throw new Error(`Invalid JSONC in ${filePath}:${location.line}:${location.column}: ${code}`)
  }

  return value
}

function getLineAndColumn(content: string, offset: number) {
  const beforeOffset = content.slice(0, offset)
  const lines = beforeOffset.split('\n')
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

// ── Deep merge ────────────────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults }
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const overrideVal = overrides[key]
    if (overrideVal === undefined) continue
    const defaultVal = defaults[key]
    if (isPlainObject(defaultVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T]
    } else {
      result[key] = overrideVal as T[keyof T]
    }
  }
  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

// ── Config loading ────────────────────────────────────────────────────────

const GLOBAL_CONFIG_PATH = join(homedir(), '.pi', 'agent', 'slim.jsonc')
const PROJECT_CONFIG_REL = '.pi/scope.jsonc'

/**
 * Load the slim configuration from all layers.
 *
 * Priority (highest wins):
 *   1. CLI flag overrides (passed as `flags`)
 *   2. Project-local .pi/scope.jsonc
 *   3. Global ~/.pi/agent/scope.jsonc
 *   4. Hardcoded defaults from schema
 */
export function loadConfig(
  projectRoot: string,
  flags?: Record<string, unknown>,
): SlimConfig {
  // Layer 1: Defaults
  let merged: Record<string, unknown> = SlimConfigSchema.parse({}) as Record<string, unknown>

  // Layer 2: Global config
  const globalRaw = readConfigFile(GLOBAL_CONFIG_PATH)
  if (globalRaw) {
    const globalValue = parseJsonc(GLOBAL_CONFIG_PATH, globalRaw)
    merged = deepMerge(merged, globalValue as Record<string, unknown>)
  }

  // Layer 3: Project-local config
  const projectPath = resolve(projectRoot, PROJECT_CONFIG_REL)
  const projectRaw = readConfigFile(projectPath)
  if (projectRaw) {
    const projectValue = parseJsonc(projectPath, projectRaw)
    merged = deepMerge(merged, projectValue as Record<string, unknown>)
  }

  // Layer 4: CLI flags
  if (flags) {
    const flagConfig: Record<string, unknown> = {}
    if (flags['slim.enabled'] !== undefined) {
      flagConfig.enabled = Boolean(flags['slim.enabled'])
    }
    if (flags['slim.maxRepoMapTokens'] !== undefined) {
      flagConfig.maxRepoMapTokens = Number(flags['slim.maxRepoMapTokens'])
    }
    if (flags['slim.maxInjectionTokens'] !== undefined) {
      flagConfig.maxInjectionTokens = Number(flags['slim.maxInjectionTokens'])
    }
    if (flags['slim.scanLastNMessages'] !== undefined) {
      flagConfig.scanLastNMessages = Number(flags['slim.scanLastNMessages'])
    }
    if (flags['slim.contextFiles.enabled'] !== undefined) {
      flagConfig.contextFiles = {
        ...((merged.contextFiles ?? {}) as Record<string, unknown>),
        enabled: Boolean(flags['slim.contextFiles.enabled']),
      }
    }
    if (flags['slim.providerGuidance.enabled'] !== undefined) {
      flagConfig.providerGuidance = {
        ...((merged.providerGuidance ?? {}) as Record<string, unknown>),
        enabled: Boolean(flags['slim.providerGuidance.enabled']),
      }
    }
    merged = deepMerge(merged, flagConfig)
  }

  // Validate final merged config
  const result = SlimConfigSchema.safeParse(merged)
  if (!result.success) {
    throw new Error(`[slim] Invalid configuration:\n${result.error.message}`)
  }

  return result.data as SlimConfig
}
