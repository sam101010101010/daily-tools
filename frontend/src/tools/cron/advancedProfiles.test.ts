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

test.each([
  ['spring', '0 0 0 L-3 * ?', '0 0 0 L-3 * ?'],
  ['quartz', '0 0 0 L-3 * ?', '0 0 0 L-3 * ?'],
] as const)('%s accepts a documented L-n DOM offset but does not approximate its preview', (profile, expression, normalized) => {
  const parsed = parse(profile, expression);
  expect(parsed.normalized).toBe(normalized);
  expect(previewCron(parsed, 'UTC', new Date('2024-02-01T00:00:00.000Z'))).toEqual({
    ok: false,
    profile,
    error: '该 Cron 方言的 L-n 日期偏移暂不能精确预览',
  });
});

test.each([
  ['spring', '0 0 0 L-0 * ?', 'dayOfMonth'],
  ['spring', '0 0 0 L-32 * ?', 'dayOfMonth'],
  ['quartz', '0 0 0 L-X * ?', 'dayOfMonth'],
] as const)('%s rejects invalid L-n DOM offsets', (profile, expression, field) => {
  expect(parseCron(profile, expression)).toMatchObject({
    ok: false,
    error: { profile, field, code: 'invalid-value' },
  });
});

test('EventBridge rejects L-n DOM offsets before previewing', () => {
  expect(parseCron('eventbridge-scheduler', 'cron(0 9 L-3 * ? 2024)')).toMatchObject({
    ok: false, error: { profile: 'eventbridge-scheduler', field: 'dayOfMonth', code: 'invalid-value' },
  });
  expect(parseCron('eventbridge-legacy', 'cron(0 9 L-3 * ? 2024)')).toMatchObject({
    ok: false, error: { profile: 'eventbridge-legacy', field: 'dayOfMonth', code: 'invalid-value' },
  });
});

test.each([
  ['spring', '0 0 9 ? * L'],
  ['quartz', '0 0 9 ? * L'],
  ['eventbridge-scheduler', 'cron(0 9 ? * L 2024)'],
  ['eventbridge-legacy', 'cron(0 9 ? * L 2024)'],
] as const)('%s accepts bare DOW L but declines an inexact preview', (profile, expression) => {
  const parsed = parse(profile, expression);
  expect(previewCron(parsed, 'UTC', new Date('2024-01-01T00:00:00.000Z'))).toEqual({
    ok: false, profile, error: '该 Cron 方言的星期 L 值暂不能精确预览',
  });
});

test.each(['eventbridge-scheduler', 'eventbridge-legacy'] as const)(
  '%s allows one # entry but rejects multiple # entries in DOW',
  (profile) => {
    expect(parseCron(profile, 'cron(0 9 ? * 3#1 2024)')).toMatchObject({ ok: true, value: { profile } });
    expect(parseCron(profile, 'cron(0 9 ? * 3#1,6#3 2024)')).toMatchObject({
      ok: false, error: { profile, field: 'dayOfWeek', code: 'semantic' },
    });
  },
);

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

test('advanced explanations use each profile weekday map and describe question-mark policy in Chinese', () => {
  const spring = explainCron(parse('spring', '0 0 9 ? * 0'));
  const quartz = explainCron(parse('quartz', '0 0 9 ? * 1'));
  const scheduler = explainCron(parse('eventbridge-scheduler', 'cron(0 9 ? * 1 2024)'));

  expect(spring).toMatchObject({ profile: 'spring' });
  expect(spring.lines).toContain('星期：0（星期日）');
  expect(spring.lines).toContain('日期字段 ? 表示未指定；Spring 以日期和星期条件同时约束');
  expect(quartz).toMatchObject({ profile: 'quartz' });
  expect(quartz.lines).toContain('星期：1（星期日）');
  expect(quartz.lines).toContain('日期和星期字段使用 ? 明确未指定项');
  expect(scheduler).toMatchObject({ profile: 'eventbridge-scheduler' });
  expect(scheduler.lines).toContain('星期：1（星期日）');
});

test('advanced explanations distinguish weekday ranges and nth weekdays by selected profile', () => {
  const springRange = explainCron(parse('spring', '0 0 9 ? * 2-6'));
  const quartzRange = explainCron(parse('quartz', '0 0 9 ? * 2-6'));
  const springNth = explainCron(parse('spring', '0 0 9 ? * 2#2'));
  const quartzNth = explainCron(parse('quartz', '0 0 9 ? * 2#2'));

  expect(springRange.lines).toContain('星期：2（星期二）至 6（星期六）');
  expect(quartzRange.lines).toContain('星期：2（星期一）至 6（星期五）');
  expect(springNth.lines).toContain('星期：2（星期二）的第 2 个');
  expect(quartzNth.lines).toContain('星期：2（星期一）的第 2 个');
});
