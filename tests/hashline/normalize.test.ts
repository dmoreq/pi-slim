/**
 * Tests for hashline normalize module.
 */

import { describe, it, expect } from 'vitest';
import {
  detectLineEnding,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
  countLeadingWhitespace,
  getLeadingWhitespace,
  minIndent,
  detectIndentChar,
  normalizeForFuzzy,
  normalizeUnicode,
  adjustIndentation,
} from '../../hashline/normalize.js';

describe('detectLineEnding', () => {
  it('detects LF', () => expect(detectLineEnding('hello\nworld')).toBe('\n'));
  it('detects CRLF when predominant', () => expect(detectLineEnding('hello\r\nworld\r\nfoo')).toBe('\r\n'));
  it('defaults to LF for no newlines', () => expect(detectLineEnding('hello')).toBe('\n'));
  it('detects CRLF when first newline is CRLF', () => expect(detectLineEnding('hello\r\nworld\nfoo')).toBe('\r\n'));
});

describe('normalizeToLF', () => {
  it('converts CRLF to LF', () => expect(normalizeToLF('hello\r\nworld')).toBe('hello\nworld'));
  it('converts CR to LF', () => expect(normalizeToLF('hello\rworld')).toBe('hello\nworld'));
  it('passes LF through', () => expect(normalizeToLF('hello\nworld')).toBe('hello\nworld'));
});

describe('restoreLineEndings', () => {
  it('restores CRLF', () => expect(restoreLineEndings('hello\nworld', '\r\n')).toBe('hello\r\nworld'));
  it('keeps LF when target is LF', () => expect(restoreLineEndings('hello\nworld', '\n')).toBe('hello\nworld'));
});

describe('stripBom', () => {
  it('strips BOM', () => {
    const result = stripBom('\uFEFFhello');
    expect(result.bom).toBe('\uFEFF');
    expect(result.text).toBe('hello');
  });
  it('returns empty bom when absent', () => {
    const result = stripBom('hello');
    expect(result.bom).toBe('');
    expect(result.text).toBe('hello');
  });
});

describe('countLeadingWhitespace', () => {
  it('counts spaces', () => expect(countLeadingWhitespace('  hello')).toBe(2));
  it('counts tabs', () => expect(countLeadingWhitespace('\t\thello')).toBe(2));
  it('returns 0 for no leading space', () => expect(countLeadingWhitespace('hello')).toBe(0));
  it('handles empty string', () => expect(countLeadingWhitespace('')).toBe(0));
});

describe('getLeadingWhitespace', () => {
  it('extracts spaces', () => expect(getLeadingWhitespace('  hello')).toBe('  '));
  it('extracts tabs', () => expect(getLeadingWhitespace('\thello')).toBe('\t'));
  it('returns empty for no indent', () => expect(getLeadingWhitespace('hello')).toBe(''));
});

describe('minIndent', () => {
  it('finds minimum indent of non-empty lines', () => {
    expect(minIndent('  hello\n    world\nfoo')).toBe(0);
  });
  it('returns 0 for empty text', () => expect(minIndent('')).toBe(0));
});

describe('detectIndentChar', () => {
  it('detects spaces', () => expect(detectIndentChar('  hello')).toBe(' '));
  it('detects tabs', () => expect(detectIndentChar('\thello')).toBe('\t'));
  it('defaults to space for no indent', () => expect(detectIndentChar('hello')).toBe(' '));
});

describe('normalizeForFuzzy', () => {
  it('normalizes quotes', () => {
    expect(normalizeForFuzzy('"hello"')).toBe('"hello"');
  });
  it('strips whitespace', () => expect(normalizeForFuzzy('  hello  ')).toBe('hello'));
  it('returns empty for whitespace-only', () => expect(normalizeForFuzzy('   ')).toBe(''));
});

describe('normalizeUnicode', () => {
  it('replaces fancy dashes', () => expect(normalizeUnicode('\u2014')).toBe('-'));
  it('removes zero-width chars', () => expect(normalizeUnicode('he\u200Bllo')).toBe('hello'));
});
