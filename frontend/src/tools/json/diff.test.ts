import { expect, test } from 'vitest';
import { diffJson } from './diff';

test('equal values produce no diff', () => {
  expect(diffJson({ a: 1 }, { a: 1 })).toEqual([]);
});
test('detects changed and added object keys, in a stable order', () => {
  expect(diffJson({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
    { path: '$.b', kind: 'change', before: 2, after: 3 },
    { path: '$.c', kind: 'add', after: 4 },
  ]);
});
test('detects a removed key', () => {
  expect(diffJson({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: '$.b', kind: 'del', before: 2 }]);
});
test('nested change carries a dotted path', () => {
  expect(diffJson({ x: { y: 1 } }, { x: { y: 2 } })).toEqual([
    { path: '$.x.y', kind: 'change', before: 1, after: 2 },
  ]);
});
test('arrays diff by index', () => {
  expect(diffJson([1, 2], [1, 3, 4])).toEqual([
    { path: '$[1]', kind: 'change', before: 2, after: 3 },
    { path: '$[2]', kind: 'add', after: 4 },
  ]);
});
test('type change is reported as a change', () => {
  expect(diffJson({ a: 1 }, { a: '1' })).toEqual([
    { path: '$.a', kind: 'change', before: 1, after: '1' },
  ]);
});
