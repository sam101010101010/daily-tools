import { afterEach, describe, expect, it, vi } from 'vitest';

const { parseSpy } = vi.hoisted(() => ({ parseSpy: vi.fn() }));

vi.mock('csv-parse/browser/esm/sync', async importOriginal => {
  const actual = await importOriginal<typeof import('csv-parse/browser/esm/sync')>();
  parseSpy.mockImplementation(actual.parse);
  return { ...actual, parse: parseSpy };
});

import { convertTabular } from './csv';

afterEach(() => {
  parseSpy.mockClear();
});

describe('CSV parser resource boundary', () => {
  it.each([
    ['header mode', true, 100_002, 'id\n1\n'],
    ['no-header mode', false, 100_001, '1\n2\n'],
  ] as const)('caps records materialized in %s', (_label, header, recordCap, input) => {
    expect(convertTabular({
      mode: 'csv-to-json',
      input,
      delimiter: ',',
      header,
      spreadsheetSafe: false,
    })).toMatchObject({ kind: 'success' });

    expect(parseSpy).toHaveBeenCalledOnce();
    expect(parseSpy.mock.calls[0]?.[1]).toMatchObject({ to: recordCap });
  });
});
