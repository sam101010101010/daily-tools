import { expect, test } from 'vitest';
import { formatInstant, listSupportedTimeZones, resolveWallTime } from './timeZone';

test('resolves a valid Shanghai wall time to its only instant', () => {
  expect(resolveWallTime('2024-01-15T09:30', 'Asia/Shanghai')).toMatchObject({
    kind: 'unique', candidates: [1_705_282_200_000],
  });
});

test('rejects a normalized-but-invalid calendar date instead of changing the day', () => {
  expect(resolveWallTime('2024-02-30T09:00', 'Asia/Shanghai')).toEqual({
    kind: 'invalid', message: '不是有效的本地时间或 IANA 时区',
  });
});

test('rejects blank and unknown time zones without returning formatter exception text', () => {
  for (const timeZone of ['', 'Mars/Olympus_Mons']) {
    const result = resolveWallTime('2024-01-15T09:30', timeZone);
    expect(result).toEqual({ kind: 'invalid', message: '不是有效的本地时间或 IANA 时区' });
    if (result.kind === 'invalid') expect(result.message).not.toMatch(/RangeError|Invalid time zone/i);
  }
});

test('reports a spring-forward wall time with no corresponding instant', () => {
  expect(resolveWallTime('2024-03-10T02:30', 'America/New_York')).toEqual({ kind: 'gap' });
});

test('returns both fall-back instants in ascending order', () => {
  expect(resolveWallTime('2024-11-03T01:30', 'America/New_York')).toMatchObject({
    kind: 'fold', candidates: [1_730_611_800_000, 1_730_615_400_000],
  });
});

test('keeps optional seconds and milliseconds when resolving timestamp-compatible input', () => {
  expect(resolveWallTime('2024-01-15T09:30:45.123', 'Asia/Shanghai')).toMatchObject({
    kind: 'unique', candidates: [1_705_282_245_123],
  });
});

test('resolves four-digit UTC wall times before year 0100 without Date.UTC coercion', () => {
  expect(resolveWallTime('0001-01-01T00:00', 'UTC')).toEqual({
    kind: 'unique', candidates: [-62_135_596_800_000],
  });
  expect(resolveWallTime('0099-01-01T00:00', 'UTC')).toEqual({
    kind: 'unique', candidates: [-59_042_995_200_000],
  });
});

test('formats UTC instants before year 0100 with zero-padded dates and the zero offset', () => {
  expect(formatInstant(-62_135_596_800_000, 'UTC')).toMatchObject({
    date: '0001-01-01', dateTime: '0001-01-01 00:00', offset: 'UTC+00:00',
  });
  expect(formatInstant(-59_042_995_200_000, 'UTC')).toMatchObject({
    date: '0099-01-01', dateTime: '0099-01-01 00:00', offset: 'UTC+00:00',
  });
});

test('rejects year 0000 rather than assigning astronomical or BCE semantics', () => {
  expect(resolveWallTime('0000-01-01T00:00', 'UTC')).toEqual({
    kind: 'invalid', message: '不是有效的本地时间或 IANA 时区',
  });
});

test('formats a fractional-offset IANA zone with stable date, time, and offset fields', () => {
  expect(formatInstant(0, 'Asia/Kathmandu')).toMatchObject({
    date: '1970-01-01', time: '05:30', offset: 'UTC+05:30',
  });
});

test('lists only Intl-valid zones while retaining UTC and the browser zone', () => {
  const zones = listSupportedTimeZones('Asia/Kathmandu');
  expect(zones).toContain('UTC');
  expect(zones).toContain('Asia/Kathmandu');
  for (const timeZone of zones) {
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone }).format(0)).not.toThrow();
  }
});
