import { Cron } from 'croner';
import { cronerOptionsFor, cronerPatternFor, hasBareLastDayOfWeek, hasLastDayOffset, type ParsedCron } from './profileSyntax';
import type { CronProfileId } from './profiles';

const IANA_TIME_ZONE_NAME = /^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z][A-Za-z0-9._+-]*)+)$/;

export type CronRun = Readonly<{
  iso: string;
  local: string;
}>;

export type CronPreviewResult =
  | Readonly<{ ok: true; profile: CronProfileId; value: Readonly<{ timeZone: string; runs: readonly CronRun[] }> }>
  | Readonly<{ ok: false; profile: CronProfileId; error: string }>;

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

export function previewCron(cron: ParsedCron, timeZone: string, now: Date): CronPreviewResult {
  if (hasLastDayOffset(cron)) {
    return { ok: false, profile: cron.profile, error: '该 Cron 方言的 L-n 日期偏移暂不能精确预览' };
  }
  if (hasBareLastDayOfWeek(cron)) {
    return { ok: false, profile: cron.profile, error: '该 Cron 方言的星期 L 值暂不能精确预览' };
  }
  const effectiveTimeZone = cron.profile === 'eventbridge-legacy' ? 'UTC' : timeZone;
  if (!isValidIanaTimeZone(effectiveTimeZone)) {
    return { ok: false, profile: cron.profile, error: '不是有效的 IANA 时区' };
  }

  const evaluator = new Cron(cronerPatternFor(cron), {
    timezone: effectiveTimeZone,
    paused: true,
    ...cronerOptionsFor(cron),
  });
  const dates: Date[] = [];
  const seenInstants = new Set<number>();
  let cursor = now;
  while (dates.length < 10) {
    const candidates = evaluator.nextRuns(10 - dates.length, cursor);
    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      const instant = candidate.getTime();
      if (!seenInstants.has(instant) && evaluator.match(candidate)) {
        seenInstants.add(instant);
        dates.push(candidate);
      }
    }
  }
  const runs = dates.map((date) => ({ iso: date.toISOString(), local: formatInTimeZone(date, effectiveTimeZone) }));
  return { ok: true, profile: cron.profile, value: { timeZone: effectiveTimeZone, runs } };
}
