/**
 * Compact diff preview builder for hashline edits.
 * Extracted from oh-my-pi's buildCompactHashlineDiffPreview.
 * @module
 */

import { computeLineHash, HASHLINE_CONTENT_SEPARATOR } from "./line-hash.js";

const NUMBERED_DIFF_LINE_RE = /^([ +-])(\s*\d+)\|(.*)$/;
const ELLIPSIS = "...";
const PLACEHOLDER = "  ";

export interface CompactHashlineDiffPreview {
  preview: string;
  addedLines: number;
  removedLines: number;
}

export interface CompactHashlineDiffOptions {
  maxUnchangedRun?: number;
}

type EntryKind = " " | "+" | "-" | "*" | "meta";

interface Entry {
  kind: EntryKind;
  oldLine: number;
  newLine: number;
  content: string;
  raw?: string;
}

// ── Parse numbered diff lines ────────────────────────────────────────────

function parseLine(line: string): { kind: " " | "+" | "-"; lineNumber: number; content: string } | undefined {
  const m = NUMBERED_DIFF_LINE_RE.exec(line);
  if (!m || (m[1] !== " " && m[1] !== "+" && m[1] !== "-")) return undefined;
  const n = Number(m[2].trim());
  if (!Number.isInteger(n)) return undefined;
  return { kind: m[1] as " " | "+" | "-", lineNumber: n, content: m[3] };
}

// ── Parse diff into entries ──────────────────────────────────────────────

function parseEntries(lines: string[]): Entry[] {
  const entries: Entry[] = [];
  let old = 0, neu = 0;

  for (const line of lines) {
    const p = parseLine(line);
    if (!p) { entries.push({ kind: "meta", oldLine: 0, newLine: 0, content: "", raw: line }); continue; }

    const isEl = p.content === ELLIPSIS;
    if (p.kind === "+") {
      if (!neu) neu = p.lineNumber; else neu += p.lineNumber - (entries[entries.length - 1]?.newLine ?? neu);
      entries.push({ kind: "+", oldLine: old || p.lineNumber, newLine: neu, content: p.content });
      if (!isEl) neu++;
    } else if (p.kind === "-") {
      if (!old) old = p.lineNumber; else old += p.lineNumber - (entries[entries.length - 1]?.oldLine ?? old);
      entries.push({ kind: "-", oldLine: p.lineNumber, newLine: neu || p.lineNumber, content: p.content });
      if (!isEl) old++;
    } else {
      if (!old) old = p.lineNumber; else old += p.lineNumber - (entries[entries.length - 1]?.oldLine ?? old);
      if (!neu) neu = p.lineNumber; else neu += p.lineNumber - (entries[entries.length - 1]?.newLine ?? neu);
      entries.push({ kind: " ", oldLine: p.lineNumber, newLine: neu, content: p.content });
      if (!isEl) { old++; neu++; }
    }
  }
  return entries;
}

// ── Group runs and pair modifications ────────────────────────────────────

function groupRuns(entries: Entry[]): Array<{ kind: EntryKind; entries: Entry[] }> {
  const runs: Array<{ kind: EntryKind; entries: Entry[] }> = [];
  for (const e of entries) {
    p: if (runs.length > 0) {
      const last = runs[runs.length - 1];
      if (last.kind === e.kind) { last.entries.push(e); break p; }
    }
    runs.push({ kind: e.kind, entries: [e] });
  }
  return runs;
}

function pairMods(runs: Array<{ kind: EntryKind; entries: Entry[] }>): Array<{ kind: EntryKind; entries: Entry[] }> {
  const out: Array<{ kind: EntryKind; entries: Entry[] }> = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i], next = runs[i + 1];
    if (run.kind !== "-" || !next || next.kind !== "+") { out.push(run); continue; }

    const dels = run.entries.filter(e => e.kind !== "meta" && e.content !== ELLIPSIS) as Array<Entry & { kind: "-" | "+" | " " }>;
    const adds = next.entries.filter(e => e.kind !== "meta" && e.content !== ELLIPSIS) as Array<Entry & { kind: "-" | "+" | " " }>;
    const pairCount = Math.min(dels.length, adds.length);
    if (pairCount === 0) { out.push(run); continue; }

    const mods: Entry[] = [];
    for (let p = 0; p < pairCount; p++) mods.push({ kind: "*", oldLine: dels[p].oldLine, newLine: adds[p].newLine, content: adds[p].content });
    out.push({ kind: "*", entries: mods });
    if (dels.length > pairCount) out.push({ kind: "-", entries: dels.slice(pairCount).map(e => ({ ...e })) });
    if (adds.length > pairCount) out.push({ kind: "+", entries: adds.slice(pairCount).map(e => ({ ...e })) });
    i++;
  }
  return out;
}

// ── Format a single entry ────────────────────────────────────────────────

function fmt(e: Entry): string {
  if (e.kind === "meta") return e.raw ?? "";
  if (e.content === ELLIPSIS) {
    const n = e.kind === "+" || e.kind === "*" ? e.newLine : e.oldLine;
    return `${e.kind === "*" ? "+" : e.kind}${n}${PLACEHOLDER}${HASHLINE_CONTENT_SEPARATOR}${ELLIPSIS}`;
  }
  switch (e.kind) {
    case "+": return `+${e.newLine}${computeLineHash(e.newLine, e.content)}${HASHLINE_CONTENT_SEPARATOR}${e.content}`;
    case "-": return `-${e.oldLine}${PLACEHOLDER}${HASHLINE_CONTENT_SEPARATOR}${e.content}`;
    case " ": return ` ${e.newLine}${computeLineHash(e.newLine, e.content)}${HASHLINE_CONTENT_SEPARATOR}${e.content}`;
    case "*": return `*${e.newLine}${computeLineHash(e.newLine, e.content)}${HASHLINE_CONTENT_SEPARATOR}${e.content}`;
    default: return "";
  }
}

function collapseMiddle(entries: Entry[], maxRun: number): string[] {
  if (entries.length <= maxRun * 2) return entries.map(fmt);
  const hidden = entries.length - maxRun * 2;
  return [...entries.slice(0, maxRun).map(fmt), ` ... ${hidden} more unchanged lines`, ...entries.slice(-maxRun).map(fmt)];
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

export function buildCompactHashlineDiffPreview(
  diff: string, options: CompactHashlineDiffOptions = {},
): CompactHashlineDiffPreview {
  const maxRun = options.maxUnchangedRun ?? 2;
  const inputLines = diff.length === 0 ? [] : diff.split("\n");
  const runs = pairMods(groupRuns(parseEntries(inputLines)));

  const out: string[] = [];
  let added = 0, removed = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    switch (run.kind) {
      case "meta": run.entries.forEach(e => out.push(fmt(e))); break;
      case "+": run.entries.forEach(e => { if (e.content !== ELLIPSIS) added++; out.push(fmt(e)); }); break;
      case "-": run.entries.forEach(e => { if (e.content !== ELLIPSIS) removed++; out.push(fmt(e)); }); break;
      case "*": run.entries.forEach(e => { added++; removed++; out.push(fmt(e)); }); break;
      case " ":
        if (i === 0) { out.push(...run.entries.slice(-maxRun).map(fmt)); break; }
        if (i === runs.length - 1) { out.push(...run.entries.slice(0, maxRun).map(fmt)); break; }
        out.push(...collapseMiddle(run.entries, maxRun));
        break;
    }
  }

  return { preview: out.join("\n"), addedLines: added, removedLines: removed };
}
