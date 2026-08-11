import { expect, test } from 'vitest';
import { compareTimeZones, formatInitialWallTime } from './timezone';

test('compares one source wall time with the requested target order', () => {
  expect(compareTimeZones({
    input: '2026-08-11T09:00',
    sourceTimeZone: 'Asia/Shanghai',
    targetTimeZones: ['UTC'],
  })).toMatchObject({
    status: 'ready',
    epochMilliseconds: 1_786_410_000_000,
    rows: [
      { role: 'source', timeZone: 'Asia/Shanghai', date: '2026-08-11', time: '09:00', offset: 'UTC+08:00', dayDelta: 0 },
      { role: 'target', timeZone: 'UTC', date: '2026-08-11', time: '01:00', offset: 'UTC+00:00', dayDelta: 0 },
    ],
  });
});

test('supports one through four unique target zones in the supplied order', () => {
  const targetTimeZones = ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kathmandu'];

  for (let count = 1; count <= 4; count += 1) {
    const result = compareTimeZones({
      input: '2026-08-11T09:00',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: targetTimeZones.slice(0, count),
    });

    expect(result).toMatchObject({ status: 'ready' });
    if (result.status === 'ready') {
      expect(result.rows.map(row => row.timeZone)).toEqual(['Asia/Shanghai', ...targetTimeZones.slice(0, count)]);
    }
  }
});

test('rejects strict-input, source/target-zone, target-count, and duplicate-target violations', () => {
  const invalidRequests = [
    { input: '2026-08-11T09:00:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['UTC'] },
    { input: '2026-02-30T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['UTC'] },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Mars/Olympus_Mons', targetTimeZones: ['UTC'] },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['Mars/Olympus_Mons'] },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: [] },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['UTC', 'UTC'] },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kathmandu', 'Asia/Tokyo'] },
  ] as const;

  for (const request of invalidRequests) {
    expect(compareTimeZones(request)).toMatchObject({ status: 'invalid' });
  }
});

test('reports a source DST gap without result rows', () => {
  expect(compareTimeZones({
    input: '2024-03-10T02:30',
    sourceTimeZone: 'America/New_York',
    targetTimeZones: ['UTC'],
  })).toEqual({ status: 'gap', message: '该本地时间在所选时区不存在（夏令时跳转）' });
});

test('requires an explicit fold choice and returns stable earlier and later candidates', () => {
  const request = {
    input: '2024-11-03T01:30',
    sourceTimeZone: 'America/New_York',
    targetTimeZones: ['UTC'],
  } as const;

  expect(compareTimeZones(request)).toEqual({
    status: 'ambiguous',
    choices: [
      { choice: 'earlier', epochMilliseconds: 1_730_611_800_000, iso: '2024-11-03T05:30:00.000Z', offset: 'UTC-04:00' },
      { choice: 'later', epochMilliseconds: 1_730_615_400_000, iso: '2024-11-03T06:30:00.000Z', offset: 'UTC-05:00' },
    ],
  });

  expect(compareTimeZones({ ...request, ambiguityChoice: 'earlier' })).toMatchObject({
    status: 'ready', epochMilliseconds: 1_730_611_800_000,
    rows: [{ timeZone: 'America/New_York', offset: 'UTC-04:00' }, { timeZone: 'UTC', time: '05:30' }],
  });
  expect(compareTimeZones({ ...request, ambiguityChoice: 'later' })).toMatchObject({
    status: 'ready', epochMilliseconds: 1_730_615_400_000,
    rows: [{ timeZone: 'America/New_York', offset: 'UTC-05:00' }, { timeZone: 'UTC', time: '06:30' }],
  });
});

test('formats fractional offsets, every supported calendar-day delta, and a year crossing', () => {
  const vectors = [
    { input: '2026-08-11T00:30', sourceTimeZone: 'Pacific/Kiritimati', targetTimeZones: ['Pacific/Pago_Pago'], expected: { date: '2026-08-09', dayDelta: -2 } },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['America/New_York'], expected: { date: '2026-08-10', dayDelta: -1 } },
    { input: '2026-08-11T09:00', sourceTimeZone: 'Asia/Shanghai', targetTimeZones: ['Asia/Kathmandu'], expected: { date: '2026-08-11', dayDelta: 0, offset: 'UTC+05:45' } },
    { input: '2026-08-11T23:30', sourceTimeZone: 'America/Los_Angeles', targetTimeZones: ['Asia/Shanghai'], expected: { date: '2026-08-12', dayDelta: 1 } },
    { input: '2026-08-11T23:30', sourceTimeZone: 'Pacific/Pago_Pago', targetTimeZones: ['Pacific/Kiritimati'], expected: { date: '2026-08-13', dayDelta: 2 } },
    { input: '2026-12-31T23:30', sourceTimeZone: 'Pacific/Pago_Pago', targetTimeZones: ['Pacific/Kiritimati'], expected: { date: '2027-01-02', dayDelta: 2 } },
  ] as const;

  for (const { expected, ...request } of vectors) {
    const result = compareTimeZones(request);
    expect(result).toMatchObject({ status: 'ready' });
    if (result.status === 'ready') expect(result.rows[1]).toMatchObject(expected);
  }
});

test('provides exact stable per-row and all-row copy text', () => {
  const result = compareTimeZones({
    input: '2026-08-11T09:00',
    sourceTimeZone: 'Asia/Shanghai',
    targetTimeZones: ['UTC', 'America/New_York'],
  });

  expect(result).toMatchObject({ status: 'ready' });
  if (result.status !== 'ready') return;

  expect(result.rows.map(row => row.copyText)).toEqual([
    '2026-08-11 09:00 Asia/Shanghai (UTC+08:00, 与源日期同日)',
    '2026-08-11 01:00 UTC (UTC+00:00, 与源日期同日)',
    '2026-08-10 21:00 America/New_York (UTC-04:00, -1 天)',
  ]);
  expect(result.copyText).toBe([
    '2026-08-11 09:00 Asia/Shanghai (UTC+08:00, 与源日期同日)',
    '2026-08-11 01:00 UTC (UTC+00:00, 与源日期同日)',
    '2026-08-10 21:00 America/New_York (UTC-04:00, -1 天)',
  ].join('\n'));
});

test('formats the initial source wall time once at minute precision', () => {
  expect(formatInitialWallTime(new Date('2026-08-11T01:23:45.678Z'), 'Asia/Shanghai')).toBe('2026-08-11T09:23');
});
