import { expect, test } from 'vitest';
import { explainCron } from './cronExplain';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';

function parse(profile: 'spring' | 'quartz' | 'eventbridge-scheduler' | 'eventbridge-legacy', expression: string) {
  const result = parseCron(profile, expression);
  expect(result).toMatchObject({ ok: true, value: { profile } });
  if (!result.ok) throw new Error(`Expected ${profile} to accept ${expression}`);
  return result.value;
}

test('Spring accepts six fields, its macros, question marks and Sunday 0 or 7', () => {
  expect(parse('spring', '0 0 9 ? * MON-FRI').normalized).toBe('0 0 9 ? * MON-FRI');
  expect(parse('spring', '@hourly').normalized).toBe('0 0 * * * *');
  expect(parse('spring', '0 0 0 L * 0').normalized).toBe('0 0 0 L * 0');
  expect(parse('spring', '0 0 0 15W * ?').normalized).toBe('0 0 0 15W * ?');
  expect(parse('spring', '0 0 0 ? * 7').normalized).toBe('0 0 0 ? * 7');
  expect(parse('spring', '0 0 0 ? * MON#2').normalized).toBe('0 0 0 ? * MON#2');
});

test('Spring rejects a five-field expression and Quartz weekday numbering', () => {
  expect(parseCron('spring', '0 9 * * *')).toMatchObject({
    ok: false, error: { profile: 'spring', field: 'expression', code: 'field-count' },
  });
  expect(parseCron('spring', '0 0 0 ? * 8')).toMatchObject({
    ok: false, error: { profile: 'spring', field: 'dayOfWeek', code: 'invalid-value' },
  });
});

test('Quartz accepts six or seven fields with Sunday-first weekdays and special DOM/DOW syntax', () => {
  expect(parse('quartz', '0 0 9 ? * 2-6').normalized).toBe('0 0 9 ? * 2-6');
  expect(parse('quartz', '0 0 9 ? * MON-FRI 2025').normalized).toBe('0 0 9 ? * MON-FRI 2025');
  expect(parse('quartz', '0 0 9 LW * ?').normalized).toBe('0 0 9 LW * ?');
  expect(parse('quartz', '0 0 9 ? * 6L').normalized).toBe('0 0 9 ? * 6L');
  expect(parse('quartz', '0 0 9 ? * 2#2').normalized).toBe('0 0 9 ? * 2#2');
  expect(parseCron('quartz', '0 0 9 1 * 2')).toMatchObject({
    ok: false, error: { profile: 'quartz', field: 'expression', code: 'semantic' },
  });
  expect(parseCron('quartz', '0 0 9 ? * 0')).toMatchObject({
    ok: false, error: { profile: 'quartz', field: 'dayOfWeek', code: 'invalid-value' },
  });
});

test.each(['eventbridge-scheduler', 'eventbridge-legacy'] as const)(
  '%s requires cron(...) with minute-first six fields and the EventBridge year range',
  (profile) => {
    expect(parse(profile, 'cron(0 9 ? * MON-FRI 2024-2026)').normalized).toBe('0 9 ? * MON-FRI 2024-2026');
    expect(parse(profile, 'cron(0 9 L * ? 2024)').normalized).toBe('0 9 L * ? 2024');
    expect(parse(profile, 'cron(0 9 15W * ? 2024)').normalized).toBe('0 9 15W * ? 2024');
    expect(parse(profile, 'cron(0 9 ? * 2#2 2024)').normalized).toBe('0 9 ? * 2#2 2024');
    expect(parseCron(profile, '0 9 ? * MON-FRI 2024')).toMatchObject({
      ok: false, error: { profile, field: 'expression', code: 'unsupported' },
    });
    expect(parseCron(profile, 'cron(0 9 ? * MON-FRI 2200)')).toMatchObject({
      ok: false, error: { profile, field: 'year', code: 'invalid-value' },
    });
    expect(parseCron(profile, 'cron(0 9 1 * 2 2024)')).toMatchObject({
      ok: false, error: { profile, field: 'expression', code: 'semantic' },
    });
  },
);

test('profile adapters keep Spring, Quartz and EventBridge semantics separate in fixed-clock previews', () => {
  const now = new Date('2023-12-31T23:59:00.000Z');
  const spring = previewCron(parse('spring', '0 0 0 ? * 0'), 'UTC', now);
  const quartz = previewCron(parse('quartz', '0 0 0 ? * 2'), 'UTC', now);
  const scheduler = previewCron(parse('eventbridge-scheduler', 'cron(0 9 ? * 2 2024)'), 'Asia/Shanghai', now);
  const legacy = previewCron(parse('eventbridge-legacy', 'cron(0 9 ? * 2 2024)'), 'Asia/Shanghai', now);

  expect(spring).toMatchObject({ ok: true, profile: 'spring' });
  expect(quartz).toMatchObject({ ok: true, profile: 'quartz' });
  expect(scheduler).toMatchObject({ ok: true, profile: 'eventbridge-scheduler', value: { timeZone: 'Asia/Shanghai' } });
  expect(legacy).toMatchObject({ ok: true, profile: 'eventbridge-legacy', value: { timeZone: 'UTC' } });
  if (!spring.ok || !quartz.ok || !scheduler.ok || !legacy.ok) throw new Error('Expected profile previews to work');
  expect(spring.value.runs[0]?.iso).toBe('2024-01-07T00:00:00.000Z');
  expect(quartz.value.runs[0]?.iso).toBe('2024-01-01T00:00:00.000Z');
  expect(scheduler.value.runs[0]?.local).toBe('2024-01-01 09:00:00 Asia/Shanghai');
  expect(legacy.value.runs[0]?.local).toBe('2024-01-01 09:00:00 UTC');
  expect(explainCron(parse('quartz', '0 0 9 ? * 2')).profile).toBe('quartz');
});

test('advanced profiles skip DST gaps and deduplicate overlap instants', () => {
  const spring = previewCron(parse('spring', '0 30 2 * * ?'), 'America/New_York', new Date('2024-03-09T00:00:00.000Z'));
  expect(spring).toMatchObject({ ok: true, profile: 'spring' });
  if (!spring.ok) throw new Error('Expected Spring preview');
  expect(spring.value.runs.slice(0, 3).map((run) => run.local)).toEqual([
    '2024-03-09 02:30:00 America/New_York',
    '2024-03-11 02:30:00 America/New_York',
    '2024-03-12 02:30:00 America/New_York',
  ]);
  expect(new Set(spring.value.runs.map((run) => run.iso)).size).toBe(spring.value.runs.length);
});
