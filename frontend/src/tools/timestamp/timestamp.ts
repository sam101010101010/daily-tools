import { formatInstant, resolveWallTime } from '../../lib/timeZone';

export type TimestampInputType = 'auto' | 'seconds' | 'milliseconds' | 'iso';

export type TimestampValue = Readonly<{
  epochMilliseconds: number;
  epochSeconds: string;
  iso: string;
}>;

export type ConvertTimestampResult =
  | Readonly<{ ok: true; value: TimestampValue }>
  | Readonly<{ ok: false; error: string }>;

export function formatInTimeZone(epochMilliseconds: number, timeZone: string): string {
  return formatInstant(epochMilliseconds, timeZone).dateTimeSeconds;
}

function hasValidIsoCalendarDate(input: string): boolean {
  const localPart = input.replace(/(?:Z|[+-]\d{2}:\d{2})$/i, '');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(localPart);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, '0'));
  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return normalized.getUTCFullYear() === year && normalized.getUTCMonth() + 1 === month &&
    normalized.getUTCDate() === day && normalized.getUTCHours() === hour &&
    normalized.getUTCMinutes() === minute && normalized.getUTCSeconds() === second &&
    normalized.getUTCMilliseconds() === millisecond;
}

export function convertTimestamp(
  input: string,
  inputType: TimestampInputType,
  _timeZone: string,
): ConvertTimestampResult {
  const trimmedInput = input.trim();
  const resolvedInputType = inputType === 'auto'
    ? /^[+-]?\d{10}$/.test(trimmedInput)
      ? 'seconds'
      : /^[+-]?\d{13}$/.test(trimmedInput)
        ? 'milliseconds'
        : /^\d{4}-\d{2}-\d{2}T/.test(trimmedInput)
          ? 'iso'
          : 'auto'
    : inputType;
  let epochMilliseconds: number;
  if (resolvedInputType === 'iso') {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmedInput)) {
      epochMilliseconds = hasValidIsoCalendarDate(trimmedInput) ? Date.parse(trimmedInput) : Number.NaN;
    } else {
      const localResult = resolveWallTime(trimmedInput, _timeZone);
      if (localResult.kind === 'fold') {
        return { ok: false, error: '所选时区中该本地时间存在歧义，请使用带时区的 ISO 8601' };
      }
      if (localResult.kind !== 'unique') return { ok: false, error: '不是有效的 ISO 8601 时间' };
      epochMilliseconds = localResult.candidates[0];
    }
  } else if (resolvedInputType === 'seconds' || resolvedInputType === 'milliseconds') {
    if (!/^[+-]?\d+$/.test(trimmedInput)) {
      return { ok: false, error: `不是有效的 Unix ${resolvedInputType === 'seconds' ? '秒' : '毫秒'}时间戳` };
    }
    const value = Number(trimmedInput);
    epochMilliseconds = resolvedInputType === 'seconds' ? value * 1_000 : value;
  } else {
    return { ok: false, error: resolvedInputType === 'auto' ? '无法自动识别时间格式，请选择秒或毫秒' : '暂不支持该输入格式' };
  }

  const date = new Date(epochMilliseconds);
  if (!Number.isFinite(epochMilliseconds) || Number.isNaN(date.getTime())) {
    return { ok: false, error: resolvedInputType === 'iso' ? '不是有效的 ISO 8601 时间' : `不是有效的 Unix ${resolvedInputType === 'seconds' ? '秒' : '毫秒'}时间戳` };
  }

  return {
    ok: true,
    value: {
      epochMilliseconds,
      epochSeconds: String(epochMilliseconds / 1_000),
      iso: date.toISOString(),
    },
  };
}
