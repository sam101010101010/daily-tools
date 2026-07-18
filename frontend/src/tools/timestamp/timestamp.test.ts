import { expect, test } from 'vitest';
import { convertTimestamp, formatInTimeZone } from './timestamp';

test('converts an explicit Unix-seconds input into one instant', () => {
  expect(convertTimestamp('1704067200', 'seconds', 'UTC')).toEqual({
    ok: true,
    value: {
      epochMilliseconds: 1_704_067_200_000,
      epochSeconds: '1704067200',
      iso: '2024-01-01T00:00:00.000Z',
    },
  });
});

test('converts an explicit Unix-milliseconds input into the same instant', () => {
  expect(convertTimestamp('1704067200000', 'milliseconds', 'UTC')).toEqual({
    ok: true,
    value: {
      epochMilliseconds: 1_704_067_200_000,
      epochSeconds: '1704067200',
      iso: '2024-01-01T00:00:00.000Z',
    },
  });
});

test('converts an ISO-8601 input with an explicit UTC offset', () => {
  expect(convertTimestamp('2024-01-01T08:00:00+08:00', 'iso', 'UTC')).toEqual({
    ok: true,
    value: {
      epochMilliseconds: 1_704_067_200_000,
      epochSeconds: '1704067200',
      iso: '2024-01-01T00:00:00.000Z',
    },
  });
});

test('auto-detects a 10-digit numeric value as Unix seconds', () => {
  expect(convertTimestamp('1704067200', 'auto', 'UTC')).toMatchObject({
    ok: true,
    value: { epochMilliseconds: 1_704_067_200_000 },
  });
});

test('auto-detects a 13-digit numeric value as Unix milliseconds', () => {
  expect(convertTimestamp('1704067200000', 'auto', 'UTC')).toMatchObject({
    ok: true,
    value: { epochMilliseconds: 1_704_067_200_000 },
  });
});

test('auto-detects an ISO-8601 value with an explicit UTC offset', () => {
  expect(convertTimestamp('2024-01-01T08:00:00+08:00', 'auto', 'UTC')).toMatchObject({
    ok: true,
    value: { epochMilliseconds: 1_704_067_200_000 },
  });
});

test('formats an instant in the selected IANA time zone', () => {
  expect(formatInTimeZone(0, 'Asia/Shanghai')).toBe('1970-01-01 08:00:00');
});

test('interprets an ISO value without an offset in the selected time zone', () => {
  expect(convertTimestamp('2024-01-01T08:00:00', 'iso', 'America/New_York')).toMatchObject({
    ok: true,
    value: { epochMilliseconds: 1_704_114_000_000 },
  });
});

test('rejects an ambiguous numeric value in automatic mode', () => {
  expect(convertTimestamp('17040672000', 'auto', 'UTC')).toEqual({
    ok: false,
    error: '无法自动识别时间格式，请选择秒或毫秒',
  });
});

test('rejects an offset-free ISO value that occurs twice during a DST fall-back', () => {
  expect(convertTimestamp('2024-11-03T01:30:00', 'iso', 'America/New_York')).toEqual({
    ok: false,
    error: '所选时区中该本地时间存在歧义，请使用带时区的 ISO 8601',
  });
});

test('rejects an ISO value with an invalid calendar date instead of normalizing it', () => {
  expect(convertTimestamp('2024-02-30T00:00:00Z', 'iso', 'UTC')).toEqual({
    ok: false,
    error: '不是有效的 ISO 8601 时间',
  });
});

test('rejects an empty explicit Unix-milliseconds input', () => {
  expect(convertTimestamp('   ', 'milliseconds', 'UTC')).toEqual({
    ok: false,
    error: '不是有效的 Unix 毫秒时间戳',
  });
});

test('auto-detects a signed 10-digit numeric value as Unix seconds', () => {
  expect(convertTimestamp('-1000000000', 'auto', 'UTC')).toMatchObject({
    ok: true,
    value: { epochMilliseconds: -1_000_000_000_000 },
  });
});

test('rejects a fractional Unix-milliseconds input instead of truncating it', () => {
  expect(convertTimestamp('1.5', 'milliseconds', 'UTC')).toEqual({
    ok: false,
    error: '不是有效的 Unix 毫秒时间戳',
  });
});

test('rejects a Unix-milliseconds input beyond the Date range', () => {
  expect(convertTimestamp('8640000000000001', 'milliseconds', 'UTC')).toEqual({
    ok: false,
    error: '不是有效的 Unix 毫秒时间戳',
  });
});
