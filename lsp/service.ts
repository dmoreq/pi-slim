/**
 * LSP Navigation Service — wraps LSP client into a simple tool-callable API.
 */

import { type LSPClientInfo, createLSPClient } from "../lsp/client.js";
import { launchLSP, killLSPProcess } from "../lsp/launch.js";
import { getLanguageId } from "../lsp/language.js";
import type { LSPProcess } from "../lsp/launch.js";

interface ServerDef {
  command: string;
  args: string[];
}

const SERVERS: Record<string, ServerDef> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"] },
  python: { command: "pyright-langserver", args: ["--stdio"] },
  go: { command: "gopls", args: [] },
  rust: { command: "rust-analyzer", args: [] },
};

function formatLocation(loc: { uri: string; range: { start: { line: number; character: number } } }): string {
  return `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

export class LspNavigationService {
  private clients = new Map<string, LSPClientInfo>();
  private processes = new Map<string, LSPProcess>();

  async ensureServer(filePath: string, projectRoot: string): Promise<LSPClientInfo> {
    const languageId = getLanguageId(filePath);
    if (!languageId) throw new Error(`No language server available for ${filePath}`);

    const existing = this.clients.get(languageId);
    if (existing && existing.isAlive()) return existing;

    const serverDef = SERVERS[languageId];
    if (!serverDef) throw new Error(`No language server defined for ${languageId}`);

    const proc = await launchLSP(serverDef.command, serverDef.args, { cwd: projectRoot });
    this.processes.set(languageId, proc);

    const client = await createLSPClient({ serverId: languageId, root: projectRoot, process: proc });
    this.clients.set(languageId, client);
    return client;
  }

  async goToDefinition(filePath: string, line: number, column: number, projectRoot: string): Promise<string> {
    const client = await this.ensureServer(filePath, projectRoot);
    const result = await client.definition(filePath, line, column);
    if (!result || result.length === 0) return "No definition found.";
    return `Definition${result.length > 1 ? "s" : ""} found:\n${result.map((loc: { uri: string; range: { start: { line: number; character: number } } }) => `  ${formatLocation(loc)}`).join("\n")}`;
  }

  async findReferences(filePath: string, line: number, column: number, projectRoot: string): Promise<string> {
    const client = await this.ensureServer(filePath, projectRoot);
    const result = await client.references(filePath, line, column, false);
    if (!result || result.length === 0) return "No references found.";
    return `Reference${result.length > 1 ? "s" : ""} found (${result.length}):\n${result.map((loc: { uri: string; range: { start: { line: number; character: number } } }) => `  ${formatLocation(loc)}`).join("\n")}`;
  }

  async hoverInfo(filePath: string, line: number, column: number, projectRoot: string): Promise<string> {
    const client = await this.ensureServer(filePath, projectRoot);
    const hover = await client.hover(filePath, line, column);
    if (!hover) return "No hover info available.";
    const parts: string[] = [];
    const c = hover.contents;
    if (typeof c === "string") parts.push(c);
    else if (Array.isArray(c)) { for (const item of c) parts.push(typeof item === "string" ? item : item.value); }
    else if (c && typeof c === "object" && "value" in c) parts.push((c as { value: string }).value);
    return parts.join("\n").trim();
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.clients].map(([, c]) => c.shutdown().catch(() => {})));
    await Promise.all([...this.processes].map(([, p]) => killLSPProcess(p).catch(() => {})));
    this.clients.clear();
    this.processes.clear();
  }
}
