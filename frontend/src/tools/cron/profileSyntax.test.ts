import { expect, test } from 'vitest';
import { parseCron } from './profileSyntax';

test.each(['linux-vixie', 'macos-bsd'] as const)(
  'tags the %s five-field AST with its selected profile',
  (profile) => {
    expect(parseCron(profile, '  */15   9-17  1,15  JAN-MAR  mon-fri  ')).toEqual({
      ok: true,
      value: {
        profile,
        normalized: '*/15 9-17 1,15 JAN-MAR MON-FRI',
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
  'kubernetes',
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
