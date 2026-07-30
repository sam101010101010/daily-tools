import { expect, test } from 'vitest';
import { parseCron } from './profileSyntax';

test.each([
  ['linux-vixie', '  */15   9-17  1,15  JAN-MAR  mon-fri  '],
  ['macos-bsd', '  */15   9-17  1,15  1-3  1-5  '],
] as const)(
  'tags the %s five-field AST with its selected profile',
  (profile, expression) => {
    expect(parseCron(profile, expression)).toEqual({
      ok: true,
      value: {
        profile,
        normalized: profile === 'linux-vixie'
          ? '*/15 9-17 1,15 JAN-MAR MON-FRI'
          : '*/15 9-17 1,15 1-3 1-5',
        fields: [
          { name: 'minute', node: { kind: 'step', base: { kind: 'wildcard' }, step: 15 } },
          { name: 'hour', node: { kind: 'range', start: 9, end: 17 } },
          { name: 'dayOfMonth', node: { kind: 'list', items: [{ kind: 'value', value: 1 }, { kind: 'value', value: 15 }] } },
          { name: 'month', node: { kind: 'range', start: 1, end: 3 } },
          { name: 'dayOfWeek', node: { kind: 'range', start: 1, end: 5 } },
        ],
      },
    });
  },
);

test.each(['linux-vixie', 'macos-bsd'] as const)(
  'preserves stable five-field errors for %s',
  (profile) => {
    expect(parseCron(profile, '* * 1W * *')).toEqual({
      ok: false,
      error: {
        profile,
        field: 'dayOfMonth',
        code: 'invalid-value',
        message: '字段值无效',
      },
    });
  },
);

test.each([
  'spring',
  'quartz',
  'eventbridge-scheduler',
  'eventbridge-legacy',
] as const)('does not pass %s through the legacy five-field parser', (profile) => {
  expect(parseCron(profile, '* * * * *')).toEqual({
    ok: false,
    error: {
      profile,
      field: 'expression',
      code: 'profile-not-implemented',
      message: '该 Cron 方言尚未实现',
    },
  });
});

test.each([
  ['linux-vixie', '*/15 9-17 1,15 JAN-MAR MON-FRI'],
  ['macos-bsd', '*/15 9-17 1,15 1-3 1-5'],
] as const)('%s accepts its documented five-field lists, ranges and steps', (profile, expression) => {
  expect(parseCron(profile, expression)).toMatchObject({
    ok: true,
    value: { profile },
  });
});

test.each(['linux-vixie', 'macos-bsd'] as const)('%s rejects macros and question-mark fields', (profile) => {
  expect(parseCron(profile, '@daily')).toMatchObject({ ok: false, error: { profile, code: 'unsupported' } });
  expect(parseCron(profile, '@reboot')).toMatchObject({ ok: false, error: { profile, code: 'unsupported' } });
  expect(parseCron(profile, '0 9 ? * *')).toMatchObject({ ok: false, error: { profile, code: 'unsupported' } });
});

test('macOS/BSD accepts named month and weekday tokens with lists, ranges, and steps', () => {
  expect(parseCron('macos-bsd', '*/15 9-17 1,15 JAN-MAR MON-FRI')).toMatchObject({
    ok: true,
    value: {
      profile: 'macos-bsd',
      normalized: '*/15 9-17 1,15 JAN-MAR MON-FRI',
    },
  });
});

test.each([
  ['linux-vixie', 'TZ=UTC 0 9 * * *'],
  ['linux-vixie', 'MAILTO=ops@example.test 0 9 * * *'],
  ['kubernetes', 'CRON_TZ=Asia/Shanghai 0 9 * * *'],
] as const)('%s rejects an embedded environment assignment', (profile, expression) => {
  expect(parseCron(profile, expression)).toEqual({
    ok: false,
    error: {
      profile,
      field: 'expression',
      code: 'unsupported',
      message: 'Cron 表达式不支持环境变量前缀',
    },
  });
});

test('Kubernetes normalizes documented macros and question-mark wildcards locally', () => {
  expect(parseCron('kubernetes', '@daily')).toMatchObject({
    ok: true,
    value: {
      profile: 'kubernetes',
      normalized: '0 0 * * *',
    },
  });
  expect(parseCron('kubernetes', '0 9 ? * MON-FRI')).toMatchObject({
    ok: true,
    value: {
      profile: 'kubernetes',
      normalized: '0 9 * * MON-FRI',
    },
  });
  expect(parseCron('kubernetes', '0 9 1 * ?')).toMatchObject({
    ok: true,
    value: {
      profile: 'kubernetes',
      normalized: '0 9 1 * *',
    },
  });
});

test('Kubernetes keeps Sunday through Saturday in the 0 to 6 range and never inherits Linux Sunday 7', () => {
  expect(parseCron('kubernetes', '0 9 * * 6')).toMatchObject({ ok: true, value: { profile: 'kubernetes' } });
  expect(parseCron('kubernetes', '0 9 * * 7')).toEqual({
    ok: false,
    error: {
      profile: 'kubernetes',
      field: 'dayOfWeek',
      code: 'invalid-value',
      message: '字段值无效',
    },
  });
});
