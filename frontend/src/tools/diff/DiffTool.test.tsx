import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { copyText } from '../../lib/copy';
import type { DiffResult } from './diff';
import DiffTool from './DiffTool';
import { startDiffJob } from './diffWorkerClient';

vi.mock('./diffWorkerClient', () => ({ startDiffJob: vi.fn() }));
vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));

const mockedStartDiffJob = vi.mocked(startDiffJob);
const mockedCopyText = vi.mocked(copyText);

type JobHandlers = Parameters<typeof startDiffJob>[1];

const UNIFIED_TEXT = [
  '--- original',
  '+++ modified',
  '@@ -1,2 +1,2 @@',
  ' heading',
  '-old value',
  '+new value',
  '@@ -5,2 +5,2 @@',
  '-removed',
  '+added',
  ' footer',
  '',
].join('\n');

const RESULT: DiffResult = {
  summary: { added: 1, deleted: 1, changed: 1, unchanged: 4 },
  rows: [
    {
      kind: 'equal',
      leftLineNumber: 1,
      rightLineNumber: 1,
      leftText: 'heading',
      rightText: 'heading',
      leftEnding: 'lf',
      rightEnding: 'lf',
    },
    {
      kind: 'replace',
      leftLineNumber: 2,
      rightLineNumber: 2,
      leftText: 'old value',
      rightText: 'new value',
      leftEnding: 'lf',
      rightEnding: 'lf',
      inline: {
        left: [
          { kind: 'delete', text: 'old' },
          { kind: 'equal', text: ' value' },
        ],
        right: [
          { kind: 'insert', text: 'new' },
          { kind: 'equal', text: ' value' },
        ],
      },
    },
    {
      kind: 'equal',
      leftLineNumber: 3,
      rightLineNumber: 3,
      leftText: 'context one',
      rightText: 'context one',
      leftEnding: 'lf',
      rightEnding: 'lf',
    },
    {
      kind: 'equal',
      leftLineNumber: 4,
      rightLineNumber: 4,
      leftText: 'context two',
      rightText: 'context two',
      leftEnding: 'lf',
      rightEnding: 'lf',
    },
    {
      kind: 'delete',
      leftLineNumber: 5,
      rightLineNumber: null,
      leftText: 'removed',
      rightText: null,
      leftEnding: 'lf',
      rightEnding: null,
    },
    {
      kind: 'insert',
      leftLineNumber: null,
      rightLineNumber: 5,
      leftText: null,
      rightText: 'added',
      leftEnding: null,
      rightEnding: 'lf',
    },
    {
      kind: 'equal',
      leftLineNumber: 6,
      rightLineNumber: 6,
      leftText: 'footer',
      rightText: 'footer',
      leftEnding: 'none',
      rightEnding: 'none',
    },
  ],
  hunks: [
    { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, rowStart: 0, rowEnd: 2 },
    { oldStart: 5, oldLines: 2, newStart: 5, newLines: 2, rowStart: 4, rowEnd: 7 },
  ],
  unifiedText: UNIFIED_TEXT,
};

function latestHandlers(): JobHandlers {
  return mockedStartDiffJob.mock.calls.at(-1)![1];
}

function latestCancel(): ReturnType<typeof vi.fn> {
  return mockedStartDiffJob.mock.results.at(-1)!.value.cancel as ReturnType<typeof vi.fn>;
}

async function compareAndReturn(result = RESULT): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  act(() => latestHandlers().onResult(result));
}

beforeEach(() => {
  mockedStartDiffJob.mockImplementation(() => ({ cancel: vi.fn() }));
  mockedCopyText.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test('starts with two safe editable examples and waits for an explicit local comparison', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const localStorageAccess = vi.spyOn(window, 'localStorage', 'get');
  const sessionStorageAccess = vi.spyOn(window, 'sessionStorage', 'get');

  render(<DiffTool />);

  expect(screen.getByLabelText('原始文本')).toHaveValue('Hello\nworld');
  expect(screen.getByLabelText('修改后文本')).toHaveValue('Hello\nCodex');
  expect(screen.getByRole('checkbox', { name: '忽略换行符样式' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: '忽略行尾空白' })).not.toBeChecked();
  expect(mockedStartDiffJob).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('差异摘要')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '比较文本' }));

  expect(mockedStartDiffJob).toHaveBeenCalledWith(
    {
      left: 'Hello\nworld',
      right: 'Hello\nCodex',
      options: {
        ignoreLineEndingStyle: false,
        ignoreTrailingWhitespace: false,
      },
    },
    expect.any(Object),
  );
  act(() => latestHandlers().onResult(RESULT));
  await user.click(screen.getByRole('button', { name: '复制统一差异' }));
  expect(mockedCopyText).toHaveBeenCalledWith(UNIFIED_TEXT);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(localStorageAccess).not.toHaveBeenCalled();
  expect(sessionStorageAccess).not.toHaveBeenCalled();
});

test('swaps both sources and passes both opt-in comparison toggles to the next job', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);

  await user.click(screen.getByRole('button', { name: '交换两侧' }));
  expect(screen.getByLabelText('原始文本')).toHaveValue('Hello\nCodex');
  expect(screen.getByLabelText('修改后文本')).toHaveValue('Hello\nworld');

  await user.click(screen.getByRole('checkbox', { name: '忽略换行符样式' }));
  await user.click(screen.getByRole('checkbox', { name: '忽略行尾空白' }));
  await user.click(screen.getByRole('button', { name: '比较文本' }));

  expect(mockedStartDiffJob.mock.calls[0][0]).toEqual({
    left: 'Hello\nCodex',
    right: 'Hello\nworld',
    options: {
      ignoreLineEndingStyle: true,
      ignoreTrailingWhitespace: true,
    },
  });
});

test('renders summary counts and a unified view with textual, labelled markers and subordinate inline emphasis', async () => {
  render(<DiffTool />);
  await compareAndReturn();

  const summary = screen.getByLabelText('差异摘要');
  expect(summary).toHaveTextContent('新增1');
  expect(summary).toHaveTextContent('删除1');
  expect(summary).toHaveTextContent('修改1');
  expect(summary).toHaveTextContent('未更改4');
  expect(screen.getByRole('radio', { name: '统一视图' })).toBeChecked();

  const unified = screen.getByLabelText('统一差异');
  expect(within(unified).getAllByLabelText('删除行').some(node => node.textContent === '−')).toBe(true);
  expect(within(unified).getAllByLabelText('新增行').some(node => node.textContent === '+')).toBe(true);
  expect(within(unified).getAllByLabelText('未更改行').some(node => node.textContent === '·')).toBe(true);
  expect(within(unified).getByText('old')).toHaveProperty('tagName', 'MARK');
  expect(within(unified).getByText('new')).toHaveProperty('tagName', 'MARK');
  expect(within(unified).getByLabelText('old value').closest('li')).toHaveTextContent('2');
  const deletionRow = within(unified).getByText('removed').closest('li')!;
  expect(within(deletionRow).getByLabelText('原始文本第 5 行')).toBeInTheDocument();
  expect(within(deletionRow).getByLabelText('修改后文本无对应行')).toHaveTextContent('—');
});

test('keeps unchanged row groups collapsed until their keyboard-operable disclosure is expanded', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await compareAndReturn();

  const disclosure = screen.getByText('显示 2 行未更改内容').closest('details');
  expect(disclosure).not.toHaveAttribute('open');
  expect(screen.getByText('heading').closest('details')).toBeNull();
  expect(screen.getByText('footer').closest('details')).toBeNull();

  await user.click(screen.getByText('显示 2 行未更改内容'));

  expect(disclosure).toHaveAttribute('open');
  expect(within(disclosure!).getByText('context one')).toBeInTheDocument();
  expect(within(disclosure!).getByText('context two')).toBeInTheDocument();
});

test('switches to a DTO-row-aligned split view with explicit null-side placeholders', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await compareAndReturn();

  await user.click(screen.getByRole('radio', { name: '并排视图' }));

  expect(screen.queryByLabelText('统一差异')).not.toBeInTheDocument();
  const split = screen.getByLabelText('并排差异');
  const replacementRow = within(split).getByLabelText('old value').closest('li')!;
  expect(within(replacementRow).getByLabelText('new value')).toBeInTheDocument();
  expect(within(replacementRow).getByLabelText('原始文本第 2 行')).toBeInTheDocument();
  expect(within(replacementRow).getByLabelText('修改后文本第 2 行')).toBeInTheDocument();

  const insertionRow = within(split).getByText('added').closest('li')!;
  expect(within(insertionRow).getByLabelText('原始文本无对应行')).toHaveTextContent('—');
  expect(within(insertionRow).getByLabelText('修改后文本第 5 行')).toBeInTheDocument();
  expect(within(insertionRow).getByLabelText('新增行')).toHaveTextContent('+');
});

test('always copies the deterministic unified DTO text and uses one polite status region', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await compareAndReturn();
  await user.click(screen.getByRole('radio', { name: '并排视图' }));

  await user.click(screen.getByRole('button', { name: '复制统一差异' }));

  expect(mockedCopyText).toHaveBeenCalledWith(UNIFIED_TEXT);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('统一差异已复制');

  mockedCopyText.mockResolvedValueOnce({ ok: false, message: '复制失败，请手动复制。' });
  await user.click(screen.getByRole('button', { name: '复制统一差异' }));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制。');
});

test('shows an accessible loading state and cancels explicitly without losing source text', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);

  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const cancel = latestCancel();

  expect(screen.getByRole('status')).toHaveTextContent('正在比较文本');
  expect(screen.getByRole('button', { name: '比较文本' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '取消比较' }));

  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByLabelText('原始文本')).toHaveValue('Hello\nworld');
  expect(screen.getByLabelText('修改后文本')).toHaveValue('Hello\nCodex');
});

test('preserves both sources and clears the loading state when the Worker reports an error', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await user.clear(screen.getByLabelText('原始文本'));
  await user.type(screen.getByLabelText('原始文本'), 'private draft');
  await user.clear(screen.getByLabelText('修改后文本'));
  await user.type(screen.getByLabelText('修改后文本'), 'revised draft');
  await user.click(screen.getByRole('button', { name: '比较文本' }));

  act(() => latestHandlers().onError('文本差异过于复杂，请缩小输入后重试。'));

  expect(screen.getByRole('alert')).toHaveTextContent('文本差异过于复杂，请缩小输入后重试。');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByLabelText('原始文本')).toHaveValue('private draft');
  expect(screen.getByLabelText('修改后文本')).toHaveValue('revised draft');
});

test('synchronously clears a prior result and cancels its active replacement job on input and option changes', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await compareAndReturn();
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const cancelFromReplacement = latestCancel();

  fireEvent.change(screen.getByLabelText('原始文本'), { target: { value: 'changed now' } });

  expect(cancelFromReplacement).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('差异摘要')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const cancelFromNextJob = latestCancel();
  fireEvent.click(screen.getByRole('checkbox', { name: '忽略行尾空白' }));
  expect(cancelFromNextJob).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('差异摘要')).not.toBeInTheDocument();
});

test('ignores saved stale success and error callbacks after an input change and a newer result', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);

  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const oldHandlers = latestHandlers();
  fireEvent.change(screen.getByLabelText('修改后文本'), { target: { value: 'current' } });
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const currentHandlers = latestHandlers();

  act(() => currentHandlers.onResult(RESULT));
  act(() => oldHandlers.onError('stale error'));
  act(() => oldHandlers.onResult({ ...RESULT, unifiedText: 'stale patch' }));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '复制统一差异' }));
  expect(mockedCopyText).toHaveBeenCalledWith(UNIFIED_TEXT);
});

test('keeps an accepted result when the same job later calls its error handler', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const handlers = latestHandlers();

  act(() => {
    handlers.onResult(RESULT);
    handlers.onError('late error from completed job');
  });

  expect(screen.getByLabelText('差异摘要')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('keeps an accepted error when the same job later calls its result handler', async () => {
  const user = userEvent.setup();
  render(<DiffTool />);
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const handlers = latestHandlers();

  act(() => {
    handlers.onError('first terminal error');
    handlers.onResult(RESULT);
  });

  expect(screen.getByRole('alert')).toHaveTextContent('first terminal error');
  expect(screen.queryByLabelText('差异摘要')).not.toBeInTheDocument();
});

test('handles a synchronous startup error without retaining a phantom loading or cancel state', async () => {
  const user = userEvent.setup();
  mockedStartDiffJob.mockImplementationOnce((_request, handlers) => {
    handlers.onError('本地文本对比失败，请重试。');
    return { cancel: vi.fn() };
  });
  render(<DiffTool />);

  await user.click(screen.getByRole('button', { name: '比较文本' }));

  expect(screen.getByRole('alert')).toHaveTextContent('本地文本对比失败，请重试。');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '取消比较' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '比较文本' })).toBeEnabled();
});

test('cancels on unmount and makes both saved completion paths inert', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<DiffTool />);
  await user.click(screen.getByRole('button', { name: '比较文本' }));
  const handlers = latestHandlers();
  const cancel = latestCancel();

  unmount();
  act(() => handlers.onResult(RESULT));
  act(() => handlers.onError('late error'));

  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('差异摘要')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
