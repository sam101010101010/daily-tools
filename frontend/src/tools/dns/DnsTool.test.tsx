import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import DnsTool from './DnsTool';

vi.mock('../../lib/api', () => ({
  callTool: vi.fn(async () => ({ ok: true, data: { domain: 'example.com', records: { A: ['1.2.3.4'], MX: ['10 mail.example.com'] } } })),
}));
afterEach(() => vi.clearAllMocks());

test('shows resolved records', async () => {
  render(<DnsTool />);
  await userEvent.type(screen.getByLabelText(/domain/i), 'example.com');
  await userEvent.click(screen.getByRole('button', { name: /查询/ }));
  expect(await screen.findByText('1.2.3.4')).toBeInTheDocument();
  expect(screen.getByText(/10 mail.example.com/)).toBeInTheDocument();
});
