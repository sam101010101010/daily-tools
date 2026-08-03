import { expect, test } from 'vitest';
import { applyTextOperation, normalizeNewlines, type TextOperation } from './textOperations';

test('normalizeNewlines converts CRLF and CR to LF', () => {
  expect(normalizeNewlines('first\r\nsecond\rthird\nfourth')).toBe('first\nsecond\nthird\nfourth');
});

test.each<[TextOperation, string, string]>([
  ['uppercase', 'a\r\nb!', 'A\nB!'],
  ['lowercase', 'A\rB!', 'a\nb!'],
  ['trim', '\r\n  hello  \r\n', 'hello'],
  ['trim-lines', ' a \r\n\tb\t\r', 'a\nb\n'],
  ['collapse-horizontal-whitespace', 'a  \t b\r\n c\t\td', 'a b\n c d'],
  ['remove-blank-lines', 'a\r\n \t\r\n\r\nb\n', 'a\nb'],
  ['sort-ascending', 'z\n😀\na\nA', 'A\na\nz\n😀'],
  ['sort-descending', 'z\n😀\na\nA', '😀\nz\na\nA'],
  ['reverse-lines', 'a\r\nb\rc\n', '\nc\nb\na'],
  ['dedupe-lines', 'a\r\n\r\na\nA\n\nA', 'a\n\nA'],
])('applyTextOperation %s performs its one deterministic transform', (operation, input, output) => {
  expect(applyTextOperation({ operation, input }).output).toBe(output);
});

test('operations accept empty text and only-newline input deterministically', () => {
  expect(applyTextOperation({ operation: 'trim', input: '' }).output).toBe('');
  expect(applyTextOperation({ operation: 'remove-blank-lines', input: '\r\n\n' }).output).toBe('');
  expect(applyTextOperation({ operation: 'reverse-lines', input: '\r\n' }).output).toBe('\n');
});

test('line operations preserve a trailing newline unless their own semantics remove it', () => {
  expect(applyTextOperation({ operation: 'sort-ascending', input: 'b\na\n' }).output).toBe('\na\nb');
  expect(applyTextOperation({ operation: 'dedupe-lines', input: 'a\na\n' }).output).toBe('a\n');
});

test('ascending sort compares Unicode code points rather than UTF-16 code units', () => {
  expect(applyTextOperation({ operation: 'sort-ascending', input: '😀\n\uE000' }).output).toBe('\uE000\n😀');
});

test('dedupe preserves the first exact occurrence, including empty lines and case differences', () => {
  expect(applyTextOperation({ operation: 'dedupe-lines', input: '\n\na\nA\na\n' }).output).toBe('\na\nA');
});

test('applyTextOperation returns statistics for its output without mutating its input request', () => {
  const request = { operation: 'sort-ascending' as const, input: '😀\na\n😀' };
  const snapshot = { ...request };

  expect(applyTextOperation(request)).toEqual({
    output: 'a\n😀\n😀',
    stats: { characters: 5, words: 3, lines: 3, bytes: 11 },
  });
  expect(request).toEqual(snapshot);
});
