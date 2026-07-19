import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import UrlTool from './UrlTool';

afterEach(() => vi.unstubAllGlobals());

test('pre-fills a public URL component example without a network request', () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  render(<UrlTool />);

  expect(screen.getByLabelText('输入')).toHaveValue('https://example.com/搜索?q=a b+c');
  expect(screen.queryByLabelText('输出')).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('encodes and decodes the editable input as a URL component', async () => {
  const user = userEvent.setup();
  render(<UrlTool />);

  await user.click(screen.getByRole('button', { name: '编码' }));
  expect(screen.getByLabelText('输出')).toHaveTextContent('https%3A%2F%2Fexample.com%2F%E6%90%9C%E7%B4%A2%3Fq%3Da%20b%2Bc');

  await user.clear(screen.getByLabelText('输入'));
  await user.type(screen.getByLabelText('输入'), 'a%2Bb');
  await user.click(screen.getByRole('button', { name: '解码' }));
  expect(screen.getByLabelText('输出')).toHaveTextContent('a+b');
});

test('keeps malformed input and clears a stale result when decoding fails', async () => {
  const user = userEvent.setup();
  render(<UrlTool />);

  await user.click(screen.getByRole('button', { name: '编码' }));
  expect(screen.getByLabelText('输出')).toBeInTheDocument();

  await user.clear(screen.getByLabelText('输入'));
  await user.type(screen.getByLabelText('输入'), '%E0%A4%A');
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByLabelText('输入')).toHaveValue('%E0%A4%A');
  expect(screen.getByRole('alert')).toHaveTextContent('URL 编码格式无效，无法解码');
  expect(screen.queryByLabelText('输出')).not.toBeInTheDocument();
});

test('copies a successful result through the shared clipboard helper', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<UrlTool />);

  await user.click(screen.getByRole('button', { name: '编码' }));
  await user.click(screen.getByRole('button', { name: '复制输出' }));

  expect(writeText).toHaveBeenCalledWith('https%3A%2F%2Fexample.com%2F%E6%90%9C%E7%B4%A2%3Fq%3Da%20b%2Bc');
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
});
