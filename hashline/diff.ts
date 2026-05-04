/**
 * Diff string generation — extracted from oh-my-pi.
 * Uses the `diff` npm package for line-level diffing.
 * @module
 */

import * as Diff from "diff";

export interface DiffResult {
  diff: string;
  firstChangedLine: number | undefined;
}

function formatNumberedDiffLine(prefix: "+" | "-" | " ", lineNum: number, content: string): string {
  return `${prefix}${lineNum}|${content}`;
}

/**
 * Generate a unified diff string with line numbers and context.
 * Models the diff in numbered-line format compatible with buildCompactHashlineDiffPreview.
 */
export function generateDiffString(oldContent: string, newContent: string, contextLines = 4): DiffResult {
  const parts = Diff.diffLines(oldContent, newContent);
  const output: string[] = [];
  let oldLineNum = 1, newLineNum = 1;
  let lastWasChange = false;
  let firstChangedLine: number | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = part.value.split("\n");
    if (raw[raw.length - 1] === "") raw.pop();

    if (part.added || part.removed) {
      if (firstChangedLine === undefined) firstChangedLine = newLineNum;
      for (const line of raw) {
        if (part.added) { output.push(formatNumberedDiffLine("+", newLineNum, line)); newLineNum++; }
        else { output.push(formatNumberedDiffLine("-", oldLineNum, line)); oldLineNum++; }
      }
      lastWasChange = true;
    } else {
      const nextIsChange = i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);
      if (lastWasChange || nextIsChange) {
        const limit = Math.max(0, contextLines);
        let leadingSkip = 0, middleSkip = 0, trailingSkip = 0;
        let linesToShow: string[];

        if (lastWasChange && nextIsChange) {
          if (raw.length > limit * 2) { linesToShow = [...raw.slice(0, limit), ...raw.slice(raw.length - limit)]; middleSkip = raw.length - linesToShow.length; }
          else linesToShow = raw;
        } else if (nextIsChange) { leadingSkip = Math.max(0, raw.length - limit); linesToShow = raw.slice(leadingSkip); }
        else { trailingSkip = Math.max(0, raw.length - limit); linesToShow = raw.slice(0, limit); }

        if (leadingSkip > 0) {
          output.push(formatNumberedDiffLine(" ", oldLineNum, "..."));
          oldLineNum += leadingSkip; newLineNum += leadingSkip;
        }

        const firstChunkLen = middleSkip > 0 ? limit : linesToShow.length;
        for (const line of linesToShow.slice(0, firstChunkLen)) {
          output.push(formatNumberedDiffLine(" ", oldLineNum, line));
          oldLineNum++; newLineNum++;
        }

        if (middleSkip > 0) {
          output.push(formatNumberedDiffLine(" ", oldLineNum, "..."));
          oldLineNum += middleSkip; newLineNum += middleSkip;
          for (const line of linesToShow.slice(firstChunkLen)) {
            output.push(formatNumberedDiffLine(" ", oldLineNum, line));
            oldLineNum++; newLineNum++;
          }
        }

        if (trailingSkip > 0) {
          output.push(formatNumberedDiffLine(" ", oldLineNum, "..."));
          oldLineNum += trailingSkip; newLineNum += trailingSkip;
        }
      } else {
        oldLineNum += raw.length; newLineNum += raw.length;
      }
      lastWasChange = false;
    }
  }

  return { diff: output.join("\n"), firstChangedLine };
}
