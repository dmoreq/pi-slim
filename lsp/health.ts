/**
 * Probe availability of configured LSP server binaries on PATH.
 */

import path from 'node:path'
import { PathUtils } from '../shared/utils/path-utils.js'

export interface LspServerHealth {
  id: string
  command: string
  available: boolean
  /** Copy-paste install when `available` is false. */
  installCommand: string
  /** Human label for dashboards and messages. */
  label: string
}

export interface LspServerCatalogEntry {
  id: string
  command: string
  label: string
  installCommand: string
}

/** Single source of truth for LSP binaries and how to install them. */
export const LSP_SERVER_CATALOG: readonly LspServerCatalogEntry[] = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    label: 'TypeScript / JavaScript',
    installCommand: 'npm install -g typescript typescript-language-server',
  },
  {
    id: 'python',
    command: 'pyright-langserver',
    label: 'Python',
    installCommand: 'pip install pyright',
  },
  {
    id: 'go',
    command: 'gopls',
    label: 'Go',
    installCommand: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    id: 'rust',
    command: 'rust-analyzer',
    label: 'Rust',
    installCommand: 'rustup component add rust-analyzer',
  },
] as const

const SERVER_COMMANDS: Record<string, string> = Object.fromEntries(
  LSP_SERVER_CATALOG.map(s => [s.id, s.command])
)

const INSTALL_BY_ID: Record<string, string> = Object.fromEntries(
  LSP_SERVER_CATALOG.map(s => [s.id, s.installCommand])
)

const LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  LSP_SERVER_CATALOG.map(s => [s.id, s.label])
)

function which(bin: string): string | undefined {
  const isWindows = process.platform === 'win32'
  const paths = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of paths) {
    const full = PathUtils.joinSafe(dir, bin)
    if (PathUtils.existsSync(full)) return full
    if (isWindows) {
      for (const ext of ['.cmd', '.bat', '.exe', '.ps1']) {
        const wFull = full + ext
        if (PathUtils.existsSync(wFull)) return wFull
      }
    }
  }
  return undefined
}

export function probeLspServers(): LspServerHealth[] {
  return LSP_SERVER_CATALOG.map(({ id, command, label, installCommand }) => ({
    id,
    command,
    label,
    installCommand,
    available: which(command) != null,
  }))
}

/** Install command for a server id (e.g. `typescript`). */
export function lspInstallCommand(serverId: string): string | undefined {
  return INSTALL_BY_ID[serverId]
}

/**
 * Multi-line install guide for missing servers (or all servers when none are installed).
 */
export function formatLspInstallGuide(
  health: LspServerHealth[],
  opts: { missingOnly?: boolean } = {}
): string {
  const rows = opts.missingOnly ? health.filter(h => !h.available) : health
  if (rows.length === 0) return ''
  return rows.map(h => `# ${h.label}\n${h.installCommand}`).join('\n\n')
}

/** Short session-start notice when LSP was auto-disabled. */
export function formatLspSessionDisabledNotice(health: LspServerHealth[]): string {
  const guide = formatLspInstallGuide(health, { missingOnly: true })
  return (
    'LSP code navigation is off until a language server is on PATH. ' +
    'Install one or more, then restart pi:\n\n' +
    guide
  )
}

/** One-liner for a single missing language server (tool errors). */
export function formatMissingLspServerMessage(serverId: string): string {
  const install = lspInstallCommand(serverId)
  const command = SERVER_COMMANDS[serverId] ?? serverId
  const label = LABEL_BY_ID[serverId] ?? serverId
  if (!install) {
    return `Language server '${command}' not found on PATH.`
  }
  return (
    `${label}: '${command}' is not on PATH. Install it, restart pi, then retry:\n` +
    `  ${install}`
  )
}

export function isLspServerAvailable(serverId: string): boolean {
  const command = SERVER_COMMANDS[serverId]
  if (!command) return false
  return which(command) != null
}

export function hasAnyLspServerAvailable(): boolean {
  return probeLspServers().some(h => h.available)
}
