import { afterEach, describe, expect, test, vi } from 'vitest';
import { decodeUuidV7Timestamp, generateIds, inspectId } from './ids';

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

describe('inspectId', () => {
  test('reports a UUID v4 with only its provable RFC metadata', () => {
    expect(inspectId('550e8400-e29b-41d4-a716-446655440000')).toEqual({
      kind: 'uuid-v4',
      canonical: '550e8400-e29b-41d4-a716-446655440000',
      version: 4,
      variant: 'RFC_4122',
    });
  });

  test('normalizes a noncanonical uppercase UUID v4', () => {
    expect(inspectId('550E8400-E29B-41D4-A716-446655440000')).toEqual({
      kind: 'uuid-v4',
      canonical: '550e8400-e29b-41d4-a716-446655440000',
      version: 4,
      variant: 'RFC_4122',
    });
  });

  test('reports the timestamp encoded in a UUID v7 vector', () => {
    expect(inspectId('01a2ce8b-d400-7000-8000-000000000000')).toEqual({
      kind: 'uuid-v7',
      canonical: '01a2ce8b-d400-7000-8000-000000000000',
      version: 7,
      variant: 'RFC_4122',
      timestamp: Date.parse('2027-01-01T00:00:00.000Z'),
    });
  });

  test('decodes the first 48 UUID v7 timestamp bits without using the random bits', () => {
    expect(decodeUuidV7Timestamp('01a2ce8b-d400-7fff-bfff-ffffffffffff')).toBe(
      Date.parse('2027-01-01T00:00:00.000Z'),
    );
  });

  test('reports a canonical ULID and its encoded timestamp', () => {
    expect(inspectId('01ARYZ6S41TSV4RRFFQ69G5FAV')).toEqual({
      kind: 'ulid',
      canonical: '01ARYZ6S41TSV4RRFFQ69G5FAV',
      timestamp: 1469918176385,
    });
  });

  test('normalizes a lowercase ULID', () => {
    expect(inspectId('01aryz6s41tsv4rrffq69g5fav')).toEqual({
      kind: 'ulid',
      canonical: '01ARYZ6S41TSV4RRFFQ69G5FAV',
      timestamp: 1469918176385,
    });
  });

  test('returns a stable overflow error for a ULID timestamp above 48 bits', () => {
    expect(inspectId('80000000000000000000000000')).toEqual({
      kind: 'invalid',
      errorCode: 'TIME_OVERFLOW',
    });
  });

  test('returns a stable invalid error for a ULID containing an ambiguous character', () => {
    expect(inspectId('01ARYZ6S41TSV4RRFFQ69G5FAI')).toEqual({
      kind: 'invalid',
      errorCode: 'INVALID_ID',
    });
  });

  test('returns a stable invalid error for a malformed UUID v4', () => {
    expect(inspectId('550e8400-e29b-41d4-7716-446655440000')).toEqual({
      kind: 'invalid',
      errorCode: 'INVALID_ID',
    });
  });

  test.each([
    'not-a-ulid-identifier-0000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  ])('rejects an unrelated identifier-shaped string: %s', (input) => {
    expect(inspectId(input)).toEqual({
      kind: 'invalid',
      errorCode: 'INVALID_ID',
    });
  });
});
