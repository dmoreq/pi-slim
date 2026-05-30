/**
 * Nudge hashline_edit when anchors may be missing for the target file.
 */

import { resolve } from 'node:path'
import { extractToolPath } from '../context/hashline-inject.js'
import { AnchorStateManager } from '../hashline/state-manager.js'
import type { SessionState } from '../manager.js'
import type { Plugin, PluginToolCallResult } from './plugin.js'

export class HashlineValidatePlugin implements Plugin {
  readonly name = 'hashline-validate'
  readonly version = '1.0.0'

  constructor(
    private readonly getState: () => SessionState | null,
    private readonly getAnchorPathsThisTurn: () => Set<string> = () => new Set()
  ) {}

  async onToolCall(event: {
    toolName: string
    input: Record<string, unknown> | undefined
  }): Promise<PluginToolCallResult | undefined> {
    const s = this.getState()
    if (!s?.config.hashline.enabled) return undefined

    if (event.toolName.toLowerCase() !== 'hashline_edit') return undefined

    const dryRun = Boolean(event.input?.dry_run)
    if (dryRun) return undefined

    const path = extractToolPath(event.input)
    if (!path) return undefined

    const abs = resolve(s.projectRoot, path)
    const hasTurnAnchor = [...this.getAnchorPathsThisTurn()].some(
      p => p === abs || p.endsWith('/' + path) || p.endsWith(path)
    )
    const hasRecorded = AnchorStateManager.has(abs)

    if (hasTurnAnchor || hasRecorded) return undefined

    return {
      allowed: true,
      reason:
        `No hashline anchors recorded for \`${path}\`. Call \`hashline_read\` (or check dep-context) before applying edits.`,
    }
  }
}
