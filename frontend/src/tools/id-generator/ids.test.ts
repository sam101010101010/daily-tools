import { afterEach, describe, expect, test, vi } from 'vitest';
import { generateIds } from './ids';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

afterEach(() => {
  vi.useRealTimers();
});

test('generates canonical lowercase UUID v4 values with RFC version and variant bits', () => {
  const [id] = generateIds({ kind: 'uuid-v4' });

  expect(id).toMatch(UUID_V4_PATTERN);
});

test('generates UUID v7 values in timestamp order', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
  const [first] = generateIds({ kind: 'uuid-v7' });
  vi.advanceTimersByTime(1);
  const [second] = generateIds({ kind: 'uuid-v7' });

  expect(first).toMatch(UUID_V7_PATTERN);
  expect(second).toMatch(UUID_V7_PATTERN);
  expect([first, second]).toEqual([first, second].toSorted());
});

test('generates uppercase monotonic ULIDs in lexical order within one millisecond', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
  const ids = generateIds({ kind: 'ulid', count: 3 });

  expect(ids).toHaveLength(3);
  expect(ids.every((id) => ULID_PATTERN.test(id))).toBe(true);
  expect(ids).toEqual(ids.toSorted());
});

test('defaults the count to one', () => {
  expect(generateIds({ kind: 'uuid-v4' })).toHaveLength(1);
});

describe.each([1, 100])('count %i', (count) => {
  test.each(['uuid-v4', 'uuid-v7', 'ulid'] as const)('generates exactly that many independent %s values', (kind) => {
    const ids = generateIds({ kind, count });

    expect(ids).toHaveLength(count);
    expect(new Set(ids)).toHaveLength(count);
  });
});

test.each([1.5, 0, -1, 101])('rejects invalid count %p', (count) => {
  expect(() => generateIds({ kind: 'uuid-v4', count })).toThrow(RangeError);
});
