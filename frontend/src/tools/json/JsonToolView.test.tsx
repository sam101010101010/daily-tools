import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import JsonTool from './JsonToolView';

const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('renders the input pane', () => {
  render(<JsonTool />);
  expect(screen.getByLabelText('json 输入')).toBeInTheDocument();
});

test('formats valid json in the text view and reports stats', () => {
  render(<JsonTool />);
  set('json 输入', '{"b":1,"a":2}');
  expect(screen.getByLabelText('json 输出').textContent).toContain('"b": 1');
  expect(screen.getByText(/节点/)).toBeInTheDocument();
});

test('sort keys reorders object keys in the output', async () => {
  const user = userEvent.setup();
  render(<JsonTool />);
  set('json 输入', '{"b":1,"a":2}');
  await user.click(screen.getByRole('button', { name: '排序键' }));
  const t = screen.getByLabelText('json 输出').textContent!;
  expect(t.indexOf('"a"')).toBeLessThan(t.indexOf('"b"'));
});

test('compact toggles minified output', async () => {
  const user = userEvent.setup();
  render(<JsonTool />);
  set('json 输入', '{"a":1}');
  await user.click(screen.getByRole('button', { name: '紧凑' }));
  expect(screen.getByLabelText('json 输出').textContent).toBe('{"a":1}');
});

test('invalid json shows an error alert', () => {
  render(<JsonTool />);
  set('json 输入', '{bad}');
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('tree view renders keys', async () => {
  const user = userEvent.setup();
  render(<JsonTool />);
  set('json 输入', '{"hello":1}');
  await user.click(screen.getByRole('button', { name: '树' }));
  expect(screen.getByText('hello')).toBeInTheDocument();
});

test('table view renders an array of objects', async () => {
  const user = userEvent.setup();
  render(<JsonTool />);
  set('json 输入', '[{"x":1}]');
  await user.click(screen.getByRole('button', { name: '表格' }));
  expect(screen.getByRole('columnheader', { name: 'x' })).toBeInTheDocument();
});

test('jsonpath filters the output', () => {
  render(<JsonTool />);
  set('json 输入', '{"a":{"b":42}}');
  fireEvent.change(screen.getByLabelText('JSONPath'), { target: { value: '$.a.b' } });
  expect(screen.getByLabelText('json 输出').textContent).toContain('42');
});

test('diff mode reveals a second input and shows the difference', () => {
  render(<JsonTool />);
  set('json 输入', '{"a":1}');
  fireEvent.click(screen.getByRole('button', { name: 'Diff' }));
  set('json 输入 B', '{"a":2}');
  expect(screen.getByText('$.a')).toBeInTheDocument();
  expect(screen.getByText(/1 → 2/)).toBeInTheDocument();
});
