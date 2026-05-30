/**
 * Steer built-in file edit tools toward hashline_edit when files are indexed.
 */

import { resolve } from 'node:path'
import { extractToolPath } from '../context/hashline-inject.js'
import type { SlimConfig } from '../shared/types.js'
import type { SessionState } from '../manager.js'
import type { Plugin, PluginToolCallResult } from './plugin.js'

const BUILTIN_EDIT_TOOLS = new Set([
  'edit',
  'write',
  'search_replace',
  'str_replace',
  'strreplace',
  'apply_patch',
  'patch',
])

function pathIsIndexed(state: SessionState, filePath: string): boolean {
  const abs = resolve(state.projectRoot, filePath)
  if (state.index.skeletons.has(abs)) return true
  for (const key of state.index.skeletons.keys()) {
    if (key.endsWith(filePath) || key.endsWith('/' + filePath)) return true
  }
  return false
}

export class HashlineSteerPlugin implements Plugin {
  readonly name = 'hashline-steer'
  readonly version = '1.0.0'

  constructor(private readonly getState: () => SessionState | null) {}

  private hashlineConfig(): SlimConfig['hashline'] | null {
    const s = this.getState()
    if (!s?.config.hashline.enabled) return null
    return s.config.hashline
  }

  async onToolCall(event: {
    toolName: string
    input: Record<string, unknown> | undefined
  }): Promise<PluginToolCallResult | undefined> {
    const cfg = this.hashlineConfig()
    if (!cfg) return undefined

    const tool = event.toolName.toLowerCase()
    const path = extractToolPath(event.input)

    if (tool === 'read' && path && cfg.recordOnRead) {
      return { allowed: true }
    }

    if (!BUILTIN_EDIT_TOOLS.has(tool)) return undefined

    const state = this.getState()
    if (!state || !path || !pathIsIndexed(state, path)) return undefined

    const dryRunHint = cfg.preferDryRun ? ' Use `dry_run: true` on the first attempt.' : ''
    const reason =
      `Prefer \`hashline_edit\` for \`${path}\` — anchors are in dep-context or use \`/hashline-read ${path}\`.` +
      ` Built-in \`${tool}\` can drift; hashline validates line anchors.${dryRunHint}`

    if (cfg.strictMode) {
      return { allowed: false, reason }
    }

    return { allowed: true, reason }
  }
}
