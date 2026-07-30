import { expect, test } from 'vitest';
import { explainCron } from './cronExplain';
import { parseCron } from './profileSyntax';

function explain(expression: string): readonly string[] {
  const parsed = parseCron('linux-vixie', expression);
  if (!parsed.ok) throw new Error(`Expected a valid expression: ${expression}`);
  return explainCron(parsed.value).lines;
}

test.each(['linux-vixie', 'macos-bsd'] as const)(
  'preserves the selected %s profile in the explanation result',
  (profile) => {
    const parsed = parseCron(profile, '0 9 * * MON-FRI');
    if (!parsed.ok) throw new Error(`Expected a valid ${profile} expression`);

    const result = explainCron(parsed.value);
    expect(result.profile).toBe(profile);
    expect(result.lines.slice(0, 2)).toEqual(['分钟：00 分', '小时：09 时']);
  },
);

test('explains an every-minute schedule deterministically', () => {
  expect(explain('* * * * *')).toEqual([
    '分钟：每分钟',
    '小时：每小时',
    '日期：每天',
    '月份：每月',
    '星期：每天',
  ]);
});

test('explains wildcard steps and a fixed time', () => {
  expect(explain('*/15 9 * * *')).toEqual([
    '分钟：每 15 分钟',
    '小时：09 时',
    '日期：每天',
    '月份：每月',
    '星期：每天',
  ]);
});

test('explains ranges, lists, weekday names, and month/day constraints', () => {
  expect(explain('0 9-17 1,15 JAN-MAR MON-FRI')).toEqual([
    '分钟：00 分',
    '小时：09 时至 17 时',
    '日期：1 日、15 日',
    '月份：1 月至 3 月',
    '星期：星期一至星期五',
    '日期和星期均受限时，任一条件满足即可执行',
  ]);
});

test('does not describe DOM/DOW as restricted when both nodes cover their full domains', () => {
  expect(explain('0 0 1-31 * 0-7')).not.toContain('日期和星期均受限时，任一条件满足即可执行');
});
