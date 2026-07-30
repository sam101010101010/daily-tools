import { expect, test } from 'vitest';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';
import type { CronProfileId } from './profiles';

function parse(profile: CronProfileId, expression: string) {
  const result = parseCron(profile, expression);
  expect(result).toMatchObject({ ok: true, value: { profile } });
  if (!result.ok) throw new Error(`Expected ${profile} to accept ${expression}`);
  return result.value;
}

test.each([
  ['linux-vixie', '0 9 * * * *'],
  ['macos-bsd', '0 9 * * * *'],
  ['kubernetes', '0 9 * * * *'],
  ['spring', '0 9 * * *'],
  ['quartz', '0 9 * * *'],
  ['eventbridge-scheduler', 'cron(0 9 ? * MON-FRI)'],
  ['eventbridge-legacy', 'cron(0 9 ? * MON-FRI)'],
] as const)('%s rejects an official field-count mismatch before evaluator construction', (profile, expression) => {
  expect(parseCron(profile, expression)).toMatchObject({
    ok: false,
    error: { profile, field: 'expression', code: 'field-count' },
  });
});

test.each([
  ['linux-vixie', 'cron(0 9 * * *)'],
  ['macos-bsd', 'cron(0 9 * * *)'],
  ['kubernetes', 'cron(0 9 * * *)'],
  ['spring', 'cron(0 0 9 * * *)'],
  ['quartz', 'cron(0 0 9 ? * MON-FRI)'],
  ['eventbridge-scheduler', '0 9 ? * MON-FRI 2024'],
  ['eventbridge-legacy', '0 9 ? * MON-FRI 2024'],
] as const)('%s rejects a wrapper belonging to another Cron dialect', (profile, expression) => {
  expect(parseCron(profile, expression)).toMatchObject({
    ok: false,
    error: { profile, field: 'expression' },
  });
});

test.each([
  ['linux-vixie', '0 0 * * 1'],
  ['macos-bsd', '0 0 * * 1'],
  ['kubernetes', '0 0 * * 1'],
  ['spring', '0 0 0 ? * 1'],
  ['quartz', '0 0 0 ? * 2'],
  ['eventbridge-scheduler', 'cron(0 0 ? * 2 2024)'],
  ['eventbridge-legacy', 'cron(0 0 ? * 2 2024)'],
] as const)('%s previews Monday using its own documented weekday number', (profile, expression) => {
  const result = previewCron(parse(profile, expression), 'UTC', new Date('2023-12-31T23:59:00.000Z'));
  expect(result).toMatchObject({ ok: true, profile });
  if (!result.ok) throw new Error(`Expected ${profile} preview`);
  expect(result.value.runs[0]?.iso).toBe('2024-01-01T00:00:00.000Z');
});

test('Spring applies DOM and DOW together when neither is ?', () => {
  const result = previewCron(
    parse('spring', '0 0 0 1 * MON'),
    'UTC',
    new Date('2024-01-02T00:00:00.000Z'),
  );
  expect(result).toMatchObject({ ok: true, profile: 'spring' });
  if (!result.ok) throw new Error('Expected Spring preview');
  expect(result.value.runs[0]?.iso).toBe('2024-04-01T00:00:00.000Z');
});
