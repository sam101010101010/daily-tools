import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import DiffView from './DiffView';

test('shows changed and added entries with their paths', () => {
  render(<DiffView a={{ a: 1, b: 2 }} b={{ a: 1, b: 3, c: 4 }} />);
  expect(screen.getByText('$.b')).toBeInTheDocument();
  expect(screen.getByText('$.c')).toBeInTheDocument();
  expect(screen.getByText(/2 → 3/)).toBeInTheDocument();
});

test('equal inputs report no difference', () => {
  render(<DiffView a={{ a: 1 }} b={{ a: 1 }} />);
  expect(screen.getByText(/相同/)).toBeInTheDocument();
});
