import { expect, test, vi } from 'vitest';

const adapters = vi.hoisted(() => {
  const fixed = {
    uuidV4: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ],
    uuidV7: [
      '01a2ce8b-d400-7000-8000-000000000001',
      '01a2ce8b-d400-7000-8000-000000000002',
      '01a2ce8b-d400-7000-8000-000000000003',
    ],
    ulid: [
      '01K00000000000000000000001',
      '01K00000000000000000000002',
      '01K00000000000000000000003',
    ],
  } as const;
  const indexes = { uuidV4: 0, uuidV7: 0, ulid: 0 };
  const next = (kind: keyof typeof fixed): string => {
    const value = fixed[kind][indexes[kind]];
    indexes[kind] += 1;
    if (value === undefined) throw new Error(`Unexpected extra ${kind} adapter call`);
    return value;
  };
  const generateUlid = vi.fn(() => next('ulid'));

  return {
    fixed,
    uuidV4: vi.fn(() => next('uuidV4')),
    uuidV7: vi.fn(() => next('uuidV7')),
    generateUlid,
    monotonicFactory: vi.fn(() => generateUlid),
  };
});

vi.mock('uuid', async (importOriginal) => {
  const original = await importOriginal<typeof import('uuid')>();
  return {
    ...original,
    v4: adapters.uuidV4,
    v7: adapters.uuidV7,
  };
});

vi.mock('ulid', async (importOriginal) => {
  const original = await importOriginal<typeof import('ulid')>();
  return {
    ...original,
    monotonicFactory: adapters.monotonicFactory,
  };
});

import { generateIds } from './ids';

test('calls the UUID v4 adapter separately for every requested result', () => {
  expect(generateIds({ kind: 'uuid-v4', count: 3 })).toEqual(adapters.fixed.uuidV4);
  expect(adapters.uuidV4).toHaveBeenCalledTimes(3);
});

test('calls the UUID v7 adapter separately for every requested result', () => {
  expect(generateIds({ kind: 'uuid-v7', count: 3 })).toEqual(adapters.fixed.uuidV7);
  expect(adapters.uuidV7).toHaveBeenCalledTimes(3);
});

test('uses one module-owned monotonic ULID adapter and calls it separately for every result', () => {
  expect(generateIds({ kind: 'ulid', count: 3 })).toEqual(adapters.fixed.ulid);
  expect(adapters.monotonicFactory).toHaveBeenCalledTimes(1);
  expect(adapters.generateUlid).toHaveBeenCalledTimes(3);
});
