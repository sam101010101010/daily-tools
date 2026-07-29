import { expect, test } from 'vitest';
import { parseFiveFieldCron } from './cronSyntax';

test('normalizes whitespace and returns a typed five-field AST', () => {
  expect(parseFiveFieldCron('  */15   9-17  1,15  JAN-MAR  mon-fri  ')).toEqual({
    ok: true,
    value: {
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
});

test('parses a wildcard, list, ascending range, and step nodes', () => {
  expect(parseFiveFieldCron('* 1,2,23 1-31/2 * 0,7')).toEqual({
    ok: true,
    value: {
      normalized: '* 1,2,23 1-31/2 * 0,7',
      fields: [
        { name: 'minute', node: { kind: 'wildcard' } },
        { name: 'hour', node: { kind: 'list', items: [{ kind: 'value', value: 1 }, { kind: 'value', value: 2 }, { kind: 'value', value: 23 }] } },
        { name: 'dayOfMonth', node: { kind: 'step', base: { kind: 'range', start: 1, end: 31 }, step: 2 } },
        { name: 'month', node: { kind: 'wildcard' } },
        { name: 'dayOfWeek', node: { kind: 'list', items: [{ kind: 'value', value: 0 }, { kind: 'value', value: 7 }] } },
      ],
    },
  });
});

test('accepts month and weekday names case-insensitively', () => {
  expect(parseFiveFieldCron('0 0 * jan,Dec sun-SAT')).toMatchObject({
    ok: true,
    value: {
      normalized: '0 0 * JAN,DEC SUN-SAT',
      fields: [
        {}, {}, {}, { node: { kind: 'list', items: [{ kind: 'value', value: 1 }, { kind: 'value', value: 12 }] } },
        { node: { kind: 'range', start: 0, end: 6 } },
      ],
    },
  });
});

test.each([
  ['* * * *', 'expression'],
  ['* * * * * *', 'expression'],
  ['* * * * * * *', 'expression'],
  ['@daily', 'expression'],
  ['2026-01-01T00:00:00Z', 'expression'],
  ['* * L * *', 'dayOfMonth'],
  ['* * 1W * *', 'dayOfMonth'],
  ['* * * * MON#2', 'dayOfWeek'],
  ['* * ? * *', 'dayOfMonth'],
  ['* * * * MON-FRI+1', 'dayOfWeek'],
  ['+1 * * * *', 'minute'],
  ['-1 * * * *', 'minute'],
  ['* * * JAN1 *', 'month'],
  ['* * * 1JAN *', 'month'],
  ['* * * JAN/FEB *', 'month'],
  ['* * * * SUN0', 'dayOfWeek'],
  ['* * * * 0SUN', 'dayOfWeek'],
  ['* * * * SUN/MON', 'dayOfWeek'],
  ['* * * * *,', 'dayOfWeek'],
  ['* * * * MON,,FRI', 'dayOfWeek'],
  ['* * * * FRI-MON', 'dayOfWeek'],
  ['*/0 * * * *', 'minute'],
  ['60 * * * *', 'minute'],
  ['0-60 * * * *', 'minute'],
  ['* 24 * * *', 'hour'],
  ['* * 32 * *', 'dayOfMonth'],
  ['* * * 13 *', 'month'],
  ['* * * JAN-13 *', 'month'],
  ['* * * * 8', 'dayOfWeek'],
])('rejects unsupported or invalid input %s at %s', (input, field) => {
  expect(parseFiveFieldCron(input)).toMatchObject({ ok: false, error: { field } });
});
