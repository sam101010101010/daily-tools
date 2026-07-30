import { expect, test } from 'vitest';
import { CRON_PROFILE_IDS, CRON_PROFILES, getCronProfile, isCronProfileId } from './profiles';

test('publishes the seven supported profile contracts in product order', () => {
  expect(CRON_PROFILE_IDS).toEqual([
    'linux-vixie',
    'macos-bsd',
    'kubernetes',
    'spring',
    'quartz',
    'eventbridge-scheduler',
    'eventbridge-legacy',
  ]);

  expect(CRON_PROFILES).toEqual([
    {
      id: 'linux-vixie',
      label: 'Linux Vixie/Cronie',
      fieldOrder: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
      defaultExpression: '*/15 9-17 * * MON-FRI',
      wrapper: 'none',
      weekdayMap: { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN' },
      domDowPolicy: 'or',
      timeZoneMode: 'target-iana',
    },
    {
      id: 'macos-bsd',
      label: 'macOS/BSD crontab',
      fieldOrder: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
      defaultExpression: '*/15 9-17 * * MON-FRI',
      wrapper: 'none',
      weekdayMap: { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN' },
      domDowPolicy: 'or',
      timeZoneMode: 'target-iana',
    },
    {
      id: 'kubernetes',
      label: 'Kubernetes CronJob',
      fieldOrder: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
      defaultExpression: '0 9 * * MON-FRI',
      wrapper: 'none',
      weekdayMap: { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' },
      domDowPolicy: 'or',
      timeZoneMode: 'kubernetes-spec-time-zone',
    },
    {
      id: 'spring',
      label: 'Spring @Scheduled',
      fieldOrder: ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
      defaultExpression: '0 */15 9-17 * * MON-FRI',
      wrapper: 'none',
      weekdayMap: { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN' },
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
      weekdayMap: { 1: 'SUN', 2: 'MON', 3: 'TUE', 4: 'WED', 5: 'THU', 6: 'FRI', 7: 'SAT' },
      domDowPolicy: 'mutually-exclusive',
      timeZoneMode: 'target-iana',
    },
    {
      id: 'eventbridge-scheduler',
      label: 'EventBridge Scheduler',
      fieldOrder: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year'],
      defaultExpression: 'cron(0 9 ? * MON-FRI *)',
      wrapper: 'cron-required',
      weekdayMap: { 1: 'SUN', 2: 'MON', 3: 'TUE', 4: 'WED', 5: 'THU', 6: 'FRI', 7: 'SAT' },
      domDowPolicy: 'mutually-exclusive',
      timeZoneMode: 'scheduler-iana',
    },
    {
      id: 'eventbridge-legacy',
      label: 'EventBridge legacy rule',
      fieldOrder: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year'],
      defaultExpression: 'cron(0 9 ? * MON-FRI *)',
      wrapper: 'cron-required',
      weekdayMap: { 1: 'SUN', 2: 'MON', 3: 'TUE', 4: 'WED', 5: 'THU', 6: 'FRI', 7: 'SAT' },
      domDowPolicy: 'mutually-exclusive',
      timeZoneMode: 'utc-only',
    },
  ]);
});

test('looks up only ids from the closed profile catalog', () => {
  expect(getCronProfile('spring')).toBe(CRON_PROFILES[3]);
  expect(isCronProfileId('eventbridge-legacy')).toBe(true);
  expect(isCronProfileId('systemd')).toBe(false);
  expect(isCronProfileId('')).toBe(false);
});
