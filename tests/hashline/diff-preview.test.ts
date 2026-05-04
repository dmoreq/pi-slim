/**
 * Tests for hashline diff preview module.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initHash } from '../../hashline/line-hash.js';
import { buildCompactHashlineDiffPreview } from '../../hashline/diff-preview.js';
import { generateDiffString } from '../../hashline/diff.js';

beforeAll(async () => {
  await initHash();
});

describe('buildCompactHashlineDiffPreview', () => {
  it('produces preview with counters', () => {
    const diff = generateDiffString('line one\nline two', 'line one\nmodified\nalso new\nline two');
    const preview = buildCompactHashlineDiffPreview(diff.diff);
    expect(preview.addedLines).toBeGreaterThan(0);
    expect(typeof preview.preview).toBe('string');
    expect(preview.preview.length).toBeGreaterThan(0);
  });

  it('handles empty diff', () => {
    const preview = buildCompactHashlineDiffPreview('');
    expect(preview.addedLines).toBe(0);
    expect(preview.removedLines).toBe(0);
    expect(preview.preview).toBe('');
  });

  it('produces preview for single deletion', () => {
    const diff = generateDiffString('line one\nremove me\nline three', 'line one\nline three');
    const preview = buildCompactHashlineDiffPreview(diff.diff);
    expect(preview.removedLines).toBe(1);
  });

  it('produces preview for single addition', () => {
    const diff = generateDiffString('line one\nline three', 'line one\ninserted\nline three');
    const preview = buildCompactHashlineDiffPreview(diff.diff);
    expect(preview.addedLines).toBe(1);
  });

  it('pairs adjacent -/+ lines into modification markers', () => {
    const diff = generateDiffString('old', 'new');
    const preview = buildCompactHashlineDiffPreview(diff.diff);
    expect(preview.addedLines).toBe(1);
    expect(preview.removedLines).toBe(1);
  });
});
