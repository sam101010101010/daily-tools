import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { copyText } from '../../lib/copy';
import { startHashJob } from './hashWorkerClient';
import HashTool from './HashTool';

vi.mock('./hashWorkerClient', () => ({ startHashJob: vi.fn() }));
vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));

const mockedStartHashJob = vi.mocked(startHashJob);
const mockedCopyText = vi.mocked(copyText);
const SHA256 = 'a'.repeat(64);

type JobHandlers = Parameters<typeof startHashJob>[1];

function latestHandlers(): JobHandlers {
  return mockedStartHashJob.mock.calls.at(-1)![1];
}

function latestCancel(): ReturnType<typeof startHashJob> {
  return mockedStartHashJob.mock.results.at(-1)!.value;
}

beforeEach(() => {
  mockedStartHashJob.mockImplementation(() => vi.fn());
  mockedCopyText.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test('pre-fills a safe text example and calculates locally without fetching', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  render(<HashTool />);

  expect(screen.getByLabelText('输入来源')).toHaveValue('text');
  expect(screen.getByLabelText('文本内容')).toHaveValue('hello world');
  expect(screen.getByLabelText('哈希算法')).toHaveValue('sha256');
  expect(screen.getByText('文件仅在当前浏览器本地读取，不会上传')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('lets the user switch between editable text and a local file without fetching', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  render(<HashTool />);

  await user.selectOptions(screen.getByLabelText('输入来源'), 'file');
  const input = screen.getByLabelText('本地文件');
  await user.upload(input, new File(['abc'], 'checksums.txt', { type: 'text/plain' }));

  expect(screen.getByText(/checksums\.txt/)).toBeInTheDocument();
  expect(screen.getByText('3.0 B')).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();

  await user.selectOptions(screen.getByLabelText('输入来源'), 'text');
  expect(screen.getByLabelText('文本内容')).toBeEnabled();
});

test('shows the source size, accessible progress, and a cancel button while a job runs', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));

  expect(mockedStartHashJob).toHaveBeenCalledWith(
    expect.objectContaining({ source: { kind: 'text', text: 'hello world' } }),
    expect.any(Object),
  );
  expect(screen.getByText('11.0 B')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('0 B / 11.0 B');
  expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  expect(screen.getByLabelText('输入来源')).toBeDisabled();
  expect(screen.getByLabelText('哈希算法')).toBeDisabled();

  await act(async () => latestHandlers().onProgress({ completedBytes: 5, totalBytes: 11 }));
  expect(screen.getByRole('status')).toHaveTextContent('5.0 B / 11.0 B');
});

test('renders a lowercase digest, supports copying it, and announces copy status', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: SHA256.toUpperCase() }));

  expect(screen.getByLabelText('哈希结果')).toHaveTextContent(SHA256);
  await user.click(screen.getByRole('button', { name: '复制哈希结果' }));
  expect(mockedCopyText).toHaveBeenCalledWith(SHA256);
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
});

test('ignores a stale copy completion after a new digest appears', async () => {
  const user = userEvent.setup();
  let resolveCopy!: (value: { ok: true }) => void;
  mockedCopyText.mockReturnValueOnce(new Promise(resolve => { resolveCopy = resolve; }));
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: SHA256 }));
  await user.click(screen.getByRole('button', { name: '复制哈希结果' }));

  await user.clear(screen.getByLabelText('文本内容'));
  await user.type(screen.getByLabelText('文本内容'), 'replacement');
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: 'b'.repeat(64) }));
  await act(async () => resolveCopy({ ok: true }));

  expect(screen.getByLabelText('哈希结果')).toHaveTextContent('b'.repeat(64));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('cancels the old job when replacing a file', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.selectOptions(screen.getByLabelText('输入来源'), 'file');
  await user.upload(screen.getByLabelText('本地文件'), new File(['one'], 'one.txt'));
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  const cancel = latestCancel();
  await user.upload(screen.getByLabelText('本地文件'), new File(['two'], 'two.txt'));

  expect(cancel).toHaveBeenCalledOnce();
});

test('does not let a replaced file job overwrite the next result', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.selectOptions(screen.getByLabelText('输入来源'), 'file');
  await user.upload(screen.getByLabelText('本地文件'), new File(['one'], 'one.txt'));
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  const oldHandlers = latestHandlers();
  await user.upload(screen.getByLabelText('本地文件'), new File(['two'], 'two.txt'));

  await act(async () => oldHandlers.onSuccess({ algorithm: 'sha256', digest: 'b'.repeat(64) }));

  expect(screen.queryByLabelText('哈希结果')).not.toBeInTheDocument();
  expect(screen.getByText(/two\.txt/)).toBeInTheDocument();
});

test('cancels the old job when the user clicks cancel', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  const cancel = latestCancel();
  await user.click(screen.getByRole('button', { name: '取消' }));

  expect(cancel).toHaveBeenCalledOnce();
});

test('cancels an active job on unmount and ignores its late success callback', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<HashTool />);
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  const handlers = latestHandlers();
  const cancel = latestCancel();

  unmount();
  await act(async () => handlers.onSuccess({ algorithm: 'sha256', digest: SHA256 }));

  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('哈希结果')).not.toBeInTheDocument();
});

test('renders ErrorView when the worker reports an error', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onError('本地哈希计算失败，请重试。'));

  expect(screen.getByRole('alert')).toHaveTextContent('本地哈希计算失败，请重试。');
});

test('recovers from a synchronous worker startup error callback', async () => {
  const user = userEvent.setup();
  mockedStartHashJob.mockImplementationOnce((_request, handlers) => {
    handlers.onError('本地哈希计算失败，请重试。');
    return vi.fn();
  });
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));

  expect(screen.getByRole('alert')).toHaveTextContent('本地哈希计算失败，请重试。');
  expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('输入来源')).toBeEnabled();
  expect(screen.getByLabelText('哈希算法')).toBeEnabled();
});

test.each(['md5', 'sha1'])('warns that %s is legacy in both its option and its result', async (algorithm) => {
  const user = userEvent.setup();
  render(<HashTool />);

  expect(screen.getAllByRole('option', { name: /仅兼容旧校验，不适用于安全用途/ })).toHaveLength(2);
  await user.selectOptions(screen.getByLabelText('哈希算法'), algorithm);
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: algorithm as 'md5' | 'sha1', digest: 'a'.repeat(algorithm === 'md5' ? 32 : 40) }));

  expect(screen.getByText('仅兼容旧校验，不适用于安全用途')).toBeInTheDocument();
});

test('shows no verdict when expected checksum is empty', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: SHA256 }));

  expect(screen.queryByText('匹配')).not.toBeInTheDocument();
  expect(screen.queryByText('不匹配')).not.toBeInTheDocument();
});

test('treats whitespace-only expected checksum as empty', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.type(screen.getByLabelText('预期校验和'), '   ');
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: SHA256 }));

  expect(screen.queryByText('匹配')).not.toBeInTheDocument();
  expect(screen.queryByText('不匹配')).not.toBeInTheDocument();
});

test.each([
  ['matches', `  ${SHA256.toUpperCase()}  `, '匹配'],
  ['detects mismatch', 'b'.repeat(64), '不匹配'],
])('normalizes a valid expected checksum and %s', async (_name, expected, verdict) => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.type(screen.getByLabelText('预期校验和'), expected);
  await user.click(screen.getByRole('button', { name: '计算哈希' }));
  await act(async () => latestHandlers().onSuccess({ algorithm: 'sha256', digest: SHA256 }));

  expect(screen.getByText(verdict)).toBeInTheDocument();
});

test('shows expected checksum validation errors without starting a worker', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.type(screen.getByLabelText('预期校验和'), 'not-a-checksum');
  await user.click(screen.getByRole('button', { name: '计算哈希' }));

  expect(screen.getByRole('alert')).toHaveTextContent('预期校验和必须是十六进制字符');
  expect(mockedStartHashJob).not.toHaveBeenCalled();
});

test('shows expected checksum length errors without starting a worker', async () => {
  const user = userEvent.setup();
  render(<HashTool />);

  await user.type(screen.getByLabelText('预期校验和'), 'a'.repeat(63));
  await user.click(screen.getByRole('button', { name: '计算哈希' }));

  expect(screen.getByRole('alert')).toHaveTextContent('SHA-256 校验和应为 64 个十六进制字符');
  expect(mockedStartHashJob).not.toHaveBeenCalled();
});
