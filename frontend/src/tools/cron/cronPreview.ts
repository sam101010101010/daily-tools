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

  const runs = new Cron(cron.normalized, { timezone: timeZone, paused: true, domAndDow: false })
    .nextRuns(10, now)
    .map((date) => ({ iso: date.toISOString(), local: formatInTimeZone(date, timeZone) }));
  return { ok: true, value: { timeZone, runs } };
}
