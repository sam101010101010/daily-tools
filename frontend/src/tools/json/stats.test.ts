import { expect, test } from 'vitest';
import { jsonStats } from './stats';

test('jsonStats counts nodes, depth and per-type totals', () => {
  expect(jsonStats({ a: [1, 2], b: 'x' })).toEqual({
    nodes: 5,
    depth: 3,
    types: { object: 1, array: 1, string: 1, number: 2, boolean: 0, null: 0 },
  });
});
test('jsonStats on a scalar is one node at depth one', () => {
  expect(jsonStats(true)).toEqual({
    nodes: 1,
    depth: 1,
    types: { object: 0, array: 0, string: 0, number: 0, boolean: 1, null: 0 },
  });
});
test('jsonStats counts null distinctly from object', () => {
  expect(jsonStats(null).types).toEqual({ object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 1 });
});
test('jsonStats empty container has depth one', () => {
  expect(jsonStats([])).toEqual({
    nodes: 1,
    depth: 1,
    types: { object: 0, array: 1, string: 0, number: 0, boolean: 0, null: 0 },
  });
});
