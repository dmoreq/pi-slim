/**
 * LSP Navigation Tools — go-to-definition, find-references, hover info.
 *
 * Registers three tools that use LSP for code intelligence.
 * LSP servers are started lazily and shut down at session end.
 *
 * @module
 */

import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";
import { LspNavigationService } from "../lsp/service.js";

let service: LspNavigationService | null = null;

function getService(): LspNavigationService {
  if (!service) service = new LspNavigationService();
  return service;
}

export async function shutdownLsp(): Promise<void> {
  if (service) { await service.shutdown(); service = null; }
}

// ── Common helpers ───────────────────────────────────────────────────────

const fpParams = Type.Object({
  path: Type.String({ description: "File path (relative to cwd or absolute)" }),
  line: Type.Integer({ description: "Line number (0-indexed)" }),
  column: Type.Integer({ description: "Column number (0-indexed)" }),
});

function ctxDir(ctx: unknown): string {
  return (ctx as { cwd?: string })?.cwd ?? process.cwd();
}

// ── Tool: goToDefinition ─────────────────────────────────────────────────

const goToDefTool = defineTool({
  name: "lsp_go_to_definition",
  label: "Go to Definition",
  description: "Find the definition of a symbol at a specific file position using LSP.",
  parameters: fpParams,
  async execute(_tid: string, p: { path: string; line: number; column: number }, _sig: AbortSignal | undefined, _upd: unknown, ctx: unknown) {
    try {
      const fp = resolve(ctxDir(ctx), p.path);
      const result = await getService().goToDefinition(fp, p.line, p.column, ctxDir(ctx));
      return { content: [{ type: "text" as const, text: result }], details: { ok: true } };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `LSP error: ${err.message ?? String(err)}` }], details: { ok: false } };
    }
  },
});

// ── Tool: findReferences ─────────────────────────────────────────────────

const findRefsTool = defineTool({
  name: "lsp_find_references",
  label: "Find References",
  description: "Find all references to a symbol at a specific file position using LSP.",
  parameters: fpParams,
  async execute(_tid: string, p: { path: string; line: number; column: number }, _sig: AbortSignal | undefined, _upd: unknown, ctx: unknown) {
    try {
      const fp = resolve(ctxDir(ctx), p.path);
      const result = await getService().findReferences(fp, p.line, p.column, ctxDir(ctx));
      return { content: [{ type: "text" as const, text: result }], details: { ok: true } };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `LSP error: ${err.message ?? String(err)}` }], details: { ok: false } };
    }
  },
});

// ── Tool: hoverInfo ──────────────────────────────────────────────────────

const hoverTool = defineTool({
  name: "lsp_hover",
  label: "Hover Info",
  description: "Get type information and documentation at a cursor position using LSP.",
  parameters: fpParams,
  async execute(_tid: string, p: { path: string; line: number; column: number }, _sig: AbortSignal | undefined, _upd: unknown, ctx: unknown) {
    try {
      const fp = resolve(ctxDir(ctx), p.path);
      const result = await getService().hoverInfo(fp, p.line, p.column, ctxDir(ctx));
      return { content: [{ type: "text" as const, text: result }], details: { ok: true } };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `LSP error: ${err.message ?? String(err)}` }], details: { ok: false } };
    }
  },
});

// ── Registration ─────────────────────────────────────────────────────────

export function registerLspTools(pi: ExtensionAPI): void {
  pi.registerTool(goToDefTool as any);
  pi.registerTool(findRefsTool as any);
  pi.registerTool(hoverTool as any);
}

export default registerLspTools;
