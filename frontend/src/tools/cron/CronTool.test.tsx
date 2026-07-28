import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import * as cronPreview from './cronPreview';
import CronTool from './CronTool';

const FIXED_NOW = new Date('2024-01-01T00:07:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('shows the public five-field default, browser zone, explanation, and ten future runs without I/O', () => {
  const fetchSpy = vi.fn();
  const storageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
  const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
  vi.stubGlobal('fetch', fetchSpy);

  render(<CronTool now={() => FIXED_NOW} />);

  expect(screen.getByText('五字段 Cron')).toBeInTheDocument();
  expect(screen.getByText(/仅解释和预览，不会执行任务/)).toBeInTheDocument();
  expect(screen.getByLabelText('Cron 表达式')).toHaveValue('*/15 9-17 * * MON-FRI');
  expect(screen.getByLabelText('IANA 时区')).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(within(screen.getByLabelText('字段顺序')).getAllByRole('listitem').map(item => item.textContent)).toEqual([
    '分钟（0–59）',
    '小时（0–23）',
    '日期（1–31）',
    '月份（1–12 / JAN–DEC）',
    '星期（0–7 / SUN–SAT）',
  ]);
  expect(within(screen.getByLabelText('表达式解释')).getAllByRole('listitem')).toHaveLength(5);
  expect(within(screen.getByLabelText('未来 10 次运行时间')).getAllByRole('row')).toHaveLength(11);
  expect(screen.getAllByText(/T\d{2}:\d{2}:\d{2}\.000Z/)).toHaveLength(10);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storageGetSpy).not.toHaveBeenCalled();
  expect(storageSetSpy).not.toHaveBeenCalled();
});

test('uses the fixed-now seam and selected timezone for target-zone and ISO output', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('IANA 时区'), 'Asia/Shanghai');
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '生成预览' }));

  const rows = within(screen.getByLabelText('未来 10 次运行时间')).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('2024-01-01 09:00:00 Asia/Shanghai');
  expect(rows[1]).toHaveTextContent('2024-01-01T01:00:00.000Z');
});

test('states DOM/DOW OR semantics when both fields are restricted', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), '0 0 1 * MON');
  await user.selectOptions(screen.getByLabelText('IANA 时区'), 'UTC');
  await user.click(screen.getByRole('button', { name: '生成预览' }));

  expect(screen.getByRole('note')).toHaveTextContent('日期和星期均受限时，任一条件满足即可执行');
  const rows = within(screen.getByLabelText('未来 10 次运行时间')).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('2024-01-08T00:00:00.000Z');
  expect(rows[5]).toHaveTextContent('2024-02-01T00:00:00.000Z');
});

test('keeps DST gap behavior visible in target-zone and ISO columns', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => new Date('2024-03-09T00:00:00.000Z')} />);

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), '30 2 * * *');
  await user.selectOptions(screen.getByLabelText('IANA 时区'), 'America/New_York');
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');

  const rows = within(screen.getByLabelText('未来 10 次运行时间')).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('2024-03-09 02:30:00 America/New_York');
  expect(rows[1]).toHaveTextContent('2024-03-09T07:30:00.000Z');
  expect(rows[2]).toHaveTextContent('2024-03-11 02:30:00 America/New_York');
  expect(rows[2]).toHaveTextContent('2024-03-11T06:30:00.000Z');
});

test.each([
  ['0 0 L * *', '日期字段不支持 L 扩展语法'],
  ['0 0 1W * *', '日期字段不支持 W 扩展语法'],
  ['0 0 * * MON#2', '星期字段不支持 # 扩展语法'],
  ['0 0 ? * *', '日期字段不支持 ? 扩展语法'],
  ['0 0 * * +MON', '星期字段不支持 + 扩展语法'],
  ['0 0 1 1 * *', '只支持五字段，不支持秒或年份字段'],
  ['0 0 0 1 1 * 2026', '只支持五字段，不支持秒或年份字段'],
  ['@daily', '不支持 @daily 昵称'],
  ['2026-01-01T00:00:00Z', '不支持 ISO 时间'],
])('reports the unsupported field or feature for %s', async (expression, message) => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), expression);
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
});

test.each([
  ['0 0 * JULX *', '月份字段：字段值无效'],
  ['0 0 * * WEDX', '星期字段：字段值无效'],
  ['BAD * * * MON#2', '分钟字段：字段值无效'],
])('does not attribute an extension from another field to %s', async (expression, message) => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), expression);
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('alert')).not.toHaveTextContent('不支持 #');
});

test('maps dependency failures to a stable error without leaking raw stack text or stale preview', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  vi.spyOn(cronPreview, 'previewCron').mockImplementationOnce(() => {
    throw new Error('Croner exploded\n    at dependency-stack.js:42');
  });

  await user.clear(screen.getByLabelText('Cron 表达式'));
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Cron 表达式'), '0 9 * * *');
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent('无法生成预览，请检查五字段表达式与 IANA 时区');
  expect(screen.getByRole('alert')).not.toHaveTextContent(/Croner|dependency-stack/);
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
});

test('submits from the keyboard and copies the normalized expression and all rendered runs', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<CronTool now={() => FIXED_NOW} />);

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), '  0   9  * * *  ');
  await user.selectOptions(screen.getByLabelText('IANA 时区'), 'UTC');
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name: '复制表达式' }));
  expect(writeText).toHaveBeenLastCalledWith('0 9 * * *');

  await user.click(screen.getByRole('button', { name: '复制全部运行时间' }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining(
    '2024-01-01 09:00:00 UTC\t2024-01-01T09:00:00.000Z',
  ));
  expect(screen.getByRole('status')).toHaveTextContent('已复制运行时间');
});
