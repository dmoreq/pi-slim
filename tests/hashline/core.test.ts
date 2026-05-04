/**
 * Tests for hashline core module.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initHash, computeLineHash } from '../../hashline/line-hash.js';
import {
  parseTag,
  applyHashlineEdits,
  validateLineRef,
  tryRebaseAnchor,
  HashlineMismatchError,
  stripNewLinePrefixes,
  hashlineParseText,
  ANCHOR_REBASE_WINDOW,
} from '../../hashline/core.js';

// Inline hashing helper (sync after init)
function ch(idx: number, line: string): string {
  return computeLineHash(idx, line);
}

beforeAll(async () => {
  await initHash();
});

describe('parseTag', () => {
  it('parses valid tag', () => expect(parseTag('42un')).toEqual({ line: 42, hash: 'un' }));
  it('parses tag with leading whitespace', () => expect(parseTag('  42un')).toEqual({ line: 42, hash: 'un' }));
  it('parses tag with > marker', () => expect(parseTag('>42un')).toEqual({ line: 42, hash: 'un' }));
  it('throws on invalid format', () => expect(() => parseTag('xyz')).toThrow('Invalid line reference'));
  it('throws on line < 1', () => expect(() => parseTag('0un')).toThrow('Line number must be >= 1'));
  it('parses single-digit', () => expect(parseTag('1st')).toEqual({ line: 1, hash: 'st' }));
});

describe('validateLineRef', () => {
  const fileLines = ['const x = 1', '  return x;', '}'];
  it('passes with matching hash', () => expect(() => validateLineRef({ line: 1, hash: ch(1, fileLines[0]) }, fileLines)).not.toThrow());
  it('throws HashlineMismatchError on mismatched hash', () => expect(() => validateLineRef({ line: 1, hash: 'xx' }, fileLines)).toThrow(HashlineMismatchError));
  it('throws on out-of-range line', () => expect(() => validateLineRef({ line: 10, hash: 'un' }, fileLines)).toThrow('Line 10 does not exist'));
});

describe('stripNewLinePrefixes', () => {
  it('strips hashline prefixes when all have them', () => {
    expect(stripNewLinePrefixes(['1un|const x = 1', '2mr|  return x;'])).toEqual(['const x = 1', '  return x;']);
  });
  it('strips diff plus prefixes', () => {
    expect(stripNewLinePrefixes(['+const x = 1', '+  return x;'])).toEqual(['const x = 1', '  return x;']);
  });
  it('returns unchanged when no prefixes', () => {
    const lines = ['const x = 1', '  return x;'];
    expect(stripNewLinePrefixes(lines)).toBe(lines);
  });
});

describe('hashlineParseText', () => {
  it('returns empty for null/undefined', () => { expect(hashlineParseText(null)).toEqual([]); expect(hashlineParseText(undefined)).toEqual([]); });
  it('splits string by newlines', () => expect(hashlineParseText('hello\nworld')).toEqual(['hello', 'world']));
  it('passes through arrays', () => expect(hashlineParseText(['hello', 'world'])).toEqual(['hello', 'world']));
});

describe('applyHashlineEdits', () => {
  const text = 'line one\nline two\nline three';

  it('returns unchanged for empty edits', () => {
    const r = applyHashlineEdits(text, []);
    expect(r.lines).toBe(text);
    expect(r.firstChangedLine).toBeUndefined();
  });

  it('replaces a line', () => {
    const r = applyHashlineEdits(text, [{ op: 'replace_line', pos: { line: 1, hash: ch(1, 'line one') }, lines: ['replaced one'] }]);
    expect(r.lines).toBe('replaced one\nline two\nline three');
  });

  it('replaces a range', () => {
    const r = applyHashlineEdits(text, [{ op: 'replace_range', pos: { line: 1, hash: ch(1, 'line one') }, end: { line: 2, hash: ch(2, 'line two') }, lines: ['new one', 'new two'] }]);
    expect(r.lines).toBe('new one\nnew two\nline three');
  });

  it('appends at a line', () => {
    const r = applyHashlineEdits(text, [{ op: 'append_at', pos: { line: 2, hash: ch(2, 'line two') }, lines: ['appended'] }]);
    expect(r.lines).toBe('line one\nline two\nappended\nline three');
  });

  it('prepends at a line', () => {
    const r = applyHashlineEdits(text, [{ op: 'prepend_at', pos: { line: 2, hash: ch(2, 'line two') }, lines: ['prepended'] }]);
    expect(r.lines).toBe('line one\nprepended\nline two\nline three');
  });

  it('appends to file', () => {
    const r = applyHashlineEdits(text, [{ op: 'append_file', lines: ['fourth line'] }]);
    expect(r.lines).toBe('line one\nline two\nline three\nfourth line');
  });

  it('prepends to file', () => {
    const r = applyHashlineEdits(text, [{ op: 'prepend_file', lines: ['zeroth line'] }]);
    expect(r.lines).toBe('zeroth line\nline one\nline two\nline three');
  });

  it('throws HashlineMismatchError on bad hash', () => {
    expect(() => applyHashlineEdits(text, [{ op: 'replace_line', pos: { line: 1, hash: 'xx' }, lines: ['x'] }])).toThrow(HashlineMismatchError);
  });

  it('detects noop edits', () => {
    const r = applyHashlineEdits(text, [{ op: 'replace_line', pos: { line: 1, hash: ch(1, 'line one') }, lines: ['line one'] }]);
    expect(r.noopEdits).toBeDefined();
    expect(r.noopEdits!.length).toBe(1);
    expect(r.firstChangedLine).toBeUndefined();
  });

  it('auto-rebases within window', () => {
    const lines = ['wrong', 'line one', 'line two'];
    const r = applyHashlineEdits(lines.join('\n'), [{ op: 'replace_line', pos: { line: 1, hash: ch(2, 'line one') }, lines: ['replaced'] }]);
    expect(r.lines).toBe('wrong\nreplaced\nline two');
    expect(r.warnings).toBeDefined();
    expect(r.warnings![0]).toContain('Auto-rebased');
  });
});
