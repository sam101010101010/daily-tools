import { Cron } from 'croner';
import type { FiveFieldCron } from './cronSyntax';

const IANA_TIME_ZONE_NAME = /^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z][A-Za-z0-9._+-]*)+)$/;

export type CronRun = Readonly<{
  iso: string;
  local: string;
}>;

export type CronPreviewResult =
  | Readonly<{ ok: true; value: Readonly<{ timeZone: string; runs: readonly CronRun[] }> }>
  | Readonly<{ ok: false; error: string }>;

function isValidIanaTimeZone(timeZone: string): boolean {
  if (!IANA_TIME_ZONE_NAME.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${timeZone}`;
}

export function previewCron(cron: FiveFieldCron, timeZone: string, now: Date): CronPreviewResult {
  if (!isValidIanaTimeZone(timeZone)) return { ok: false, error: '不是有效的 IANA 时区' };

  const evaluator = new Cron(cron.normalized, {
    timezone: timeZone,
    paused: true,
    domAndDow: false,
    mode: '5-part',
  });
  const dates: Date[] = [];
  let cursor = now;
  while (dates.length < 10) {
    const candidates = evaluator.nextRuns(10 - dates.length, cursor);
    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1];
    dates.push(...candidates.filter(candidate => evaluator.match(candidate)));
  }
  const runs = dates.map((date) => ({ iso: date.toISOString(), local: formatInTimeZone(date, timeZone) }));
  return { ok: true, value: { timeZone, runs } };
}
