/**
 * Probe availability of configured LSP server binaries on PATH.
 */

import path from 'node:path'
import { PathUtils } from '../shared/utils/path-utils.js'

export interface LspServerHealth {
  id: string
  command: string
  available: boolean
}

const SERVER_COMMANDS: Record<string, string> = {
  typescript: 'typescript-language-server',
  python: 'pyright-langserver',
  go: 'gopls',
  rust: 'rust-analyzer',
}

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
  return Object.entries(SERVER_COMMANDS).map(([id, command]) => ({
    id,
    command,
    available: which(command) != null,
  }))
}
