import { formatInstant, resolveWallTime } from '../../lib/timeZone';

export type AmbiguityChoice = 'earlier' | 'later';

export type ZoneRow = Readonly<{
  role: 'source' | 'target';
  timeZone: string;
  date: string;
  time: string;
  offset: string;
  dayDelta: number;
  copyText: string;
}>;

export type AmbiguityOption = Readonly<{
  choice: AmbiguityChoice;
  epochMilliseconds: number;
  iso: string;
  offset: string;
}>;

export type TimeZoneComparison =
  | Readonly<{ status: 'invalid' | 'gap'; message: string }>
  | Readonly<{ status: 'ambiguous'; choices: readonly [AmbiguityOption, AmbiguityOption] }>
  | Readonly<{ status: 'ready'; epochMilliseconds: number; rows: readonly ZoneRow[]; copyText: string }>;

export type TimeZoneComparisonRequest = Readonly<{
  input: string;
  sourceTimeZone: string;
  targetTimeZones: readonly string[];
  ambiguityChoice?: AmbiguityChoice;
}>;

const MINUTE_WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const INVALID_REQUEST = '请输入有效的 YYYY-MM-DDTHH:mm 和 IANA 时区。';
const INVALID_TARGETS = '请选择 1 至 4 个互不重复的有效 IANA 目标时区。';
const DST_GAP = '该本地时间在所选时区不存在（夏令时跳转）';

function targetsAreValid(targetTimeZones: readonly string[]): boolean {
  if (targetTimeZones.length < 1 || targetTimeZones.length > 4) return false;
  if (new Set(targetTimeZones).size !== targetTimeZones.length) return false;
  return targetTimeZones.every((timeZone) => {
    try {
      formatInstant(0, timeZone);
      return true;
    } catch {
      return false;
    }
  });
}

function calendarDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const completedYears = year - 1;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const completedMonthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1];
  return 365 * completedYears + Math.floor(completedYears / 4) - Math.floor(completedYears / 100) +
    Math.floor(completedYears / 400) + completedMonthDays + (leapYear && month > 2 ? 1 : 0) + day;
}

function formatDayDelta(dayDelta: number): string {
  return dayDelta === 0 ? '与源日期同日' : `${dayDelta > 0 ? '+' : ''}${dayDelta} 天`;
}

function makeRow(
  role: ZoneRow['role'],
  epochMilliseconds: number,
  timeZone: string,
  sourceDate: string,
): ZoneRow {
  const zoned = formatInstant(epochMilliseconds, timeZone);
  const dayDelta = calendarDayNumber(zoned.date) - calendarDayNumber(sourceDate);
  return {
    role,
    timeZone,
    date: zoned.date,
    time: zoned.time,
    offset: zoned.offset,
    dayDelta,
    copyText: `${zoned.date} ${zoned.time} ${timeZone} (${zoned.offset}, ${formatDayDelta(dayDelta)})`,
  };
}

function ambiguityOption(choice: AmbiguityChoice, epochMilliseconds: number, sourceTimeZone: string): AmbiguityOption {
  return {
    choice,
    epochMilliseconds,
    iso: new Date(epochMilliseconds).toISOString(),
    offset: formatInstant(epochMilliseconds, sourceTimeZone).offset,
  };
}

export function compareTimeZones(request: TimeZoneComparisonRequest): TimeZoneComparison {
  if (!MINUTE_WALL_TIME.test(request.input)) return { status: 'invalid', message: INVALID_REQUEST };
  if (!targetsAreValid(request.targetTimeZones)) return { status: 'invalid', message: INVALID_TARGETS };

  const resolution = resolveWallTime(request.input, request.sourceTimeZone);
  if (resolution.kind === 'invalid') return { status: 'invalid', message: resolution.message };
  if (resolution.kind === 'gap') return { status: 'gap', message: DST_GAP };

  let epochMilliseconds: number;
  if (resolution.kind === 'fold') {
    if (request.ambiguityChoice !== 'earlier' && request.ambiguityChoice !== 'later') {
      return {
        status: 'ambiguous',
        choices: [
          ambiguityOption('earlier', resolution.candidates[0], request.sourceTimeZone),
          ambiguityOption('later', resolution.candidates[1], request.sourceTimeZone),
        ],
      };
    }
    epochMilliseconds = resolution.candidates[request.ambiguityChoice === 'earlier' ? 0 : 1];
  } else {
    epochMilliseconds = resolution.candidates[0];
  }

  const sourceDate = formatInstant(epochMilliseconds, request.sourceTimeZone).date;
  const source = makeRow('source', epochMilliseconds, request.sourceTimeZone, sourceDate);
  const rows = [
    source,
    ...request.targetTimeZones.map(timeZone => makeRow('target', epochMilliseconds, timeZone, source.date)),
  ];
  return { status: 'ready', epochMilliseconds, rows, copyText: rows.map(row => row.copyText).join('\n') };
}

export function formatInitialWallTime(now: Date, sourceTimeZone: string): string {
  const zoned = formatInstant(now.getTime(), sourceTimeZone);
  return `${zoned.date}T${zoned.time}`;
}
