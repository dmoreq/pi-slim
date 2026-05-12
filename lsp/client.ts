/**
 * LSP Client for pi-scope (adapted from pi-lens).
 *
 * Handles JSON-RPC communication with language servers:
 * - Initialize/shutdown lifecycle
 * - Document synchronization (didOpen, didChange)
 * - Diagnostics with debouncing
 * - Navigation request/response handling
 */

import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import type { MessageConnection } from 'vscode-jsonrpc'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node.js'

import { normalizeMapKey, uriToPath } from '../shared/utils/path-utils.js'
import type { LSPProcess } from './launch.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface LSPDiagnostic {
  severity: 1 | 2 | 3 | 4 // Error, Warning, Info, Hint
  message: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  code?: string | number
  source?: string
}

export interface LSPLocation {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface LSPHover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>
  range?: LSPLocation['range']
}

export interface LSPSignatureHelp {
  signatures: Array<{
    label: string
    documentation?: string | { kind: string; value: string }
    parameters?: Array<{
      label: string | [number, number]
      documentation?: string | { kind: string; value: string }
    }>
  }>
  activeSignature?: number
  activeParameter?: number
}

export interface LSPCodeAction {
  title: string
  kind?: string
  diagnostics?: LSPDiagnostic[]
  edit?: unknown
  command?: unknown
  data?: unknown
}

export interface LSPWorkspaceEdit {
  changes?: Record<string, unknown[]>
  documentChanges?: unknown[]
  changeAnnotations?: Record<string, unknown>
}

export interface LSPSymbol {
  name: string
  kind: number
  location?: {
    uri: string
    range: LSPLocation['range']
  }
  range?: LSPLocation['range']
  selectionRange?: LSPLocation['range']
  detail?: string
  children?: LSPSymbol[]
}

export interface LSPCallHierarchyItem {
  name: string
  kind: number
  uri: string
  range: LSPLocation['range']
  selectionRange: LSPLocation['range']
}

export interface LSPCallHierarchyIncomingCall {
  from: LSPCallHierarchyItem
  fromRanges: LSPLocation['range'][]
}

export interface LSPCallHierarchyOutgoingCall {
  to: LSPCallHierarchyItem
  fromRanges: LSPLocation['range'][]
}

export interface LSPOperationSupport {
  definition: boolean
  references: boolean
  hover: boolean
  signatureHelp: boolean
  documentSymbol: boolean
  workspaceSymbol: boolean
  codeAction: boolean
  rename: boolean
  implementation: boolean
  callHierarchy: boolean
}

export interface LSPClientInfo {
  serverId: string
  root: string
  connection: MessageConnection
  isAlive: () => boolean
  notify: {
    open(filePath: string, content: string, languageId: string): Promise<void>
    change(filePath: string, content: string): Promise<void>
  }
  getDiagnostics(filePath: string): LSPDiagnostic[]
  waitForDiagnostics(filePath: string, timeoutMs?: number): Promise<void>
  getAllDiagnostics(): Map<string, { diags: LSPDiagnostic[]; ts: number }>
  pruneDiagnostics(predicate: (filePath: string, ts: number, diags: LSPDiagnostic[]) => boolean): number
  getOperationSupport(): LSPOperationSupport
  definition(filePath: string, line: number, character: number): Promise<LSPLocation[]>
  references(filePath: string, line: number, character: number, includeDeclaration?: boolean): Promise<LSPLocation[]>
  hover(filePath: string, line: number, character: number): Promise<LSPHover | null>
  signatureHelp(filePath: string, line: number, character: number): Promise<LSPSignatureHelp | null>
  documentSymbol(filePath: string): Promise<LSPSymbol[]>
  workspaceSymbol(query: string): Promise<LSPSymbol[]>
  codeAction(
    filePath: string,
    line: number,
    character: number,
    endLine: number,
    endCharacter: number
  ): Promise<LSPCodeAction[]>
  rename(filePath: string, line: number, character: number, newName: string): Promise<LSPWorkspaceEdit | null>
  implementation(filePath: string, line: number, character: number): Promise<LSPLocation[]>
  prepareCallHierarchy(filePath: string, line: number, character: number): Promise<LSPCallHierarchyItem[]>
  incomingCalls(item: LSPCallHierarchyItem): Promise<LSPCallHierarchyIncomingCall[]>
  outgoingCalls(item: LSPCallHierarchyItem): Promise<LSPCallHierarchyOutgoingCall[]>
  shutdown(): Promise<void>
}

// ── Diagnostics debounce ────────────────────────────────────────────────────

const DIAGNOSTICS_DEBOUNCE_MS = 150
const INITIALIZE_TIMEOUT_MS = 15_000
const NAV_REQUEST_TIMEOUT_MS = 10_000

// ── Client state ────────────────────────────────────────────────────────────

interface LSPClientState {
  isConnected: boolean
  isDestroyed: boolean
  connectionDisposed: boolean
  readonly connection: MessageConnection
  readonly diagnostics: Map<string, LSPDiagnostic[]>
  readonly diagnosticTimestamps: Map<string, number>
  readonly pendingTimers: Map<string, ReturnType<typeof setTimeout>>
  readonly diagnosticEmitter: EventEmitter
  readonly documentVersions: Map<string, number>
  readonly openDocuments: Set<string>
  readonly operationSupport: LSPOperationSupport
  readonly serverId: string
  readonly root: string
  readonly lspProcess: LSPProcess
}

function isClientAlive(state: LSPClientState): boolean {
  return state.isConnected && !state.isDestroyed && !state.lspProcess.process.killed
}

// ── Operation names ─────────────────────────────────────────────────────────

const OPERATION_NAMES: Record<string, keyof LSPOperationSupport> = {
  'textDocument/definition': 'definition',
  'textDocument/references': 'references',
  'textDocument/hover': 'hover',
  'textDocument/signatureHelp': 'signatureHelp',
  'textDocument/documentSymbol': 'documentSymbol',
  'workspace/symbol': 'workspaceSymbol',
  'textDocument/codeAction': 'codeAction',
  'textDocument/rename': 'rename',
  'textDocument/implementation': 'implementation',
  'textDocument/prepareCallHierarchy': 'callHierarchy',
}

function computeOperationSupport(capabilities: Record<string, unknown>, dynamicRegs: Set<string>): LSPOperationSupport {
  const provider = (key: string, _cap: string, method: string): boolean => {
    if (dynamicRegs.has(method)) return true
    const val = (capabilities as Record<string, unknown>)[key]
    return val != null && val !== false
  }

  const _textDoc = (capabilities.textDocumentSync ?? {}) as Record<string, unknown>
  const _sup = capabilities as Record<string, unknown>

  return {
    definition: provider('definitionProvider', 'definitionProvider', 'textDocument/definition'),
    references: provider('referencesProvider', 'referencesProvider', 'textDocument/references'),
    hover: provider('hoverProvider', 'hoverProvider', 'textDocument/hover'),
    signatureHelp: provider('signatureHelpProvider', 'signatureHelpProvider', 'textDocument/signatureHelp'),
    documentSymbol: provider('documentSymbolProvider', 'documentSymbolProvider', 'textDocument/documentSymbol'),
    workspaceSymbol: provider('workspaceSymbolProvider', 'workspaceSymbolProvider', 'workspace/symbol'),
    codeAction: provider('codeActionProvider', 'codeActionProvider', 'textDocument/codeAction'),
    rename: provider('renameProvider', 'renameProvider', 'textDocument/rename'),
    implementation: provider('implementationProvider', 'implementationProvider', 'textDocument/implementation'),
    callHierarchy: provider('callHierarchyProvider', 'callHierarchyProvider', 'textDocument/prepareCallHierarchy'),
  }
}

// ── LSP request helpers ────────────────────────────────────────────────────

function makeRequest<T>(
  state: LSPClientState,
  method: string,
  params: unknown,
  timeoutMs = NAV_REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`LSP request ${method} timed out after ${timeoutMs}ms`))
      }
    }, timeoutMs)

    state.connection
      .sendRequest(method, params)
      .then(result => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(result as T)
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      })
  })
}

function makeNotification(state: LSPClientState, method: string, params: unknown): void {
  if (!state.isConnected) return
  state.connection.sendNotification(method, params)
}

// ── Create client ──────────────────────────────────────────────────────────

export interface CreateLSPClientOptions {
  serverId: string
  process: LSPProcess
  root: string
  initializeTimeoutMs?: number
}

export async function createLSPClient(options: CreateLSPClientOptions): Promise<LSPClientInfo> {
  const { serverId, root } = options
  const rootUri = pathToFileURL(root).href

  const reader = new StreamMessageReader(options.process.stdout)
  const writer = new StreamMessageWriter(options.process.stdin)
  const connection = createMessageConnection(reader, writer)

  const diagnosticEmitter = new EventEmitter()

  const state: LSPClientState = {
    isConnected: false,
    isDestroyed: false,
    connectionDisposed: false,
    connection,
    diagnostics: new Map(),
    diagnosticTimestamps: new Map(),
    pendingTimers: new Map(),
    diagnosticEmitter,
    documentVersions: new Map(),
    openDocuments: new Set(),
    operationSupport: {
      definition: false,
      references: false,
      hover: false,
      signatureHelp: false,
      documentSymbol: false,
      workspaceSymbol: false,
      codeAction: false,
      rename: false,
      implementation: false,
      callHierarchy: false,
    },
    serverId,
    root,
    lspProcess: options.process,
  }

  // ── Incoming handlers ──────────────────────────────────────────────────

  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string; diagnostics?: LSPDiagnostic[] }) => {
      const filePath = uriToPath(params.uri)
      const normalizedPath = normalizeMapKey(filePath)
      const newDiags: LSPDiagnostic[] = params.diagnostics || []

      // Debounce — defer to latest batch
      const existingTimer = state.pendingTimers.get(normalizedPath)
      if (existingTimer) clearTimeout(existingTimer)

      const timer = setTimeout(() => {
        state.diagnostics.set(normalizedPath, newDiags)
        state.diagnosticTimestamps.set(normalizedPath, Date.now())
        state.pendingTimers.delete(normalizedPath)
        diagnosticEmitter.emit('diagnostics', normalizedPath)
      }, DIAGNOSTICS_DEBOUNCE_MS)

      state.pendingTimers.set(normalizedPath, timer)
    }
  )

  connection.onRequest('workspace/workspaceFolders', () => [{ name: 'workspace', uri: rootUri }])

  connection.onRequest(
    'client/registerCapability',
    async (params: {
      registrations?: Array<{ id: string; method: string }>
    }) => {
      for (const reg of params?.registrations ?? []) {
        if (reg.id && reg.method && OPERATION_NAMES[reg.method]) {
          state.operationSupport[OPERATION_NAMES[reg.method]] = true
        }
      }
    }
  )

  connection.onRequest(
    'client/unregisterCapability',
    async (_params: {
      unregisterations?: Array<{ id: string }>
    }) => {
      // Dynamic unregistration — we don't track registrations by ID here,
      // so just leave the operation support as-is. Servers typically
      // don't unregister core capabilities.
    }
  )

  connection.listen()

  // ── Initialize handshake ───────────────────────────────────────────────

  const initTimeoutMs = options.initializeTimeoutMs ?? INITIALIZE_TIMEOUT_MS
  const initResult = await makeRequest<{
    capabilities: Record<string, unknown>
  }>(
    state,
    'initialize',
    {
      processId: process.pid,
      clientInfo: { name: 'pi-scope', version: '0.1.0' },
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: false,
          },
          diagnostic: {
            dynamicRegistration: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          completion: {
            completionItem: { snippetSupport: true },
          },
        },
        workspace: {
          workspaceFolders: true,
          symbol: {
            dynamicRegistration: true,
          },
          diagnostic: {
            dynamicRegistration: true,
          },
        },
        window: {
          workDoneProgress: false,
        },
      },
      initializationOptions: {},
      workspaceFolders: [{ name: 'workspace', uri: rootUri }],
    },
    initTimeoutMs
  )

  state.operationSupport = computeOperationSupport(initResult.capabilities, new Set())

  makeNotification(state, 'initialized', {})

  state.isConnected = true

  // ── Build client info ──────────────────────────────────────────────────

  const clientInfo: LSPClientInfo = {
    serverId,
    root,
    connection,
    isAlive: () => isClientAlive(state),

    notify: {
      open: async (filePath: string, content: string, languageId: string) => {
        const uri = pathToFileURL(filePath).href
        const version = (state.documentVersions.get(filePath) ?? 0) + 1
        state.documentVersions.set(filePath, version)
        state.openDocuments.add(filePath)
        makeNotification(state, 'textDocument/didOpen', {
          textDocument: { uri, languageId, version, text: content },
        })
      },
      change: async (filePath: string, content: string) => {
        const uri = pathToFileURL(filePath).href
        const version = (state.documentVersions.get(filePath) ?? 0) + 1
        state.documentVersions.set(filePath, version)
        makeNotification(state, 'textDocument/didChange', {
          textDocument: { uri, version },
          contentChanges: [{ text: content }],
        })
      },
    },

    getDiagnostics: (filePath: string) => {
      return state.diagnostics.get(normalizeMapKey(filePath)) ?? []
    },

    waitForDiagnostics: async (filePath: string, timeoutMs = 3000) => {
      const normalized = normalizeMapKey(filePath)
      if (state.diagnostics.has(normalized)) return

      return new Promise<void>(resolve => {
        const timer = setTimeout(() => resolve(), timeoutMs)
        const handler = (path: string) => {
          if (path === normalized) {
            clearTimeout(timer)
            diagnosticEmitter.off('diagnostics', handler)
            resolve()
          }
        }
        diagnosticEmitter.on('diagnostics', handler)
      })
    },

    getAllDiagnostics: () => {
      const all = new Map<string, { diags: LSPDiagnostic[]; ts: number }>()
      for (const [path, diags] of state.diagnostics) {
        all.set(path, { diags, ts: state.diagnosticTimestamps.get(path) ?? 0 })
      }
      return all
    },

    pruneDiagnostics: (predicate: (filePath: string, ts: number, diags: LSPDiagnostic[]) => boolean) => {
      let removed = 0
      for (const [path, diags] of state.diagnostics) {
        const ts = state.diagnosticTimestamps.get(path) ?? 0
        if (predicate(path, ts, diags)) {
          state.diagnostics.delete(path)
          state.diagnosticTimestamps.delete(path)
          removed++
        }
      }
      return removed
    },

    getOperationSupport: () => ({ ...state.operationSupport }),

    // ── Navigation methods ─────────────────────────────────────────────

    definition: async (filePath, line, character) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPLocation[]>(state, 'textDocument/definition', {
        textDocument: { uri },
        position: { line, character },
      })
    },

    references: async (filePath, line, character, includeDeclaration = true) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPLocation[]>(state, 'textDocument/references', {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration },
      })
    },

    hover: async (filePath, line, character) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPHover | null>(state, 'textDocument/hover', {
        textDocument: { uri },
        position: { line, character },
      })
    },

    signatureHelp: async (filePath, line, character) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPSignatureHelp | null>(state, 'textDocument/signatureHelp', {
        textDocument: { uri },
        position: { line, character },
      })
    },

    documentSymbol: async filePath => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPSymbol[]>(state, 'textDocument/documentSymbol', {
        textDocument: { uri },
      })
    },

    workspaceSymbol: async query => {
      return makeRequest<LSPSymbol[]>(state, 'workspace/symbol', { query })
    },

    codeAction: async (filePath, line, character, endLine, endCharacter) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPCodeAction[]>(state, 'textDocument/codeAction', {
        textDocument: { uri },
        range: {
          start: { line, character },
          end: { line: endLine, character: endCharacter },
        },
        context: { diagnostics: [] },
      })
    },

    rename: async (filePath, line, character, newName) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPWorkspaceEdit | null>(state, 'textDocument/rename', {
        textDocument: { uri },
        position: { line, character },
        newName,
      })
    },

    implementation: async (filePath, line, character) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPLocation[]>(state, 'textDocument/implementation', {
        textDocument: { uri },
        position: { line, character },
      })
    },

    prepareCallHierarchy: async (filePath, line, character) => {
      const uri = pathToFileURL(filePath).href
      return makeRequest<LSPCallHierarchyItem[]>(state, 'textDocument/prepareCallHierarchy', {
        textDocument: { uri },
        position: { line, character },
      })
    },

    incomingCalls: async item => {
      return makeRequest<LSPCallHierarchyIncomingCall[]>(state, 'callHierarchy/incomingCalls', { item })
    },

    outgoingCalls: async item => {
      return makeRequest<LSPCallHierarchyOutgoingCall[]>(state, 'callHierarchy/outgoingCalls', { item })
    },

    shutdown: async () => {
      if (state.isDestroyed) return
      state.isDestroyed = true
      state.isConnected = false

      try {
        await makeRequest<void>(state, 'shutdown', null, 5000)
        makeNotification(state, 'exit', null)
      } catch {
        // server may already be dead
      }

      // Clear pending timers
      for (const timer of state.pendingTimers.values()) {
        clearTimeout(timer)
      }
      state.pendingTimers.clear()

      // Dispose connection
      if (!state.connectionDisposed) {
        state.connectionDisposed = true
        try {
          connection.dispose()
        } catch {
          /* ignore */
        }
      }

      // Kill process
      try {
        if (!options.process.process.killed) {
          options.process.process.kill('SIGTERM')
        }
      } catch {
        /* ignore */
      }
    },
  }

  return clientInfo
}
