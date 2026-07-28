import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import IdGeneratorTool from './IdGeneratorTool';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function generatedValues(): string[] {
  return screen.getAllByRole('listitem').map((item) => {
    const value = within(item).getByRole('code').textContent;
    if (value === null) throw new Error('generated identifier has no text');
    return value;
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test('defaults to one UUID v4 and generates the selected UUID v7 or ULID type', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);

  const type = screen.getByRole('combobox', { name: '标识符类型' });
  const count = screen.getByRole('spinbutton', { name: '生成数量' });
  expect(type).toHaveValue('uuid-v4');
  expect(count).toHaveValue(1);

  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  expect(generatedValues()).toHaveLength(1);
  expect(generatedValues()[0]).toMatch(UUID_V4_PATTERN);

  await user.selectOptions(type, 'uuid-v7');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  expect(generatedValues()[0]).toMatch(UUID_V7_PATTERN);

  await user.selectOptions(type, 'ulid');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  expect(generatedValues()[0]).toMatch(ULID_PATTERN);
});

test('generates a scrollable batch of 100 and replaces the previous results', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);

  await user.clear(screen.getByRole('spinbutton', { name: '生成数量' }));
  await user.type(screen.getByRole('spinbutton', { name: '生成数量' }), '100');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));

  const results = screen.getByRole('list', { name: '生成结果' });
  const firstBatch = generatedValues();
  expect(firstBatch).toHaveLength(100);
  expect(results).toHaveClass('id-generator__results--scrollable');
  expect(results).not.toHaveAttribute('style');
  expect(results).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('button', { name: '全部复制' })).toHaveClass('id-generator__copy-all');
  expect(screen.getByRole('button', { name: '复制第 1 个标识符' })).toHaveClass('id-generator__copy-one');
  expect(screen.queryAllByRole('status')).toHaveLength(0);

  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  const secondBatch = generatedValues();
  expect(secondBatch).toHaveLength(100);
  expect(secondBatch).not.toEqual(firstBatch);
});

test('clears a submitted count error as soon as the count is edited', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);
  const count = screen.getByRole('spinbutton', { name: '生成数量' });

  await user.clear(count);
  await user.type(count, '0');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  expect(screen.getByRole('alert')).toHaveTextContent('生成数量必须是 1 到 100 之间的整数');

  await user.clear(count);
  await user.type(count, '2');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('supports keyboard generation and exposes results with list semantics', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);

  const generate = screen.getByRole('button', { name: '生成标识符' });
  generate.focus();
  await user.keyboard('{Enter}');

  expect(generate).toHaveFocus();
  expect(screen.getByRole('list', { name: '生成结果' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
});

test('copies an individual identifier and the whole newline-delimited list with one status region', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IdGeneratorTool />);

  await user.clear(screen.getByRole('spinbutton', { name: '生成数量' }));
  await user.type(screen.getByRole('spinbutton', { name: '生成数量' }), '3');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  const values = generatedValues();

  await user.click(screen.getByRole('button', { name: '复制第 2 个标识符' }));
  expect(writeText).toHaveBeenLastCalledWith(values[1]);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('第 2 个标识符已复制');

  await user.click(screen.getByRole('button', { name: '全部复制' }));
  expect(writeText).toHaveBeenLastCalledWith(values.join('\n'));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('全部标识符已复制');
});

test('repeats the same copy announcement through a fresh live-region update', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IdGeneratorTool />);

  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  const copy = screen.getByRole('button', { name: '复制第 1 个标识符' });
  await user.click(copy);
  const firstAnnouncement = screen.getByRole('status');

  await user.click(copy);

  expect(writeText).toHaveBeenCalledTimes(2);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('第 1 个标识符已复制');
  expect(screen.getByRole('status')).not.toBe(firstAnnouncement);
});

test('keeps the newest copy feedback when clipboard completions resolve out of order', async () => {
  const user = userEvent.setup();
  const firstCopy = deferred<void>();
  const secondCopy = deferred<void>();
  const writeText = vi.fn()
    .mockReturnValueOnce(firstCopy.promise)
    .mockReturnValueOnce(secondCopy.promise);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IdGeneratorTool />);

  await user.clear(screen.getByRole('spinbutton', { name: '生成数量' }));
  await user.type(screen.getByRole('spinbutton', { name: '生成数量' }), '2');
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  await user.click(screen.getByRole('button', { name: '复制第 1 个标识符' }));
  await user.click(screen.getByRole('button', { name: '复制第 2 个标识符' }));

  await act(async () => secondCopy.resolve());
  const newestAnnouncement = screen.getByRole('status');
  expect(newestAnnouncement).toHaveTextContent('第 2 个标识符已复制');

  await act(async () => firstCopy.resolve());
  expect(screen.getByRole('status')).toBe(newestAnnouncement);
  expect(screen.getByRole('status')).toHaveTextContent('第 2 个标识符已复制');
});

test('discards pending copy feedback after the generated batch or controls become obsolete', async () => {
  const user = userEvent.setup();
  const batchCopy = deferred<void>();
  const controlCopy = deferred<void>();
  const writeText = vi.fn()
    .mockReturnValueOnce(batchCopy.promise)
    .mockReturnValueOnce(controlCopy.promise);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IdGeneratorTool />);

  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  await user.click(screen.getByRole('button', { name: '复制第 1 个标识符' }));
  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  await act(async () => batchCopy.resolve());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '复制第 1 个标识符' }));
  await user.selectOptions(screen.getByRole('combobox', { name: '标识符类型' }), 'uuid-v7');
  await act(async () => controlCopy.resolve());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('inspects UUID v4, UUID v7, and ULID types with only available time metadata', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);
  const input = screen.getByRole('textbox', { name: '待检查标识符' });

  await user.type(input, '550e8400-e29b-41d4-a716-446655440000');
  expect(screen.getByRole('definition', { name: '类型' })).toHaveTextContent('UUID v4');
  expect(screen.getByRole('definition', { name: '时间' })).toHaveTextContent('不包含时间');

  await user.clear(input);
  await user.type(input, '01a2ce8b-d400-7000-8000-000000000000');
  expect(screen.getByRole('definition', { name: '类型' })).toHaveTextContent('UUID v7');
  expect(screen.getByRole('definition', { name: '时间' })).toHaveTextContent('2027-01-01T00:00:00.000Z');

  await user.clear(input);
  await user.type(input, '01ARYZ6S41TSV4RRFFQ69G5FAV');
  expect(screen.getByRole('definition', { name: '类型' })).toHaveTextContent('ULID');
  expect(screen.getByRole('definition', { name: '时间' })).toHaveTextContent('2016-07-30T22:36:16.385Z');
});

test('clears stale inspection details for invalid or empty input', async () => {
  const user = userEvent.setup();
  render(<IdGeneratorTool />);
  const input = screen.getByRole('textbox', { name: '待检查标识符' });

  await user.type(input, '01a2ce8b-d400-7000-8000-000000000000');
  expect(screen.getByRole('definition', { name: '类型' })).toHaveTextContent('UUID v7');

  await user.clear(input);
  await user.type(input, 'not-an-id');
  expect(screen.getByRole('alert')).toHaveTextContent('无法识别该标识符');
  expect(screen.queryByRole('definition', { name: '类型' })).not.toBeInTheDocument();

  await user.clear(input);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('definition', { name: '类型' })).not.toBeInTheDocument();
});

test('keeps generation, inspection, and copy local without fetch or storage', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IdGeneratorTool />);

  await user.click(screen.getByRole('button', { name: '生成标识符' }));
  await user.click(screen.getByRole('button', { name: '复制第 1 个标识符' }));
  await user.type(
    screen.getByRole('textbox', { name: '待检查标识符' }),
    '01ARYZ6S41TSV4RRFFQ69G5FAV',
  );

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(getItemSpy).not.toHaveBeenCalled();
  expect(setItemSpy).not.toHaveBeenCalled();
  expect(removeItemSpy).not.toHaveBeenCalled();
});
