import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import JsonTable from './JsonTable';

test('renders an array of objects with union columns', () => {
  render(<JsonTable value={[{ a: 1, b: 2 }, { a: 3, c: 4 }]} />);
  expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'b' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'c' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 data rows
  expect(screen.getByText('4')).toBeInTheDocument();
});

test('nested cell values are shown as compact JSON', () => {
  render(<JsonTable value={[{ a: { x: 1 } }]} />);
  expect(screen.getByText('{"x":1}')).toBeInTheDocument();
});

test('non-tabular data shows a fallback message', () => {
  render(<JsonTable value={{ a: 1 }} />);
  expect(screen.getByText(/对象数组/)).toBeInTheDocument();
});

test('an empty array shows a fallback message', () => {
  render(<JsonTable value={[]} />);
  expect(screen.getByText(/对象数组/)).toBeInTheDocument();
});
