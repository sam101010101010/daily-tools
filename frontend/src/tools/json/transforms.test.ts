import { expect, test } from 'vitest';
import { sortKeys, dedupe, deepEqual } from './transforms';

test('sortKeys orders object keys alphabetically', () => {
  expect(Object.keys(sortKeys({ b: 1, a: 1, c: 1 }) as object)).toEqual(['a', 'b', 'c']);
});
test('sortKeys is deep', () => {
  const r = sortKeys({ z: { y: 1, x: 1 } }) as { z: object };
  expect(Object.keys(r.z)).toEqual(['x', 'y']);
});
test('sortKeys recurses through arrays but keeps element order', () => {
  const r = sortKeys([{ b: 1, a: 1 }]) as Array<object>;
  expect(Object.keys(r[0])).toEqual(['a', 'b']);
});
test('sortKeys leaves scalars untouched', () => {
  expect(sortKeys(42)).toBe(42);
});

test('dedupe removes deep-equal array duplicates, keeping first occurrence order', () => {
  expect(dedupe([2, 1, 2, { a: 1 }, { a: 1 }])).toEqual([2, 1, { a: 1 }]);
});
test('dedupe recurses into nested arrays', () => {
  expect(dedupe({ xs: [1, 1, 2] })).toEqual({ xs: [1, 2] });
});
test('dedupe treats key order as equal', () => {
  expect(dedupe([{ a: 1, b: 2 }, { b: 2, a: 1 }])).toEqual([{ a: 1, b: 2 }]);
});

test('deepEqual is order-insensitive for object keys', () => {
  expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
});
