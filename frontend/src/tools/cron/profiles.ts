export const CRON_PROFILE_IDS = [
  'linux-vixie',
  'macos-bsd',
  'kubernetes',
  'spring',
  'quartz',
  'eventbridge-scheduler',
  'eventbridge-legacy',
] as const;

export type CronProfileId = (typeof CRON_PROFILE_IDS)[number];

export type CronProfileFieldName =
  | 'second'
  | 'minute'
  | 'hour'
  | 'dayOfMonth'
  | 'month'
  | 'dayOfWeek'
  | 'year';

export type CronWeekdayName = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type CronWrapper = 'none' | 'cron-required';
export type CronDomDowPolicy = 'or' | 'spring' | 'mutually-exclusive';
export type CronTimeZoneMode =
  | 'target-iana'
  | 'kubernetes-spec-time-zone'
  | 'scheduler-iana'
  | 'utc-only';

export type CronProfile = Readonly<{
  id: CronProfileId;
  label: string;
  fieldOrder: readonly CronProfileFieldName[];
  optionalField?: CronProfileFieldName;
  defaultExpression: string;
  wrapper: CronWrapper;
  weekdayMap: Readonly<Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, CronWeekdayName>>>;
  domDowPolicy: CronDomDowPolicy;
  timeZoneMode: CronTimeZoneMode;
}>;

const VIXIE_WEEKDAYS = {
  0: 'SUN',
  1: 'MON',
  2: 'TUE',
  3: 'WED',
  4: 'THU',
  5: 'FRI',
  6: 'SAT',
  7: 'SUN',
} as const;

const KUBERNETES_WEEKDAYS = {
  0: 'SUN',
  1: 'MON',
  2: 'TUE',
  3: 'WED',
  4: 'THU',
  5: 'FRI',
  6: 'SAT',
} as const;

const SUNDAY_FIRST_WEEKDAYS = {
  1: 'SUN',
  2: 'MON',
  3: 'TUE',
  4: 'WED',
  5: 'THU',
  6: 'FRI',
  7: 'SAT',
} as const;

const FIVE_FIELD_ORDER = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const;
const EVENTBRIDGE_FIELD_ORDER = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year'] as const;

export const CRON_PROFILES = [
  {
    id: 'linux-vixie',
    label: 'Linux Vixie/Cronie',
    fieldOrder: FIVE_FIELD_ORDER,
    defaultExpression: '*/15 9-17 * * MON-FRI',
    wrapper: 'none',
    weekdayMap: VIXIE_WEEKDAYS,
    domDowPolicy: 'or',
    timeZoneMode: 'target-iana',
  },
  {
    id: 'macos-bsd',
    label: 'macOS/BSD crontab',
    fieldOrder: FIVE_FIELD_ORDER,
    defaultExpression: '*/15 9-17 * * MON-FRI',
    wrapper: 'none',
    weekdayMap: VIXIE_WEEKDAYS,
    domDowPolicy: 'or',
    timeZoneMode: 'target-iana',
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes CronJob',
    fieldOrder: FIVE_FIELD_ORDER,
    defaultExpression: '0 9 * * MON-FRI',
    wrapper: 'none',
    weekdayMap: KUBERNETES_WEEKDAYS,
    domDowPolicy: 'or',
    timeZoneMode: 'kubernetes-spec-time-zone',
  },
  {
    id: 'spring',
    label: 'Spring @Scheduled',
    fieldOrder: ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
    defaultExpression: '0 */15 9-17 * * MON-FRI',
    wrapper: 'none',
    weekdayMap: VIXIE_WEEKDAYS,
    domDowPolicy: 'spring',
    timeZoneMode: 'target-iana',
  },
  {
    id: 'quartz',
    label: 'Quartz',
    fieldOrder: ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year'],
    optionalField: 'year',
    defaultExpression: '0 0 9 ? * MON-FRI',
    wrapper: 'none',
    weekdayMap: SUNDAY_FIRST_WEEKDAYS,
    domDowPolicy: 'mutually-exclusive',
    timeZoneMode: 'target-iana',
  },
  {
    id: 'eventbridge-scheduler',
    label: 'EventBridge Scheduler',
    fieldOrder: EVENTBRIDGE_FIELD_ORDER,
    defaultExpression: 'cron(0 9 ? * MON-FRI *)',
    wrapper: 'cron-required',
    weekdayMap: SUNDAY_FIRST_WEEKDAYS,
    domDowPolicy: 'mutually-exclusive',
    timeZoneMode: 'scheduler-iana',
  },
  {
    id: 'eventbridge-legacy',
    label: 'EventBridge legacy rule',
    fieldOrder: EVENTBRIDGE_FIELD_ORDER,
    defaultExpression: 'cron(0 9 ? * MON-FRI *)',
    wrapper: 'cron-required',
    weekdayMap: SUNDAY_FIRST_WEEKDAYS,
    domDowPolicy: 'mutually-exclusive',
    timeZoneMode: 'utc-only',
  },
] as const satisfies readonly CronProfile[];

export function isCronProfileId(value: string): value is CronProfileId {
  return (CRON_PROFILE_IDS as readonly string[]).includes(value);
}

export function getCronProfile(profile: CronProfileId): (typeof CRON_PROFILES)[number] {
  const result = CRON_PROFILES.find((candidate) => candidate.id === profile);
  if (!result) throw new Error(`Unknown Cron profile: ${profile}`);
  return result;
}
