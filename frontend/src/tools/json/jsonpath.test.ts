import { expect, test } from 'vitest';
import { queryJsonPath } from './jsonpath';

const data = {
  store: {
    book: [
      { title: 'A', price: 1 },
      { title: 'B', price: 2 },
    ],
    bicycle: { price: 20 },
  },
};

test('$ returns the root', () => {
  expect(queryJsonPath(data, '$').matches).toEqual([data]);
});
test('dot navigation into nested objects', () => {
  expect(queryJsonPath(data, '$.store.bicycle.price').matches).toEqual([20]);
});
test('array index', () => {
  expect(queryJsonPath(data, '$.store.book[0].title').matches).toEqual(['A']);
});
test('wildcard over an array', () => {
  expect(queryJsonPath(data, '$.store.book[*].price').matches).toEqual([1, 2]);
});
test('bracket-quoted keys', () => {
  expect(queryJsonPath(data, "$['store']['bicycle']['price']").matches).toEqual([20]);
});
test('recursive descent collects a key at any depth, in document order', () => {
  expect(queryJsonPath(data, '$..price').matches).toEqual([1, 2, 20]);
});
test('no match is ok with an empty match list', () => {
  expect(queryJsonPath(data, '$.nope')).toEqual({ ok: true, matches: [] });
});
test('a path not starting with $ is a reported error, not a throw', () => {
  const r = queryJsonPath(data, 'store.price');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/\$/);
});
test('negative array index counts from the end', () => {
  expect(queryJsonPath(data, '$.store.book[-1].title').matches).toEqual(['B']);
});
