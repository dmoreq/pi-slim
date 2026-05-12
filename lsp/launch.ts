/**
 * LSP process launcher (adapted from pi-lens).
 * Simplified — spawns LSP servers with stdio pipes.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { PathUtils } from '../shared/utils/path-utils.js'

export interface LSPProcess {
  process: ChildProcess
  stdin: NodeJS.WritableStream
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  pid: number
}

const isWindows = process.platform === 'win32'

/**
 * Find a binary on system PATH.
 */
function which(bin: string): string | undefined {
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

/**
 * Spawn an LSP server process.
 *
 * @param command - Command to run (e.g., "typescript-language-server", "/usr/bin/gopls")
 * @param args - Arguments (e.g., ["--stdio"])
 * @param options - cwd, env overrides
 */
export async function launchLSP(
  command: string,
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<LSPProcess> {
  const cwd = options.cwd ?? process.cwd()
  const mergedEnv = { ...process.env, ...options.env }

  // Resolve bare command to full path
  const resolvedCommand = path.isAbsolute(command) ? command : (which(command) ?? command)

  // Determine if we need shell (Windows .cmd/.bat scripts)
  const needsShell =
    isWindows &&
    (resolvedCommand.includes(' ') ||
      /\.(cmd|bat)$/i.test(resolvedCommand) ||
      (!/\.(exe|cmd|bat)$/i.test(resolvedCommand) && !which(resolvedCommand)))

  let proc: ChildProcess

  if (needsShell) {
    const escapeCmdArg = (s: string): string => {
      const escaped = s.replace(/([&|<>^()!])/g, '^$1')
      return /[\s"]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped
    }
    const shellCommand = `"${resolvedCommand}" ${args.map(escapeCmdArg).join(' ')}`
    proc = spawn(shellCommand, [], {
      cwd,
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    })
  } else {
    proc = spawn(resolvedCommand, args, {
      cwd,
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: isWindows,
    })
  }

  if (!proc.stdin || !proc.stdout || !proc.stderr) {
    throw new Error(`Failed to spawn LSP server: ${command}`)
  }

  // Check immediate exit
  if (proc.exitCode !== null || proc.killed) {
    throw new Error(`LSP server ${command} exited immediately (code: ${proc.exitCode})`)
  }

  return {
    process: proc,
    stdin: proc.stdin,
    stdout: proc.stdout,
    stderr: proc.stderr,
    pid: proc.pid!,
  }
}

/**
 * Kill an LSP process gracefully (SIGTERM), then force (SIGKILL) after timeout.
 */
export async function killLSPProcess(proc: LSPProcess, timeoutMs = 3000): Promise<void> {
  return new Promise(resolve => {
    const child = proc.process
    if (child.killed) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve()
    }, timeoutMs)

    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })

    try {
      child.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}
