import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import TimestampTool from './TimestampTool';

afterEach(() => vi.unstubAllGlobals());

test('pre-fills a local ISO example in the browser time zone without a network request', () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  render(<TimestampTool />);

  expect(screen.getByLabelText('时间输入')).toHaveValue('2024-01-01T00:00:00.000Z');
  expect(screen.getByLabelText('输入格式')).toHaveValue('auto');
  expect(screen.getByLabelText('时区')).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(screen.getByLabelText('Unix 秒')).toHaveTextContent('1704067200');
  expect(screen.getByLabelText('Unix 毫秒')).toHaveTextContent('1704067200000');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('updates all output forms when the user explicitly enters Unix seconds', async () => {
  const user = userEvent.setup();
  render(<TimestampTool />);

  await user.selectOptions(screen.getByLabelText('输入格式'), 'seconds');
  await user.clear(screen.getByLabelText('时间输入'));
  await user.type(screen.getByLabelText('时间输入'), '1704067200');

  expect(screen.getByLabelText('ISO 8601')).toHaveTextContent('2024-01-01T00:00:00.000Z');
  expect(screen.getByLabelText('Unix 秒')).toHaveTextContent('1704067200');
  expect(screen.getByLabelText('Unix 毫秒')).toHaveTextContent('1704067200000');
});

test('reformats the readable date without changing the represented instant when time zone changes', async () => {
  const user = userEvent.setup();
  render(<TimestampTool />);

  await user.selectOptions(screen.getByLabelText('时区'), 'America/New_York');

  expect(screen.getByLabelText('所选时区日期')).toHaveTextContent('2023-12-31 19:00:00');
  expect(screen.getByLabelText('ISO 8601')).toHaveTextContent('2024-01-01T00:00:00.000Z');
  expect(screen.getByLabelText('Unix 秒')).toHaveTextContent('1704067200');
});

test('copies each rendered result through the shared clipboard helper', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<TimestampTool />);

  await user.click(screen.getByRole('button', { name: '复制 Unix 秒' }));

  expect(writeText).toHaveBeenCalledWith('1704067200');
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
});

test('keeps the rendered result visible when copying is unavailable', async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  render(<TimestampTool />);

  await user.click(screen.getByRole('button', { name: '复制 Unix 秒' }));

  expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制。');
  expect(screen.getByLabelText('Unix 秒')).toHaveTextContent('1704067200');
});

test('replaces conversion results with an error for an ambiguous numeric input', async () => {
  const user = userEvent.setup();
  render(<TimestampTool />);

  await user.clear(screen.getByLabelText('时间输入'));
  await user.type(screen.getByLabelText('时间输入'), '17040672000');

  expect(screen.getByRole('alert')).toHaveTextContent('无法自动识别时间格式，请选择秒或毫秒');
  expect(screen.queryByLabelText('转换结果')).not.toBeInTheDocument();
});
