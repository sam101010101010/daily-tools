import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { copyText } from '../../lib/copy';
import { DEFAULT_REGEXP_REQUEST } from './regexp';
import type { RegexWorkerResult } from './regexp.worker';
import { startRegexJob } from './regexpWorkerClient';
import RegexpTool from './RegexpTool';

vi.mock('./regexpWorkerClient', () => ({ startRegexJob: vi.fn() }));
vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));

const mockedStartRegexJob = vi.mocked(startRegexJob);
const mockedCopyText = vi.mocked(copyText);

type JobHandlers = Parameters<typeof startRegexJob>[1];

function latestHandlers(): JobHandlers {
  return mockedStartRegexJob.mock.calls.at(-1)![1];
}

function runDebounce(milliseconds = 250): void {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function returnResult(result: RegexWorkerResult): void {
  act(() => latestHandlers().onResult(result));
}

const successfulResult: RegexWorkerResult = {
  evaluation: {
    kind: 'success',
    flags: 'g',
    matches: [
      {
        text: '2026-07-22',
        index: 3,
        captures: ['2026', '07', '22'],
        namedCaptures: { year: '2026' },
      },
      {
        text: '2026-08-01',
        index: 18,
        captures: ['2026', '08', '01'],
        namedCaptures: { year: '2026' },
      },
    ],
    truncated: false,
  },
  replacementPreview: {
    kind: 'preview',
    value: '日志：07/22/2026，下一次 08/01/2026',
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  mockedStartRegexJob.mockImplementation(() => vi.fn());
  mockedCopyText.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test('starts with the public date example and stays entirely local through input, flags, worker, and copy', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const cancel = vi.fn();
  mockedStartRegexJob.mockReturnValue(cancel);

  const { unmount } = render(<RegexpTool />);

  expect(screen.getByLabelText('正则表达式')).toHaveValue(DEFAULT_REGEXP_REQUEST.pattern);
  expect(screen.getByLabelText('测试文本')).toHaveValue(DEFAULT_REGEXP_REQUEST.text);
  expect(screen.getByLabelText('替换模板')).toHaveValue(DEFAULT_REGEXP_REQUEST.replacement);
  expect(screen.getByRole('checkbox', { name: 'g' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'i' })).not.toBeChecked();
  expect(mockedStartRegexJob).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('正则表达式'), { target: { value: '\\d+' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'i' }));
  fireEvent.change(screen.getByLabelText('测试文本'), { target: { value: '42' } });
  runDebounce();

  expect(mockedStartRegexJob).toHaveBeenCalledWith(
    { pattern: '\\d+', flags: 'gi', text: '42', replacement: DEFAULT_REGEXP_REQUEST.replacement },
    expect.any(Object),
  );
  returnResult({
    evaluation: {
      kind: 'success',
      flags: 'gi',
      matches: [{ text: '42', index: 0, captures: [], namedCaptures: {} }],
      truncated: false,
    },
    replacementPreview: { kind: 'preview', value: '07/22/$<year>' },
  });

  fireEvent.click(screen.getByRole('button', { name: '复制匹配结果' }));
  await act(async () => undefined);
  expect(mockedCopyText).toHaveBeenCalledOnce();
  expect(fetchSpy).not.toHaveBeenCalled();

  unmount();
  expect(cancel).toHaveBeenCalledOnce();
});

test('debounces pattern, flags, and test text changes for 250 ms before starting a cancellable job', () => {
  render(<RegexpTool />);
  runDebounce();
  const initialCancel = mockedStartRegexJob.mock.results[0].value;
  returnResult(successfulResult);
  mockedStartRegexJob.mockClear();

  fireEvent.change(screen.getByLabelText('正则表达式'), { target: { value: '\\w+' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'g' }));
  fireEvent.change(screen.getByLabelText('测试文本'), { target: { value: 'one two' } });

  expect(initialCancel).toHaveBeenCalledOnce();
  expect(mockedStartRegexJob).not.toHaveBeenCalled();
  expect(screen.queryByText('找到 2 个匹配')).not.toBeInTheDocument();
  runDebounce(249);
  expect(mockedStartRegexJob).not.toHaveBeenCalled();

  runDebounce(1);
  expect(mockedStartRegexJob).toHaveBeenCalledWith(
    {
      pattern: '\\w+',
      flags: '',
      text: 'one two',
      replacement: DEFAULT_REGEXP_REQUEST.replacement,
    },
    expect.any(Object),
  );
  expect(screen.getByRole('status')).toHaveTextContent('正在运行');
});

test('renders match count, safe mark highlights, indices, and numbered and named captures', () => {
  render(<RegexpTool />);
  runDebounce();
  returnResult(successfulResult);

  expect(screen.getByText('找到 2 个匹配')).toBeInTheDocument();
  const highlight = screen.getByLabelText('匹配高亮');
  const marks = highlight.querySelectorAll('mark');
  expect(marks).toHaveLength(2);
  expect([...marks].map((mark) => mark.textContent)).toEqual(['2026-07-22', '2026-08-01']);
  expect(highlight).toHaveTextContent(DEFAULT_REGEXP_REQUEST.text);

  const details = screen.getByLabelText('匹配详情');
  expect(within(details).getAllByText(/完整匹配：/)).toHaveLength(2);
  expect(within(details).getAllByText('索引：3')).toHaveLength(1);
  expect(within(details).getAllByText('索引：18')).toHaveLength(1);
  expect(within(details).getAllByText('捕获组 1')).toHaveLength(2);
  expect(within(details).getAllByText('捕获组 2')).toHaveLength(2);
  expect(within(details).getAllByText('捕获组 3')).toHaveLength(2);
  expect(within(details).getAllByText('命名组 year')).toHaveLength(2);
});

test('clearly reports when no matches are found', () => {
  render(<RegexpTool />);
  runDebounce();
  returnResult({
    evaluation: { kind: 'no-match', flags: 'g', matches: [], truncated: false },
    replacementPreview: { kind: 'no-match' },
  });

  expect(screen.getByText('未找到匹配')).toBeInTheDocument();
  expect(screen.queryByLabelText('匹配详情')).not.toBeInTheDocument();
});

test('renders syntax errors through ErrorView and clears stale results', () => {
  render(<RegexpTool />);
  runDebounce();
  returnResult(successfulResult);
  expect(screen.getByText('找到 2 个匹配')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('正则表达式'), { target: { value: '[' } });
  runDebounce();
  returnResult({
    evaluation: { kind: 'syntax-error', error: '正则语法错误，请检查表达式。' },
    replacementPreview: { kind: 'syntax-error', error: '正则语法错误，请检查表达式。' },
  });

  expect(screen.getByRole('alert')).toHaveTextContent('正则语法错误，请检查表达式。');
  expect(screen.queryByText('找到 2 个匹配')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('匹配高亮')).not.toBeInTheDocument();
});

test.each([
  '正则执行超时，请简化表达式或测试文本',
  '正则执行失败，请重试。',
])('renders Worker failure "%s" through ErrorView without retaining stale results', (message) => {
  render(<RegexpTool />);
  runDebounce();
  returnResult(successfulResult);

  fireEvent.change(screen.getByLabelText('测试文本'), { target: { value: 'new text' } });
  runDebounce();
  act(() => latestHandlers().onError(message));

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText('找到 2 个匹配')).not.toBeInTheDocument();
});

test('shows truncation, renders hostile input literally, and displays the JavaScript replacement preview', () => {
  const hostileText = '<img src=x> 2026-07-22';
  render(<RegexpTool />);
  fireEvent.change(screen.getByLabelText('测试文本'), { target: { value: hostileText } });
  runDebounce();
  returnResult({
    evaluation: {
      kind: 'limit-reached',
      flags: 'g',
      matches: [
        {
          text: '<img src=x>',
          index: 0,
          captures: [null],
          namedCaptures: { unsafe: '<img src=x>' },
        },
      ],
      truncated: true,
    },
    replacementPreview: { kind: 'preview', value: 'safe 2026-07-22' },
  });

  expect(screen.getByText('结果已截断，仅显示前 500 个匹配')).toBeInTheDocument();
  expect(screen.getByLabelText('匹配高亮')).toHaveTextContent(hostileText);
  expect(screen.getByLabelText('匹配高亮').querySelector('img')).toBeNull();
  expect(screen.getByLabelText('匹配详情').querySelector('img')).toBeNull();
  expect(screen.getByLabelText('JavaScript 替换预览')).toHaveTextContent('safe 2026-07-22');
});

test('copies match results and replacement preview through copyText with accessible status', async () => {
  render(<RegexpTool />);
  runDebounce();
  returnResult(successfulResult);

  fireEvent.click(screen.getByRole('button', { name: '复制匹配结果' }));
  await act(async () => undefined);
  expect(mockedCopyText).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('匹配 1：2026-07-22（索引 3）'),
  );
  expect(screen.getByRole('status')).toHaveTextContent('匹配结果已复制');

  fireEvent.click(screen.getByRole('button', { name: '复制替换预览' }));
  await act(async () => undefined);
  expect(mockedCopyText).toHaveBeenNthCalledWith(
    2,
    '日志：07/22/2026，下一次 08/01/2026',
  );
  expect(screen.getByRole('status')).toHaveTextContent('替换预览已复制');
});

test('toggling flags off and back on and editing replacement creates new jobs and cancels each active job', () => {
  render(<RegexpTool />);
  runDebounce();
  const cancelInitial = mockedStartRegexJob.mock.results[0].value;

  fireEvent.click(screen.getByRole('checkbox', { name: 'g' }));
  expect(cancelInitial).toHaveBeenCalledOnce();
  runDebounce();
  const cancelWithoutGlobal = mockedStartRegexJob.mock.results[1].value;
  expect(mockedStartRegexJob.mock.calls[1][0].flags).toBe('');

  fireEvent.click(screen.getByRole('checkbox', { name: 'g' }));
  expect(cancelWithoutGlobal).toHaveBeenCalledOnce();
  runDebounce();
  const cancelRestored = mockedStartRegexJob.mock.results[2].value;
  expect(mockedStartRegexJob.mock.calls[2][0].flags).toBe('g');

  fireEvent.change(screen.getByLabelText('替换模板'), { target: { value: '[$&]' } });
  expect(cancelRestored).toHaveBeenCalledOnce();
  runDebounce();
  expect(mockedStartRegexJob.mock.calls[3][0].replacement).toBe('[$&]');
});
