/**
 * Parse file paths from LSP tool text output and structured details.
 */

import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'

const LOCATION_LINE_RE = /^\s*(.+?):(\d+):(\d+)\s*$/gm
const FILE_URI_RE = /file:\/\/[^\s:]+/g

export function uriToProjectRelative(uri: string, projectRoot: string): string | null {
  try {
    const abs = fileURLToPath(uri.split('#')[0] ?? uri)
    const rel = relative(projectRoot, abs).replace(/\\/g, '/')
    if (rel.startsWith('..')) return null
    return rel
  } catch {
    return null
  }
}

/** Extract project-relative paths from LSP location lines in tool output. */
export function parseLspPathsFromText(text: string, projectRoot: string): string[] {
  const found = new Set<string>()

  for (const m of text.matchAll(LOCATION_LINE_RE)) {
    const raw = m[1]?.trim()
    if (!raw) continue
    if (raw.startsWith('file://')) {
      const rel = uriToProjectRelative(raw, projectRoot)
      if (rel) found.add(rel)
    } else {
      const rel = relative(projectRoot, resolve(projectRoot, raw)).replace(/\\/g, '/')
      if (!rel.startsWith('..')) found.add(rel)
    }
  }

  for (const uri of text.match(FILE_URI_RE) ?? []) {
    const rel = uriToProjectRelative(uri, projectRoot)
    if (rel) found.add(rel)
  }

  return [...found]
}

export function mergeLspPaths(
  projectRoot: string,
  ...sources: Array<string[] | undefined>
): string[] {
  const absSet = new Set<string>()
  for (const list of sources) {
    if (!list) continue
    for (const p of list) {
      if (!p.trim()) continue
      absSet.add(resolve(projectRoot, p))
    }
  }
  return [...absSet]
}

/** Scan conversation messages for LSP tool calls and results. */
export function collectLspPathsFromMessages(
  messages: Array<Record<string, unknown>>,
  projectRoot: string
): string[] {
  const rels = new Set<string>()

  for (const msg of messages) {
    const toolName = String(msg.toolName ?? '').toLowerCase()
    if (!toolName.startsWith('lsp_')) continue

    const input = msg.input as Record<string, unknown> | undefined
    const path = input?.path
    if (typeof path === 'string' && path.trim()) {
      rels.add(relative(projectRoot, resolve(projectRoot, path)).replace(/\\/g, '/'))
    }

    if (msg.role === 'toolResult' || msg.role === 'tool') {
      const details = msg.details as { paths?: string[]; ok?: boolean } | undefined
      if (Array.isArray(details?.paths)) {
        for (const p of details.paths) rels.add(p)
      }
      const content = typeof msg.content === 'string' ? msg.content : ''
      for (const p of parseLspPathsFromText(content, projectRoot)) {
        rels.add(p)
      }
    }
  }

  return [...rels].filter(p => !p.startsWith('..'))
}
