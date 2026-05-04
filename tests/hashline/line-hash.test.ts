/**
 * Tests for hashline line-hash module.
 * Test vectors verified against Bun.hash.xxHash32 via oh-my-pi.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initHash, computeLineHash, formatHashLine, formatHashLines, structuralBigram, HASHLINE_BIGRAMS, HASHLINE_BIGRAMS_COUNT } from '../../hashline/line-hash.js';

beforeAll(async () => {
  await initHash();
});

describe('HASHLINE_BIGRAMS', () => {
  it('has 647 entries', () => {
    expect(HASHLINE_BIGRAMS_COUNT).toBe(647);
    expect(HASHLINE_BIGRAMS.length).toBe(647);
  });

  it('all entries are 2-letter lowercase', () => {
    for (const b of HASHLINE_BIGRAMS) {
      expect(b).toMatch(/^[a-z]{2}$/);
    }
  });
});

describe('structuralBigram', () => {
  const cases: [number, string][] = [[1,'st'],[2,'nd'],[3,'rd'],[4,'th'],[11,'th'],[12,'th'],[13,'th'],[21,'st'],[100,'th']];
  for (const [n, exp] of cases) {
    it(`returns ${exp} for ${n}`, () => expect(structuralBigram(n)).toBe(exp));
  }
});

describe('computeLineHash', () => {
  // Verified against Bun.hash.xxHash32
  const vectors: [number, string, string][] = [
    [1, 'const x = 1', 'un'],
    [2, '  return x;', 'mr'],
    [3, '}', 'rd'],
    [42, 'function hi() {', 'tz'],
    [1, '', 'st'],
    [5, '  ', 'th'],
    [10, '  {', 'th'],
    [15, 'import { readFile } from "fs"', 'dr'],
    [20, '    "hello world"', 'uc'],
    [100, '', 'th'],
    [1, 'function hi() {', 'tz'],
    [2, '  return;', 'tr'],
    [10, 'hello', 'tv'],
  ];

  for (const [idx, line, expected] of vectors) {
    it(`computeLineHash(${idx}, ${JSON.stringify(line)}) => ${JSON.stringify(expected)}`, () => {
      expect(computeLineHash(idx, line)).toBe(expected);
    });
  }

  it('strips carriage returns', () => {
    expect(computeLineHash(1, 'const x = 1\r')).toBe('un');
  });

  it('trims trailing whitespace', () => {
    expect(computeLineHash(1, 'const x = 1  ')).toBe('un');
  });
});

describe('formatHashLine', () => {
  it('formats a line with hashline prefix', () => {
    expect(formatHashLine(1, 'function hi() {')).toBe('1tz|function hi() {');
  });
});

describe('formatHashLines', () => {
  it('formats multiple lines', () => {
    expect(formatHashLines('function hi() {\n  return x;\n}')).toBe('1tz|function hi() {\n2mr|  return x;\n3rd|}');
  });

  it('handles empty string', () => {
    expect(formatHashLines('')).toBe('1st|');
  });

  it('respects startLine parameter', () => {
    expect(formatHashLines('hello', 10)).toBe('10tv|hello');
  });
});
