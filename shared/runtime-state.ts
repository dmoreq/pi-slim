/**
 * State persistence — standardized read/write helpers for runtime state.
 *
 * Ported from pi-me shared/ext-state.ts
 * ─────────────────────────────────────
 * Persists lightweight runtime state (e.g., last session stats, build
 * metadata) to <project>/.pi/slim/state.json so it survives
 * across session restarts.
 *
 * For the heavy data (index, repo map), use store.ts which has atomic
 * writes and versioned schemas.
 *
 * Usage:
 *   const state = await readState(projectRoot) ?? { lastSessionId: '' };
 *   state.lastSessionId = sessionId;
 *   await writeState(projectRoot, state);
 */

import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { slimDir } from '../shared/paths.js'

export type StateValue = string | number | boolean | null | StateValue[] | { [key: string]: StateValue }

/** Base directory for slim state. */
function stateDir(projectRoot: string): string {
  return slimDir(projectRoot)
}

function statePath(projectRoot: string): string {
  return join(stateDir(projectRoot), 'state.json')
}

/**
 * Read runtime state (async). Returns null if no state file exists.
 */
export async function readState<T extends Record<string, StateValue> = Record<string, StateValue>>(
  projectRoot: string,
): Promise<T | null> {
  try {
    const raw = await readFile(statePath(projectRoot), 'utf-8')
    const parsed = JSON.parse(raw) as T
    console.log(`[slim/state] Loaded state from ${statePath(projectRoot)}`)
    return parsed
  } catch {
    return null
  }
}

/**
 * Write runtime state (async). Creates directory if needed.
 */
export async function writeState<T extends Record<string, StateValue> = Record<string, StateValue>>(
  projectRoot: string,
  state: T,
): Promise<void> {
  try {
    await mkdir(stateDir(projectRoot), { recursive: true })
    await writeFile(statePath(projectRoot), JSON.stringify(state, null, 2), 'utf-8')
    console.log(`[slim/state] Persisted state to ${statePath(projectRoot)}`)
  } catch (err) {
    console.error('[slim/state] Failed to write state:', err)
  }
}

/**
 * Read runtime state (sync). Returns null if no state file exists.
 */
export function readStateSync<T extends Record<string, StateValue> = Record<string, StateValue>>(
  projectRoot: string,
): T | null {
  try {
    const filePath = statePath(projectRoot)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Write runtime state (sync). Creates directory if needed.
 */
export function writeStateSync<T extends Record<string, StateValue> = Record<string, StateValue>>(
  projectRoot: string,
  state: T,
): void {
  try {
    mkdirSync(stateDir(projectRoot), { recursive: true })
    writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[slim/state] Failed to write state:', err)
  }
}

/**
 * Remove state file (async).
 */
export async function removeState(projectRoot: string): Promise<void> {
  try {
    await unlink(statePath(projectRoot))
  } catch {
    // File doesn't exist — no-op
  }
}
