import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { copyText } from '../../lib/copy';
import type { TabularErrorCode, TabularRequest, TabularResult } from './csv.worker';
import { startTabularJob, type TabularJobHandlers } from './csvWorkerClient';
import CsvTool from './CsvTool';

vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));
vi.mock('./csvWorkerClient', () => ({ startTabularJob: vi.fn() }));

const mockedCopyText = vi.mocked(copyText);
const mockedStartTabularJob = vi.mocked(startTabularJob);

type CapturedJob = {
  request: TabularRequest;
  handlers: TabularJobHandlers;
  cancel: ReturnType<typeof vi.fn>;
};

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

function success(overrides: Partial<Extract<TabularResult, { kind: 'success' }>> = {}) {
  return {
    kind: 'success' as const,
    headers: ['id', 'name'],
    rows: [['001', 'Ada'], ['002', '小明']],
    output: '[\n  {\n    "id": "001",\n    "name": "Ada"\n  }\n]\n',
    rowCount: 2,
    columnCount: 2,
    warnings: [],
    ...overrides,
  };
}

function captureJobs(): CapturedJob[] {
  const jobs: CapturedJob[] = [];
  mockedStartTabularJob.mockImplementation((request, handlers) => {
    const job = { request, handlers, cancel: vi.fn() };
    jobs.push(job);
    return { cancel: job.cancel };
  });
  return jobs;
}

function completeLatest(jobs: CapturedJob[], result: TabularResult = success()) {
  act(() => { jobs.at(-1)?.handlers.onResult(result); });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  mockedCopyText.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('starts with the local CSV example and creates no side effects before an explicit conversion', () => {
  const localStorageGet = vi.spyOn(Storage.prototype, 'getItem');
  const localStorageSet = vi.spyOn(Storage.prototype, 'setItem');
  const sessionStorageGet = vi.spyOn(Storage.prototype, 'getItem');
  const sessionStorageSet = vi.spyOn(Storage.prototype, 'setItem');
  const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set');
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');

  render(<CsvTool />);

  expect(screen.getByLabelText('处理方式')).toHaveValue('csv-to-json');
  expect(screen.getByLabelText('CSV/TSV 输入')).toHaveValue('id,name,active\n001,Ada,true\n002,小明,false\n');
  expect(screen.getByLabelText('JSON 输出')).toHaveValue('');
  expect(screen.getByLabelText('分隔符')).toHaveValue(',');
  expect(screen.getByLabelText('首行作为表头')).toBeChecked();
  expect(screen.getByLabelText('电子表格安全导出（会添加单引号）')).not.toBeChecked();
  expect(screen.getByText('所有内容仅在当前浏览器本地处理，不会上传。')).toBeInTheDocument();
  expect(screen.getByText('CSV 单元格始终按字符串处理。')).toBeInTheDocument();
  expect(mockedStartTabularJob).not.toHaveBeenCalled();
  expect(mockedCopyText).not.toHaveBeenCalled();
  expect(createObjectUrl).not.toHaveBeenCalled();
  expect(anchorClick).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorageGet).not.toHaveBeenCalled();
  expect(localStorageSet).not.toHaveBeenCalled();
  expect(sessionStorageGet).not.toHaveBeenCalled();
  expect(sessionStorageSet).not.toHaveBeenCalled();
  expect(cookieSetter).not.toHaveBeenCalled();
});

test.each([
  [',', '逗号 (,)', 'csv-to-json', true, false],
  ['\t', '制表符 (Tab)', 'csv-to-json', false, false],
  [';', '分号 (;)', 'json-to-csv', true, true],
] as const)('submits the chosen %s delimiter only after conversion in %s mode', async (
  delimiter, delimiterLabel, mode, header, spreadsheetSafe,
) => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.selectOptions(screen.getByLabelText('处理方式'), mode);
  fireEvent.change(screen.getByLabelText(mode === 'csv-to-json' ? 'CSV/TSV 输入' : 'JSON 输入'), {
    target: { value: mode === 'csv-to-json' ? 'id;name\n1;Ada\n' : '[{"id":"1","name":"Ada"}]' },
  });
  await user.selectOptions(screen.getByLabelText('分隔符'), delimiter);
  if (mode === 'csv-to-json') {
    const headerControl = screen.getByLabelText('首行作为表头') as HTMLInputElement;
    if (headerControl.checked !== header) await user.click(headerControl);
  } else if (spreadsheetSafe) {
    await user.click(screen.getByLabelText('电子表格安全导出（会添加单引号）'));
  }

  expect(screen.getByRole('option', { name: delimiterLabel })).toBeInTheDocument();
  expect(jobs).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: '转换' }));

  expect(jobs).toHaveLength(1);
  expect(jobs[0].request).toEqual({
    mode,
    input: mode === 'csv-to-json' ? 'id;name\n1;Ada\n' : '[{"id":"1","name":"Ada"}]',
    delimiter,
    header,
    spreadsheetSafe,
  });
});

test('shows a contained semantic preview of the first 100 rows without changing formula-like cell values', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  const rows = Array.from({ length: 101 }, (_, index) => [`=${index + 1}`, `row-${index + 1}`]);
  completeLatest(jobs, success({ headers: ['formula', 'label'], rows, rowCount: 101, columnCount: 2 }));

  expect(screen.getByLabelText('JSON 输出')).toHaveValue(success().output);
  expect(screen.getByRole('table', { name: '转换结果预览' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(101);
  expect(screen.getByRole('cell', { name: '=1' })).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: '=101' })).not.toBeInTheDocument();
  expect(screen.getByText('仅显示前 100 行，共 101 行。')).toBeInTheDocument();
  expect(screen.getByText('共 101 行，2 列。')).toBeInTheDocument();
});

test('uses stable accessible preview columns for header-free array output', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByLabelText('首行作为表头'));
  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs, success({ headers: [], rows: [['a', 'b']], rowCount: 1, columnCount: 2 }));

  expect(screen.getByRole('columnheader', { name: '第 1 列' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '第 2 列' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'a' })).toBeInTheDocument();
});

test('announces spreadsheet-safe export while preserving original formula-like preview cells', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.selectOptions(screen.getByLabelText('处理方式'), 'json-to-csv');
  await user.click(screen.getByLabelText('电子表格安全导出（会添加单引号）'));
  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs, success({
    headers: ['formula'],
    rows: [['=1+1']],
    output: "formula\r\n'=1+1\r\n",
    rowCount: 1,
    columnCount: 1,
    warnings: ['SPREADSHEET_SAFE_EXPORT_LOSSY'],
  }));

  expect(screen.getByRole('list', { name: '转换提示' })).toHaveTextContent('已启用电子表格安全导出，公式样式单元格会添加单引号。');
  expect(screen.getByRole('cell', { name: '=1+1' })).toBeInTheDocument();
  expect(screen.getByLabelText('CSV/TSV 输出')).toHaveValue("formula\n'=1+1\n");
});

test('maps worker failures to a safe row and column diagnostic without retaining prior output', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.click(screen.getByRole('button', { name: '转换' }));
  act(() => { jobs[1].handlers.onResult({ kind: 'failure', code: 'CSV_DUPLICATE_HEADER', row: 1, column: 2 }); });

  expect(screen.getByRole('alert')).toHaveTextContent('CSV 表头不能重复。第 1 行，第 2 列');
  expect(screen.getByLabelText('JSON 输出')).toHaveValue('');
  expect(screen.queryByRole('table', { name: '转换结果预览' })).not.toBeInTheDocument();
});

test('cancels immediately and ignores late worker results when a source or option changes', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  expect(screen.getByRole('button', { name: '取消转换' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '转换' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('CSV/TSV 输入'), { target: { value: 'changed\n' } });
  expect(jobs[0].cancel).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: '取消转换' })).not.toBeInTheDocument();
  act(() => { jobs[0].handlers.onResult(success()); });
  expect(screen.getByLabelText('JSON 输出')).toHaveValue('');

  await user.click(screen.getByRole('button', { name: '转换' }));
  await user.selectOptions(screen.getByLabelText('分隔符'), ';');
  expect(jobs[1].cancel).toHaveBeenCalledOnce();
  act(() => { jobs[1].handlers.onError('CSV_INVALID_SYNTAX'); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('clears output synchronously for header, mode and spreadsheet-safe changes', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.click(screen.getByLabelText('首行作为表头'));
  expect(screen.getByLabelText('JSON 输出')).toHaveValue('');

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.selectOptions(screen.getByLabelText('处理方式'), 'json-to-csv');
  expect(screen.getByLabelText('CSV/TSV 输出')).toHaveValue('');

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs, success({ output: 'id,name\r\n001,Ada\r\n' }));
  await user.click(screen.getByLabelText('电子表格安全导出（会添加单引号）'));
  expect(screen.getByLabelText('CSV/TSV 输出')).toHaveValue('');
});

test('cancels an active job exactly once on cancel and unmount, while late callbacks remain inert', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  const { unmount } = render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  await user.click(screen.getByRole('button', { name: '取消转换' }));
  expect(jobs[0].cancel).toHaveBeenCalledOnce();
  act(() => { jobs[0].handlers.onError('CSV_INVALID_SYNTAX'); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '转换' }));
  unmount();
  expect(jobs[1].cancel).toHaveBeenCalledOnce();
  act(() => { jobs[1].handlers.onResult(success()); });
});

test('puts output back into the opposite input mode without starting another conversion', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.click(screen.getByRole('button', { name: '用输出作为输入' }));

  expect(screen.getByLabelText('处理方式')).toHaveValue('json-to-csv');
  expect(screen.getByLabelText('JSON 输入')).toHaveValue(success().output);
  expect(screen.getByLabelText('CSV/TSV 输出')).toHaveValue('');
  expect(jobs).toHaveLength(1);
});

test('keeps only the newest copy completion and clears it after input changes', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  let resolveFirst!: (result: { ok: true }) => void;
  let resolveSecond!: (result: { ok: false; message: string }) => void;
  mockedCopyText
    .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve; }));
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.click(screen.getByRole('button', { name: '复制输出' }));
  await user.click(screen.getByRole('button', { name: '复制输出' }));
  await act(async () => { resolveSecond({ ok: false, message: '复制失败，请手动复制。' }); });
  await act(async () => { resolveFirst({ ok: true }); });
  expect(screen.getByRole('alert')).toHaveTextContent('复制失败，请手动复制。');

  fireEvent.change(screen.getByLabelText('CSV/TSV 输入'), { target: { value: 'new\n' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('已复制输出')).not.toBeInTheDocument();
});

test('ignores a retained copy completion after unmount', async () => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  let resolveCopy!: (result: { ok: true }) => void;
  const pendingCopy = new Promise<{ ok: true }>(resolve => { resolveCopy = resolve; });
  const readOk = vi.fn(() => true);
  const copyResult = Object.defineProperty({}, 'ok', { get: readOk }) as { ok: true };
  mockedCopyText.mockReturnValueOnce(pendingCopy);
  const { unmount } = render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  await user.click(screen.getByRole('button', { name: '复制输出' }));
  unmount();
  await act(async () => { resolveCopy(copyResult); });

  expect(readOk).not.toHaveBeenCalled();
});

test.each([
  ['csv-to-json', '下载 JSON', 'daily-tools-csv-output.json', 'application/json;charset=utf-8'],
  ['json-to-csv', '下载 CSV', 'daily-tools-csv-output.csv', 'text/csv;charset=utf-8'],
] as const)('downloads only current %s success output and promptly reclaims the URL', async (
  mode, label, filename, mimeType,
) => {
  vi.useFakeTimers();
  const jobs = captureJobs();
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv-output');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const clicks: Array<{ href: string; download: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download });
  });
  render(<CsvTool />);

  fireEvent.change(screen.getByLabelText('处理方式'), { target: { value: mode } });
  fireEvent.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs, success({ output: mode === 'csv-to-json' ? '{"id":"1"}\n' : 'id,name\r\n1,Ada\r\n' }));
  fireEvent.click(screen.getByRole('button', { name: label }));

  expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: mimeType }));
  const blobText = readBlobText(createObjectUrl.mock.calls[0][0] as Blob);
  expect(clicks).toEqual([{ href: 'blob:csv-output', download: filename }]);
  expect(revokeObjectUrl).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  await expect(blobText).resolves.toBe(mode === 'csv-to-json' ? '{"id":"1"}\n' : 'id,name\r\n1,Ada\r\n');
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:csv-output');
});

test('reclaims an object URL after a download click failure and on unmount', async () => {
  vi.useFakeTimers();
  const jobs = captureJobs();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv-output');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('click failed'); });
  const { unmount } = render(<CsvTool />);

  fireEvent.click(screen.getByRole('button', { name: '转换' }));
  completeLatest(jobs);
  fireEvent.click(screen.getByRole('button', { name: '下载 JSON' }));
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:csv-output');

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  fireEvent.click(screen.getByRole('button', { name: '下载 JSON' }));
  unmount();
  expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
});

test.each([
  ['TABULAR_EMPTY_INPUT', '请输入要转换的内容。'],
  ['TABULAR_INPUT_TOO_LARGE', '输入内容超过 5 MB 限制。'],
  ['TABULAR_TOO_MANY_ROWS', '数据行数超过 100,000 行限制。'],
  ['TABULAR_ENGINE_FAILED', '转换引擎暂时不可用，请重试。'],
  ['CSV_INVALID_SYNTAX', 'CSV/TSV 格式无效。'],
  ['CSV_BLANK_HEADER', 'CSV 表头不能为空。'],
  ['CSV_DUPLICATE_HEADER', 'CSV 表头不能重复。'],
  ['CSV_EXTRA_CELL', 'CSV 数据行包含多余单元格。'],
  ['JSON_INVALID_INPUT', '请输入有效的 JSON 数组。'],
  ['JSON_EMPTY_ARRAY', 'JSON 数组不能为空。'],
  ['JSON_MIXED_ROW_TYPES', 'JSON 数组中的行类型必须一致。'],
  ['JSON_INCONSISTENT_KEYS', 'JSON 对象行的字段必须一致。'],
  ['JSON_INCONSISTENT_WIDTH', 'JSON 数组行的列数必须一致。'],
  ['JSON_NESTED_VALUE', 'JSON 单元格只支持字符串、数字、布尔值或 null。'],
] as const)('presents a stable diagnostic for %s', async (code: TabularErrorCode, message) => {
  const user = userEvent.setup();
  const jobs = captureJobs();
  render(<CsvTool />);

  await user.click(screen.getByRole('button', { name: '转换' }));
  act(() => { jobs[0].handlers.onError(code); });

  expect(screen.getByRole('alert')).toHaveTextContent(message);
});
