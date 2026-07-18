export type TimestampInputType = 'auto' | 'seconds' | 'milliseconds' | 'iso';

export type TimestampValue = Readonly<{
  epochMilliseconds: number;
  epochSeconds: string;
  iso: string;
}>;

export type ConvertTimestampResult =
  | Readonly<{ ok: true; value: TimestampValue }>
  | Readonly<{ ok: false; error: string }>;

type DateTimeParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

type LocalIsoParseResult =
  | Readonly<{ ok: true; epochMilliseconds: number }>
  | Readonly<{ ok: false; reason: 'invalid' | 'ambiguous' }>;

function getDateTimeParts(epochMilliseconds: number, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMilliseconds));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

export function formatInTimeZone(epochMilliseconds: number, timeZone: string): string {
  const parts = getDateTimeParts(epochMilliseconds, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

function sameDateTimeParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day &&
    left.hour === right.hour && left.minute === right.minute && left.second === right.second;
}

function timeZoneOffsetAt(epochMilliseconds: number, timeZone: string): number {
  const parts = getDateTimeParts(epochMilliseconds, timeZone);
  const renderedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return renderedAsUtc - Math.trunc(epochMilliseconds / 1_000) * 1_000;
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

function parseLocalIso(input: string, timeZone: string): LocalIsoParseResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(input);
  if (!match) return { ok: false, reason: 'invalid' };

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const target = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText), minute: Number(minuteText), second: Number(secondText),
    millisecond: Number(millisecondText.padEnd(3, '0')),
  };
  let epochMilliseconds = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second, target.millisecond);
  const normalized = new Date(epochMilliseconds);
  if (
    normalized.getUTCFullYear() !== target.year || normalized.getUTCMonth() + 1 !== target.month ||
    normalized.getUTCDate() !== target.day || normalized.getUTCHours() !== target.hour ||
    normalized.getUTCMinutes() !== target.minute || normalized.getUTCSeconds() !== target.second
  ) return { ok: false, reason: 'invalid' };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getDateTimeParts(epochMilliseconds, timeZone);
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    epochMilliseconds += targetAsUtc - actualAsUtc;
  }

  const resolved = getDateTimeParts(epochMilliseconds, timeZone);
  if (!sameDateTimeParts(resolved, target)) return { ok: false, reason: 'invalid' };

  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second, target.millisecond);
  const offsets = new Set([
    timeZoneOffsetAt(epochMilliseconds - 12 * 60 * 60 * 1_000, timeZone),
    timeZoneOffsetAt(epochMilliseconds, timeZone),
    timeZoneOffsetAt(epochMilliseconds + 12 * 60 * 60 * 1_000, timeZone),
  ]);
  const candidates = [...offsets].filter((offset) => sameDateTimeParts(getDateTimeParts(targetAsUtc - offset, timeZone), target));
  if (candidates.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, epochMilliseconds };
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
      const localResult = parseLocalIso(trimmedInput, _timeZone);
      if (!localResult.ok) {
        return {
          ok: false,
          error: localResult.reason === 'ambiguous'
            ? '所选时区中该本地时间存在歧义，请使用带时区的 ISO 8601'
            : '不是有效的 ISO 8601 时间',
        };
      }
      epochMilliseconds = localResult.epochMilliseconds;
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
