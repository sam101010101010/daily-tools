import { expect, test } from 'vitest';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';

function preview(expression: string, timeZone: string, now: string, profile: 'linux-vixie' | 'macos-bsd' = 'linux-vixie') {
  const parsed = parseCron(profile, expression);
  if (!parsed.ok) throw new Error(`Expected a valid expression: ${expression}`);
  return previewCron(parsed.value, timeZone, new Date(now));
}

function isPreview(value: ReturnType<typeof preview>): asserts value is Extract<ReturnType<typeof preview>, { ok: true }> {
  expect(value).toMatchObject({ ok: true });
}

test('lists the next 10 UTC runs with ISO instants and target-zone text', () => {
  const result = preview('*/15 * * * *', 'UTC', '2024-01-01T00:07:00.000Z');
  isPreview(result);
  expect(result.value.runs).toHaveLength(10);
  expect(result.value.runs.map((run) => run.iso)).toEqual([
    '2024-01-01T00:15:00.000Z', '2024-01-01T00:30:00.000Z', '2024-01-01T00:45:00.000Z',
    '2024-01-01T01:00:00.000Z', '2024-01-01T01:15:00.000Z', '2024-01-01T01:30:00.000Z',
    '2024-01-01T01:45:00.000Z', '2024-01-01T02:00:00.000Z', '2024-01-01T02:15:00.000Z',
    '2024-01-01T02:30:00.000Z',
  ]);
  expect(result.value.runs[0].local).toBe('2024-01-01 00:15:00 UTC');
});

test('lists the next 10 runs in Asia/Shanghai', () => {
  const result = preview('0 9 * * *', 'Asia/Shanghai', '2024-01-01T00:00:00.000Z');
  isPreview(result);
  expect(result.value.runs.map((run) => run.iso)).toEqual([
    '2024-01-01T01:00:00.000Z', '2024-01-02T01:00:00.000Z', '2024-01-03T01:00:00.000Z',
    '2024-01-04T01:00:00.000Z', '2024-01-05T01:00:00.000Z', '2024-01-06T01:00:00.000Z',
    '2024-01-07T01:00:00.000Z', '2024-01-08T01:00:00.000Z', '2024-01-09T01:00:00.000Z',
    '2024-01-10T01:00:00.000Z',
  ]);
  expect(result.value.runs[0].local).toBe('2024-01-01 09:00:00 Asia/Shanghai');
});

test('crosses a month boundary and only runs on leap days', () => {
  const monthBoundary = preview('0 0 1 * *', 'UTC', '2024-01-31T23:59:00.000Z');
  isPreview(monthBoundary);
  expect(monthBoundary.value.runs[0].iso).toBe('2024-02-01T00:00:00.000Z');

  const leapDays = preview('0 0 29 2 *', 'UTC', '2023-03-01T00:00:00.000Z');
  isPreview(leapDays);
  expect(leapDays.value.runs.slice(0, 2).map((run) => run.iso)).toEqual([
    '2024-02-29T00:00:00.000Z', '2028-02-29T00:00:00.000Z',
  ]);
});

test('treats Sunday 0 and 7 as equal', () => {
  const sundayZero = preview('0 0 * * 0', 'UTC', '2024-01-01T00:00:00.000Z');
  const sundaySeven = preview('0 0 * * 7', 'UTC', '2024-01-01T00:00:00.000Z');
  isPreview(sundayZero);
  isPreview(sundaySeven);
  expect(sundayZero.value.runs.map((run) => run.iso)).toEqual(sundaySeven.value.runs.map((run) => run.iso));
});

test('uses OR semantics when day-of-month and day-of-week are both restricted', () => {
  const result = preview('0 0 1 * MON', 'UTC', '2024-01-02T00:00:00.000Z');
  isPreview(result);
  expect(result.value.runs.slice(0, 5).map((run) => run.iso)).toEqual([
    '2024-01-08T00:00:00.000Z', '2024-01-15T00:00:00.000Z', '2024-01-22T00:00:00.000Z',
    '2024-01-29T00:00:00.000Z', '2024-02-01T00:00:00.000Z',
  ]);
});

test.each(['linux-vixie', 'macos-bsd'] as const)(
  '%s keeps Sunday 0/7 equivalence and DOM/DOW OR semantics',
  (profile) => {
    const sundayZero = preview('0 0 * * 0', 'UTC', '2024-01-01T00:00:00.000Z', profile);
    const sundaySeven = preview('0 0 * * 7', 'UTC', '2024-01-01T00:00:00.000Z', profile);
    const domDow = preview('0 0 1 * MON', 'UTC', '2024-01-02T00:00:00.000Z', profile);
    isPreview(sundayZero);
    isPreview(sundaySeven);
    isPreview(domDow);

    expect(sundayZero.value.runs.map((run) => run.iso)).toEqual(sundaySeven.value.runs.map((run) => run.iso));
    expect(domDow.value.runs.slice(0, 5).map((run) => run.iso)).toEqual([
      '2024-01-08T00:00:00.000Z',
      '2024-01-15T00:00:00.000Z',
      '2024-01-22T00:00:00.000Z',
      '2024-01-29T00:00:00.000Z',
      '2024-02-01T00:00:00.000Z',
    ]);
  },
);

test.each(['linux-vixie', 'macos-bsd'] as const)(
  'preserves the selected %s profile in preview success and error results',
  (profile) => {
    const success = preview('0 9 * * *', 'UTC', '2024-01-01T00:00:00.000Z', profile);
    const error = preview('0 9 * * *', 'Mars/Olympus', '2024-01-01T00:00:00.000Z', profile);

    expect(success).toMatchObject({ ok: true, profile });
    expect(error).toEqual({
      ok: false,
      profile,
      error: '不是有效的 IANA 时区',
    });
  },
);

test('skips DST gap occurrences and lists an overlap only once in America/New_York', () => {
  const spring = preview('30 2 * * *', 'America/New_York', '2024-03-09T00:00:00.000Z');
  isPreview(spring);
  expect(spring.value.runs.slice(0, 3)).toEqual([
    { iso: '2024-03-09T07:30:00.000Z', local: '2024-03-09 02:30:00 America/New_York' },
    { iso: '2024-03-11T06:30:00.000Z', local: '2024-03-11 02:30:00 America/New_York' },
    { iso: '2024-03-12T06:30:00.000Z', local: '2024-03-12 02:30:00 America/New_York' },
  ]);

  const autumn = preview('30 1 * * *', 'America/New_York', '2024-11-02T00:00:00.000Z');
  isPreview(autumn);
  expect(autumn.value.runs.slice(0, 3)).toEqual([
    { iso: '2024-11-02T05:30:00.000Z', local: '2024-11-02 01:30:00 America/New_York' },
    { iso: '2024-11-03T05:30:00.000Z', local: '2024-11-03 01:30:00 America/New_York' },
    { iso: '2024-11-04T06:30:00.000Z', local: '2024-11-04 01:30:00 America/New_York' },
  ]);
});

test('deduplicates a shifted DST gap when the shifted wall time also matches', () => {
  const result = preview('30 2-3 * * *', 'America/New_York', '2024-03-09T00:00:00.000Z');
  isPreview(result);

  expect(result.value.runs).toHaveLength(10);
  expect(new Set(result.value.runs.map(run => run.iso)).size).toBe(10);
  expect(result.value.runs.filter(run => run.local === '2024-03-10 03:30:00 America/New_York')).toEqual([
    { iso: '2024-03-10T07:30:00.000Z', local: '2024-03-10 03:30:00 America/New_York' },
  ]);
});

test('rejects an invalid IANA timezone before previewing', () => {
  expect(preview('0 0 * * *', 'Mars/Olympus', '2024-01-01T00:00:00.000Z')).toEqual({
    ok: false,
    profile: 'linux-vixie',
    error: '不是有效的 IANA 时区',
  });
});

test('rejects an offset identifier that Intl accepts but is not an IANA timezone name', () => {
  expect(preview('0 0 * * *', '+01:00', '2024-01-01T00:00:00.000Z')).toEqual({
    ok: false,
    profile: 'linux-vixie',
    error: '不是有效的 IANA 时区',
  });
});
