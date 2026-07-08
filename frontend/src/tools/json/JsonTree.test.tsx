import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import JsonTree from './JsonTree';

test('renders keys and typed scalar values', () => {
  render(<JsonTree value={{ name: 'ada', age: 36, ok: true, none: null }} />);
  expect(screen.getByText('name')).toBeInTheDocument();
  expect(screen.getByText('"ada"')).toBeInTheDocument();
  expect(screen.getByText('36')).toBeInTheDocument();
  expect(screen.getByText('true')).toBeInTheDocument();
  expect(screen.getByText('null')).toBeInTheDocument();
});

test('is expanded by default so nested values are visible', () => {
  render(<JsonTree value={{ outer: { inner: 1 } }} />);
  expect(screen.getByText('inner')).toBeInTheDocument();
});

test('toggling a node hides its children', async () => {
  const user = userEvent.setup();
  render(<JsonTree value={{ outer: { inner: 1 } }} />);
  const outerToggle = screen.getByText('outer').closest('[role="button"]')!;
  await user.click(outerToggle);
  expect(screen.queryByText('inner')).toBeNull();
});

test('collapse-all then expand-all', async () => {
  const user = userEvent.setup();
  render(<JsonTree value={{ outer: { inner: 1 } }} />);
  await user.click(screen.getByRole('button', { name: /折叠全部/ }));
  expect(screen.queryByText('inner')).toBeNull();
  await user.click(screen.getByRole('button', { name: /展开全部/ }));
  expect(screen.getByText('inner')).toBeInTheDocument();
});
