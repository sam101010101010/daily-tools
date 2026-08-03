import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import TextTool, { DEFAULT_TEXT_INPUT } from './TextTool';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

function stats(prefix: '原始' | '结果') {
  return {
    characters: screen.getByLabelText(`${prefix}字符数`),
    words: screen.getByLabelText(`${prefix}词数`),
    lines: screen.getByLabelText(`${prefix}行数`),
    bytes: screen.getByLabelText(`${prefix}字节数`),
  };
}

async function replaceInput(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByRole('textbox', { name: '原始文本' });
  await user.clear(input);
  if (value) await user.type(input, value);
}

test('starts with the approved public multiline sample, uppercase selected, and original statistics', () => {
  render(<TextTool />);

  expect(DEFAULT_TEXT_INPUT).toBe('  Hello World  \nhello world\n重复行\n重复行\n\n  中文 😀  ');
  expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue(DEFAULT_TEXT_INPUT);
  expect(screen.getByRole('combobox', { name: '处理操作' })).toHaveValue('uppercase');
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveAttribute('readonly');
  expect(stats('原始').characters).toHaveTextContent('45');
  expect(stats('原始').words).toHaveTextContent('8');
  expect(stats('原始').lines).toHaveTextContent('6');
  expect(stats('原始').bytes).toHaveTextContent('64');
  expect(stats('结果').characters).toHaveTextContent('0');
  expect(screen.getAllByRole('status')).toHaveLength(1);
});

test('offers every fixed operation in its text, whitespace, and line-order groups', () => {
  render(<TextTool />);

  expect(screen.getByRole('group', { name: '文本大小写' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '空白与行' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '行顺序' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '转为大写' })).toHaveValue('uppercase');
  expect(screen.getByRole('option', { name: '转为小写' })).toHaveValue('lowercase');
  expect(screen.getByRole('option', { name: '去除首尾空白' })).toHaveValue('trim');
  expect(screen.getByRole('option', { name: '去除每行首尾空白' })).toHaveValue('trim-lines');
  expect(screen.getByRole('option', { name: '合并横向空白' })).toHaveValue('collapse-horizontal-whitespace');
  expect(screen.getByRole('option', { name: '删除空白行' })).toHaveValue('remove-blank-lines');
  expect(screen.getByRole('option', { name: '按升序排序行' })).toHaveValue('sort-ascending');
  expect(screen.getByRole('option', { name: '按降序排序行' })).toHaveValue('sort-descending');
  expect(screen.getByRole('option', { name: '反转行顺序' })).toHaveValue('reverse-lines');
  expect(screen.getByRole('option', { name: '去重行' })).toHaveValue('dedupe-lines');
});

test.each([
  ['uppercase', 'a\nb', 'A\nB'],
  ['trim-lines', ' a \n b ', 'a\nb'],
  ['sort-descending', 'a\nc\nb', 'c\nb\na'],
])('only updates the result after explicit processing for the selected %s operation', async (operation, input, output) => {
  const user = userEvent.setup();
  render(<TextTool />);

  await replaceInput(user, input);
  await user.selectOptions(screen.getByRole('combobox', { name: '处理操作' }), operation);
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');

  await user.click(screen.getByRole('button', { name: '处理' }));

  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue(output);
  expect(screen.getByRole('status')).toHaveTextContent('处理完成');
});

test('keeps the last processed result and its statistics until processing is explicitly requested again', async () => {
  const user = userEvent.setup();
  render(<TextTool />);

  await replaceInput(user, ' a ');
  await user.click(screen.getByRole('button', { name: '处理' }));
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue(' A ');
  expect(stats('结果').characters).toHaveTextContent('3');
  expect(stats('结果').words).toHaveTextContent('1');
  expect(stats('结果').lines).toHaveTextContent('1');
  expect(stats('结果').bytes).toHaveTextContent('3');

  await replaceInput(user, 'different source');
  await user.selectOptions(screen.getByRole('combobox', { name: '处理操作' }), 'lowercase');

  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue(' A ');
  expect(stats('结果').characters).toHaveTextContent('3');
  expect(stats('结果').words).toHaveTextContent('1');
  expect(stats('结果').lines).toHaveTextContent('1');
  expect(stats('结果').bytes).toHaveTextContent('3');
});

test('processes empty and CRLF input deterministically while retaining or removing a trailing newline by operation semantics', async () => {
  const user = userEvent.setup();
  render(<TextTool />);

  fireEvent.change(screen.getByRole('textbox', { name: '原始文本' }), { target: { value: 'b\r\na\r\n' } });
  await user.selectOptions(screen.getByRole('combobox', { name: '处理操作' }), 'sort-ascending');
  await user.click(screen.getByRole('button', { name: '处理' }));
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('\na\nb');

  fireEvent.change(screen.getByRole('textbox', { name: '原始文本' }), { target: { value: '  hello  \r\n' } });
  await user.selectOptions(screen.getByRole('combobox', { name: '处理操作' }), 'trim');
  await user.click(screen.getByRole('button', { name: '处理' }));
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('hello');

  await replaceInput(user, '');
  await user.click(screen.getByRole('button', { name: '处理' }));
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('处理完成');
});

test('shows result statistics and keeps an unchanged no-op result visible without errors', async () => {
  const user = userEvent.setup();
  render(<TextTool />);

  await replaceInput(user, 'ABC');
  await user.click(screen.getByRole('button', { name: '处理' }));

  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('ABC');
  expect(stats('结果').characters).toHaveTextContent('3');
  expect(stats('结果').words).toHaveTextContent('1');
  expect(stats('结果').lines).toHaveTextContent('1');
  expect(stats('结果').bytes).toHaveTextContent('3');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('uses the processed result as new input only when explicitly requested, then resets the whole form', async () => {
  const user = userEvent.setup();
  render(<TextTool />);

  await replaceInput(user, ' hello ');
  await user.selectOptions(screen.getByRole('combobox', { name: '处理操作' }), 'trim');
  await user.click(screen.getByRole('button', { name: '处理' }));
  await user.click(screen.getByRole('button', { name: '结果作为输入' }));

  expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue('hello');
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('结果已作为输入');

  await user.click(screen.getByRole('button', { name: '重置' }));
  expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue(DEFAULT_TEXT_INPUT);
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: '处理操作' })).toHaveValue('uppercase');
  expect(screen.getByRole('status')).toHaveTextContent('已重置');
});

test('keeps plain Enter available for multiline input, processes with Ctrl+Enter, copies the result through the shared status region, and never fetches or uses storage', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const fetchSpy = vi.fn();
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
  const clearSpy = vi.spyOn(Storage.prototype, 'clear');
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<TextTool />);

  await replaceInput(user, 'hello');
  await user.keyboard('{Enter}');
  expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue('hello\n');
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('');
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('HELLO\n');

  await user.click(screen.getByRole('button', { name: '复制结果' }));
  expect(writeText).toHaveBeenCalledWith('HELLO\n');
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('已复制结果');
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(getItemSpy).not.toHaveBeenCalled();
  expect(setItemSpy).not.toHaveBeenCalled();
  expect(removeItemSpy).not.toHaveBeenCalled();
  expect(clearSpy).not.toHaveBeenCalled();
});
