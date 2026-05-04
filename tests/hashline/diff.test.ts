import { describe, it, expect } from 'vitest';
import { generateDiffString } from '../../hashline/diff.js';

describe('generateDiffString', () => {
  it('produces empty diff for identical content', () => {
    const r = generateDiffString('hello\nworld', 'hello\nworld');
    expect(r.diff).toBe('');
    expect(r.firstChangedLine).toBeUndefined();
  });

  it('detects addition at end', () => {
    const r = generateDiffString('line one\nline two', 'line one\nline two\nline three');
    expect(r.diff).toContain('+');
    expect(r.diff).toContain('line three');
    expect(r.firstChangedLine).toBeTruthy();
  });

  it('detects removal', () => {
    const r = generateDiffString('line one\nline two\nline three', 'line one\nline three');
    expect(r.diff).toContain('-');
  });

  it('detects modification', () => {
    const r = generateDiffString('line one\nold\nline three', 'line one\nnew\nline three');
    expect(r.diff).toContain('+');
    expect(r.diff).toContain('-');
  });

  it('handles empty to non-empty', () => {
    const r = generateDiffString('', 'hello');
    expect(r.diff).toContain('+');
  });

  it('handles multiline additions', () => {
    const r = generateDiffString('line one', 'line one\nline two\nline three');
    expect(r.diff).toContain('+');
    expect(r.firstChangedLine).toBeDefined();
  });
});
