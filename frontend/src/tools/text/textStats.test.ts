import { expect, test } from 'vitest';
import { calculateTextStats } from './textStats';

test.each([
  ['empty text', '', { characters: 0, words: 0, lines: 0, bytes: 0 }],
  ['ASCII text', 'hello world', { characters: 11, words: 2, lines: 1, bytes: 11 }],
  ['CRLF, CR and LF line endings', 'a\r\nb\rc\nd', { characters: 8, words: 4, lines: 4, bytes: 8 }],
  ['a trailing newline', 'a\n', { characters: 2, words: 1, lines: 2, bytes: 2 }],
  ['tab-separated words', 'a\tb\t', { characters: 4, words: 2, lines: 1, bytes: 4 }],
  ['NEL-separated words', 'a\u0085b', { characters: 3, words: 2, lines: 1, bytes: 4 }],
  ['CJK text', '你好 世界', { characters: 5, words: 2, lines: 1, bytes: 13 }],
  ['a combining mark as a separate code point', 'e\u0301', { characters: 2, words: 1, lines: 1, bytes: 3 }],
  ['an emoji code point', '😀', { characters: 1, words: 1, lines: 1, bytes: 4 }],
] as const)('calculateTextStats reports exact ADR-0023 statistics for %s', (_name, input, expected) => {
  expect(calculateTextStats(input)).toEqual(expected);
});

test.each([
  '',
  'ASCII only',
  'e\u0301',
  '你好 世界',
  '😀🚀',
  'A\u00a0B\u3000C',
  'mixed 😀 text\n第二行',
])('UTF-8 byte count is at least the Unicode code-point count for the valid sample %j', (input) => {
  const stats = calculateTextStats(input);

  expect(stats.characters).toBe(Array.from(input).length);
  expect(stats.bytes).toBeGreaterThanOrEqual(stats.characters);
});
