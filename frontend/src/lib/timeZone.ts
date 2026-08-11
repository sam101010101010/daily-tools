export type WallTimeResolution =
  | Readonly<{ kind: 'invalid'; message: string }>
  | Readonly<{ kind: 'gap' }>
  | Readonly<{ kind: 'unique'; candidates: readonly [number] }>
  | Readonly<{ kind: 'fold'; candidates: readonly [number, number] }>;

export type ZonedDateTime = Readonly<{
  date: string;
  time: string;
  dateTime: string;
  dateTimeSeconds: string;
  offset: string;
}>;

type DateTimeParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

type WallTimeParts = Readonly<DateTimeParts & { millisecond: number }>;

const INVALID_WALL_TIME = '不是有效的本地时间或 IANA 时区';
const WALL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const OFFSET_SAMPLE_HOURS = [-36, -24, -12, 0, 12, 24, 36] as const;
const COMMON_TIME_ZONES = [
  'UTC',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'Pacific/Auckland',
] as const;

function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function utcEpochMilliseconds(parts: WallTimeParts | DateTimeParts): number {
  const instant = new Date(0);
  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  instant.setUTCHours(parts.hour, parts.minute, parts.second, 'millisecond' in parts ? parts.millisecond : 0);
  return instant.getTime();
}

function parseWallTime(input: string): WallTimeParts | undefined {
  const match = WALL_TIME_PATTERN.exec(input);
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const parts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
    millisecond: Number(millisecondText.padEnd(3, '0')),
  };
  if (parts.year === 0) return undefined;
  const normalized = new Date(utcEpochMilliseconds(parts));
  if (
    Number.isNaN(normalized.getTime()) ||
    normalized.getUTCFullYear() !== parts.year || normalized.getUTCMonth() + 1 !== parts.month ||
    normalized.getUTCDate() !== parts.day || normalized.getUTCHours() !== parts.hour ||
    normalized.getUTCMinutes() !== parts.minute || normalized.getUTCSeconds() !== parts.second ||
    normalized.getUTCMilliseconds() !== parts.millisecond
  ) return undefined;
  return parts;
}

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

function sameDateTimeParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day &&
    left.hour === right.hour && left.minute === right.minute && left.second === right.second;
}

function timeZoneOffsetAt(epochMilliseconds: number, timeZone: string): number {
  const parts = getDateTimeParts(epochMilliseconds, timeZone);
  const renderedAsUtc = utcEpochMilliseconds(parts);
  return renderedAsUtc - Math.floor(epochMilliseconds / 1_000) * 1_000;
}

function padded(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatOffset(offsetMilliseconds: number): string {
  const totalMinutes = Math.round(Math.abs(offsetMilliseconds) / 60_000);
  const sign = offsetMilliseconds < 0 ? '-' : '+';
  return `UTC${sign}${padded(Math.floor(totalMinutes / 60))}:${padded(totalMinutes % 60)}`;
}

function isValidInstant(epochMilliseconds: number): boolean {
  return Number.isFinite(epochMilliseconds) && !Number.isNaN(new Date(epochMilliseconds).getTime());
}

export function resolveWallTime(input: string, timeZone: string): WallTimeResolution {
  const target = parseWallTime(input);
  if (!target || !isValidTimeZone(timeZone)) {
    return { kind: 'invalid', message: INVALID_WALL_TIME };
  }

  const naiveUtc = utcEpochMilliseconds(target);
  if (!isValidInstant(naiveUtc)) return { kind: 'invalid', message: INVALID_WALL_TIME };

  const offsets = new Set<number>();
  for (const hours of OFFSET_SAMPLE_HOURS) {
    const sample = naiveUtc + hours * 60 * 60 * 1_000;
    if (isValidInstant(sample)) offsets.add(timeZoneOffsetAt(sample, timeZone));
  }
  const candidates = [...offsets]
    .map(offset => naiveUtc - offset)
    .filter(isValidInstant)
    .filter(candidate => sameDateTimeParts(getDateTimeParts(candidate, timeZone), target))
    .filter((candidate, index, values) => values.indexOf(candidate) === index)
    .sort((left, right) => left - right);

  if (candidates.length === 0) return { kind: 'gap' };
  if (candidates.length === 1) return { kind: 'unique', candidates: [candidates[0]] };
  if (candidates.length === 2) return { kind: 'fold', candidates: [candidates[0], candidates[1]] };
  return { kind: 'invalid', message: INVALID_WALL_TIME };
}

export function formatInstant(epochMilliseconds: number, timeZone: string): ZonedDateTime {
  if (!isValidInstant(epochMilliseconds) || !isValidTimeZone(timeZone)) {
    throw new RangeError('Cannot format an invalid instant or IANA time zone');
  }
  const parts = getDateTimeParts(epochMilliseconds, timeZone);
  const date = `${padded(parts.year, 4)}-${padded(parts.month)}-${padded(parts.day)}`;
  const time = `${padded(parts.hour)}:${padded(parts.minute)}`;
  const dateTime = `${date} ${time}`;
  return {
    date,
    time,
    dateTime,
    dateTimeSeconds: `${dateTime}:${padded(parts.second)}`,
    offset: formatOffset(timeZoneOffsetAt(epochMilliseconds, timeZone)),
  };
}

export function listSupportedTimeZones(browserZone: string): string[] {
  const supported = new Set<string>(['UTC', browserZone, ...COMMON_TIME_ZONES]);
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      for (const timeZone of Intl.supportedValuesOf('timeZone')) supported.add(timeZone);
    } catch {
      // The checked common-zone fallback remains available when Intl declines this key.
    }
  }
  return [...supported].filter(isValidTimeZone).sort((left, right) => left.localeCompare(right));
}
