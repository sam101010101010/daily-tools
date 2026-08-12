import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { copyText } from '../../lib/copy';
import * as yamlCore from './yaml';
import YamlTool from './YamlTool';

vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));

const mockedCopyText = vi.mocked(copyText);

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

test('starts with a safe public YAML example and exposes the format workflow without processing', () => {
  const process = vi.spyOn(yamlCore, 'processYaml');
  const localStorageGet = vi.spyOn(Storage.prototype, 'getItem');
  const localStorageSet = vi.spyOn(Storage.prototype, 'setItem');
  const sessionStorageGet = vi.spyOn(Storage.prototype, 'getItem');
  const sessionStorageSet = vi.spyOn(Storage.prototype, 'setItem');
  const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set');

  render(<YamlTool />);

  expect(screen.getByLabelText('处理方式')).toHaveValue('format-yaml');
  expect(screen.getByLabelText('YAML 输入')).toHaveValue(
    'service:\n  name: example-api\n  enabled: true\n',
  );
  expect(screen.getByLabelText('格式化后的 YAML')).toHaveValue('');
  expect(screen.getByRole('button', { name: '格式化 YAML' })).toBeInTheDocument();
  expect(screen.getByText('所有内容仅在当前浏览器本地处理，不会上传。')).toBeInTheDocument();
  expect(process).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorageGet).not.toHaveBeenCalled();
  expect(localStorageSet).not.toHaveBeenCalled();
  expect(sessionStorageGet).not.toHaveBeenCalled();
  expect(sessionStorageSet).not.toHaveBeenCalled();
  expect(cookieSetter).not.toHaveBeenCalled();
});

test.each([
  {
    mode: 'format-yaml',
    sourceLabel: 'YAML 输入',
    outputLabel: '格式化后的 YAML',
    action: '格式化 YAML',
    input: 'name: api\n',
    output: 'name: api\n',
  },
  {
    mode: 'yaml-to-json',
    sourceLabel: 'YAML 输入',
    outputLabel: 'JSON 输出',
    action: '转换为 JSON',
    input: 'name: api\n',
    output: '{\n  "name": "api"\n}\n',
  },
  {
    mode: 'json-to-yaml',
    sourceLabel: 'JSON 输入',
    outputLabel: 'YAML 输出',
    action: '转换为 YAML',
    input: '{"name":"api"}',
    output: 'name: api\n',
  },
])('processes $mode only when its explicit action is pressed', async ({
  mode, sourceLabel, outputLabel, action, input, output,
}) => {
  const user = userEvent.setup();
  const process = vi.spyOn(yamlCore, 'processYaml');
  render(<YamlTool />);

  await user.selectOptions(screen.getByLabelText('处理方式'), mode);
  const source = screen.getByLabelText(sourceLabel);
  await user.clear(source);
  fireEvent.change(source, { target: { value: input } });

  expect(screen.getByLabelText(outputLabel)).toHaveValue('');
  expect(process).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: action }));

  expect(process).toHaveBeenCalledOnce();
  expect(screen.getByLabelText(outputLabel)).toHaveValue(output);
  expect(screen.getByText('处理完成')).toBeInTheDocument();
});

test('clears stale output, warnings, diagnostics and copy status synchronously when source or mode changes', async () => {
  const user = userEvent.setup();
  render(<YamlTool />);
  await user.selectOptions(screen.getByLabelText('处理方式'), 'yaml-to-json');
  const source = screen.getByLabelText('YAML 输入');
  await user.clear(source);
  await user.type(source, '# note\nname: api\n');
  await user.click(screen.getByRole('button', { name: '转换为 JSON' }));
  await user.click(screen.getByRole('button', { name: '复制输出' }));

  expect(screen.getByLabelText('JSON 输出')).not.toHaveValue('');
  expect(screen.getByText('YAML 转换为 JSON 会省略注释、锚点和标量样式。')).toBeInTheDocument();
  expect(screen.getByText('已复制输出')).toBeInTheDocument();

  fireEvent.change(source, { target: { value: 'name: changed\n' } });

  expect(screen.getByLabelText('JSON 输出')).toHaveValue('');
  expect(screen.queryByText('YAML 转换为 JSON 会省略注释、锚点和标量样式。')).not.toBeInTheDocument();
  expect(screen.queryByText('已复制输出')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '转换为 JSON' }));
  await user.selectOptions(screen.getByLabelText('处理方式'), 'json-to-yaml');

  expect(screen.getByLabelText('JSON 输入')).toHaveValue('name: changed\n');
  expect(screen.getByLabelText('YAML 输出')).toHaveValue('');
  expect(screen.queryByText('处理完成')).not.toBeInTheDocument();
});

test('keeps invalid JSON source and presents its accessible line and column diagnostic', async () => {
  const user = userEvent.setup();
  render(<YamlTool />);
  await user.selectOptions(screen.getByLabelText('处理方式'), 'json-to-yaml');
  const source = screen.getByLabelText('JSON 输入');
  await user.clear(source);
  fireEvent.change(source, { target: { value: '{"value": NaN,}' } });
  await user.click(screen.getByRole('button', { name: '转换为 YAML' }));

  expect(source).toHaveValue('{"value": NaN,}');
  expect(screen.getByRole('alert')).toHaveTextContent('请输入有效的 JSON。');
  expect(screen.getByText('第 1 行，第 11 列')).toBeInTheDocument();
  expect(screen.getByLabelText('YAML 输出')).toHaveValue('');

  fireEvent.change(source, { target: { value: '{"value": 1}' } });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('第 1 行，第 11 列')).not.toBeInTheDocument();
});

test('copies successful current output and announces clipboard success or failure', async () => {
  const user = userEvent.setup();
  render(<YamlTool />);
  await user.click(screen.getByRole('button', { name: '格式化 YAML' }));
  const output = screen.getByLabelText('格式化后的 YAML') as HTMLTextAreaElement;

  await user.click(screen.getByRole('button', { name: '复制输出' }));

  expect(mockedCopyText).toHaveBeenCalledWith(output.value);
  expect(screen.getByText('已复制输出')).toBeInTheDocument();

  mockedCopyText.mockResolvedValueOnce({ ok: false, message: '复制失败，请手动复制。' });
  await user.click(screen.getByRole('button', { name: '复制输出' }));

  expect(screen.getByRole('alert')).toHaveTextContent('复制失败，请手动复制。');
  expect(screen.queryByText('已复制输出')).not.toBeInTheDocument();
});

test.each([
  ['yaml-to-json', 'name: api\n', '转换为 JSON', '下载 JSON', 'daily-tools-yaml-output.json', 'application/json;charset=utf-8'],
  ['format-yaml', 'name: api\n', '格式化 YAML', '下载 YAML', 'daily-tools-yaml-output.yaml', 'application/yaml;charset=utf-8'],
  ['json-to-yaml', '{"name":"api"}', '转换为 YAML', '下载 YAML', 'daily-tools-yaml-output.yaml', 'application/yaml;charset=utf-8'],
] as const)('downloads successful %s output with a fixed UTF-8 filename and promptly revokes its object URL', async (
  mode, input, action, downloadLabel, filename, mimeType,
) => {
  vi.useFakeTimers();
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:yaml-output');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const clicks: Array<{ href: string; download: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
  render(<YamlTool />);
  fireEvent.change(screen.getByLabelText('处理方式'), { target: { value: mode } });
  fireEvent.change(screen.getByLabelText(mode === 'json-to-yaml' ? 'JSON 输入' : 'YAML 输入'), {
    target: { value: input },
  });
  fireEvent.click(screen.getByRole('button', { name: action }));
  fireEvent.click(screen.getByRole('button', { name: downloadLabel }));

  expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: mimeType }));
  expect(clicks).toEqual([{ href: 'blob:yaml-output', download: filename }]);
  expect(revokeObjectUrl).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:yaml-output');
});

test('reclaims a deferred output download on unmount', async () => {
  vi.useFakeTimers();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:outstanding-yaml');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const { unmount } = render(<YamlTool />);

  fireEvent.click(screen.getByRole('button', { name: '格式化 YAML' }));
  fireEvent.click(screen.getByRole('button', { name: '下载 YAML' }));
  unmount();

  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:outstanding-yaml');
});
