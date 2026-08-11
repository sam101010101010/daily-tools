import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TimezoneTool from './TimezoneTool';

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T01:23:45Z'));
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function resolvedOptions(this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: 'Asia/Shanghai' };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.selectOptions(screen.getByLabelText(label), value);
}

function renderInteractive() {
  render(<TimezoneTool />);
  vi.useRealTimers();
  return userEvent.setup();
}

test('defaults from the browser once and renders ordinary source and target cards', () => {
  render(<TimezoneTool />);

  expect(screen.getByLabelText('源日期和时间')).toHaveValue('2026-08-11T09:23');
  expect(screen.getByLabelText('源时区')).toHaveValue('Asia/Shanghai');
  expect(screen.getByLabelText('目标时区 1')).toHaveValue('UTC');
  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('2026-08-11');
  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('09:23');
  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('UTC+08:00');
  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('与源日期同日');
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('01:23');
});

test('falls back to UTC when the browser does not report a time zone', () => {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const fallbackDateTimeFormat = function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
    const formatter = new RealDateTimeFormat(...args);
    if (args.length > 0) return formatter;
    return new Proxy(formatter, {
      get(target, property, receiver) {
        if (property === 'resolvedOptions') {
          return () => ({ ...target.resolvedOptions(), timeZone: '' });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  } as unknown as typeof Intl.DateTimeFormat;
  Object.setPrototypeOf(fallbackDateTimeFormat, RealDateTimeFormat);
  const fallbackIntl = Object.create(Intl) as typeof Intl;
  Object.defineProperty(fallbackIntl, 'DateTimeFormat', { value: fallbackDateTimeFormat });
  vi.stubGlobal('Intl', fallbackIntl);
  render(<TimezoneTool />);

  expect(screen.getByLabelText('源时区')).toHaveValue('UTC');
});

test('source changes preserve wall text and reinterpret the displayed instant', async () => {
  const user = renderInteractive();

  await choose(user, '源时区', 'UTC');

  expect(screen.getByLabelText('源日期和时间')).toHaveValue('2026-08-11T09:23');
  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('09:23');
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('09:23');
});

test('target changes preserve the source instant', async () => {
  const user = renderInteractive();

  await choose(user, '目标时区 1', 'America/New_York');

  expect(screen.getByLabelText('源时区结果')).toHaveTextContent('09:23');
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('2026-08-10');
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('21:23');
});

test('enforces one through four unique targets and keeps their rendered order stable', async () => {
  const user = renderInteractive();

  for (const [index, zone] of ['Europe/London', 'America/New_York', 'Asia/Tokyo'].entries()) {
    await user.click(screen.getByRole('button', { name: '添加目标时区' }));
    await choose(user, `目标时区 ${index + 2}`, zone);
  }

  expect(screen.getAllByRole('combobox', { name: /目标时区 \d/ })).toHaveLength(4);
  expect(screen.getByRole('button', { name: '添加目标时区' })).toBeDisabled();
  expect(within(screen.getByLabelText('目标时区 1')).getByRole('option', { name: 'UTC' })).toBeEnabled();
  expect(within(screen.getByLabelText('目标时区 2')).getByRole('option', { name: 'UTC' })).toBeDisabled();
  expect(screen.getAllByLabelText(/目标时区结果 \d/).map(card => card.textContent)).toEqual([
    expect.stringContaining('UTC'),
    expect.stringContaining('Europe/London'),
    expect.stringContaining('America/New_York'),
    expect.stringContaining('Asia/Tokyo'),
  ]);
});

test('keeps one target, supports keyboard reordering, and updates rendered/all-copy order', async () => {
  const user = renderInteractive();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  await user.click(screen.getByRole('button', { name: '添加目标时区' }));
  await choose(user, '目标时区 2', 'America/New_York');
  screen.getByRole('button', { name: '上移目标时区 2' }).focus();
  await user.keyboard('{Enter}');

  expect(screen.getByLabelText('目标时区 1')).toHaveValue('America/New_York');
  expect(screen.getByLabelText('目标时区 2')).toHaveValue('UTC');
  await user.click(screen.getByRole('button', { name: '复制全部' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith([
    '2026-08-11 09:23 Asia/Shanghai (UTC+08:00, 与源日期同日)',
    '2026-08-10 21:23 America/New_York (UTC-04:00, -1 天)',
    '2026-08-11 01:23 UTC (UTC+00:00, 与源日期同日)',
  ].join('\n')));

  await user.click(screen.getByRole('button', { name: '删除目标时区 2' }));
  expect(screen.getAllByRole('combobox', { name: /目标时区 \d/ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: '删除目标时区 1' })).toBeDisabled();
});

test('clears prior cards and stale copy status when input or source changes', async () => {
  const user = renderInteractive();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  await user.click(screen.getByRole('button', { name: '复制源时间' }));
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
  await user.clear(screen.getByLabelText('源日期和时间'));
  await user.type(screen.getByLabelText('源日期和时间'), 'invalid');

  expect(screen.getByRole('alert')).toHaveTextContent('请输入有效的 YYYY-MM-DDTHH:mm 和 IANA 时区。');
  expect(screen.queryByLabelText('源时区结果')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('clears a successful copy announcement when a target changes', async () => {
  const user = renderInteractive();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  await user.click(screen.getByRole('button', { name: '复制源时间' }));
  await screen.findByRole('status');
  await choose(user, '目标时区 1', 'America/New_York');

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('America/New_York');
});

test('renders DST gaps as errors without cards', async () => {
  const user = renderInteractive();

  await choose(user, '源时区', 'America/New_York');
  await user.clear(screen.getByLabelText('源日期和时间'));
  await user.type(screen.getByLabelText('源日期和时间'), '2024-03-10T02:30');

  expect(screen.getByRole('alert')).toHaveTextContent('该本地时间在所选时区不存在（夏令时跳转）');
  expect(screen.queryByLabelText('源时区结果')).not.toBeInTheDocument();
});

test('requires a labelled fold choice before rendering the corresponding instant', async () => {
  const user = renderInteractive();

  await choose(user, '源时区', 'America/New_York');
  await user.clear(screen.getByLabelText('源日期和时间'));
  await user.type(screen.getByLabelText('源日期和时间'), '2024-11-03T01:30');

  const choices = screen.getByRole('group', { name: '请选择夏令时结束时刻' });
  expect(choices).toHaveTextContent('UTC-04:00');
  expect(choices).toHaveTextContent('2024-11-03T05:30:00.000Z');
  expect(choices).toHaveTextContent('UTC-05:00');
  expect(choices).toHaveTextContent('2024-11-03T06:30:00.000Z');
  expect(screen.queryByLabelText('源时区结果')).not.toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: /较早.*UTC-04:00/ }));
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('05:30');
  await choose(user, '源时区', 'UTC');
  await choose(user, '源时区', 'America/New_York');
  await user.click(screen.getByRole('radio', { name: /较晚.*UTC-05:00/ }));
  expect(screen.getByLabelText('目标时区结果 1')).toHaveTextContent('06:30');
});

test('copies real DTO strings and announces clipboard failures', async () => {
  const user = renderInteractive();
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  await user.click(screen.getByRole('button', { name: '复制源时间' }));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith('2026-08-11 09:23 Asia/Shanghai (UTC+08:00, 与源日期同日)'));
  expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制。');
});

test('copies each target card with its exact DTO text', async () => {
  const user = renderInteractive();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  await user.click(screen.getByRole('button', { name: '添加目标时区' }));
  await choose(user, '目标时区 2', 'America/New_York');
  await user.click(screen.getByRole('button', { name: '复制目标时间 1' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(
    '2026-08-11 01:23 UTC (UTC+00:00, 与源日期同日)',
  ));
  await user.click(screen.getByRole('button', { name: '复制目标时间 2' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(
    '2026-08-10 21:23 America/New_York (UTC-04:00, -1 天)',
  ));
});

test('does not use network, storage, or timers while converting', async () => {
  vi.useRealTimers();
  const fetchSpy = vi.fn();
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const interval = vi.spyOn(globalThis, 'setInterval');
  const timeout = vi.spyOn(globalThis, 'setTimeout');
  vi.stubGlobal('fetch', fetchSpy);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<TimezoneTool />);

  fireEvent.change(screen.getByLabelText('源日期和时间'), { target: { value: '2026-08-11T09:23' } });
  fireEvent.change(screen.getByLabelText('源时区'), { target: { value: 'America/New_York' } });
  fireEvent.click(screen.getByRole('button', { name: '添加目标时区' }));
  fireEvent.change(screen.getByLabelText('目标时区 2'), { target: { value: 'Europe/London' } });
  fireEvent.click(screen.getByRole('button', { name: '上移目标时区 2' }));
  fireEvent.click(screen.getByRole('button', { name: '下移目标时区 1' }));
  fireEvent.click(screen.getByRole('button', { name: '删除目标时区 2' }));
  fireEvent.change(screen.getByLabelText('源日期和时间'), { target: { value: '2024-11-03T01:30' } });
  fireEvent.click(screen.getByRole('radio', { name: /较早.*UTC-04:00/ }));
  fireEvent.click(screen.getByRole('button', { name: '复制源时间' }));
  fireEvent.click(screen.getByRole('button', { name: '复制目标时间 1' }));
  fireEvent.click(screen.getByRole('button', { name: '复制全部' }));
  await act(async () => { await Promise.resolve(); });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
  expect(interval).not.toHaveBeenCalled();
  expect(timeout).not.toHaveBeenCalled();
});
