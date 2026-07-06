import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import SslTool from './SslTool';

vi.mock('../../lib/api', () => ({
  callTool: vi.fn(async () => ({
    ok: true,
    data: { subject: 'CN=example.com', issuer: 'CN=CA', notBefore: 'x', notAfter: 'y',
            expired: false, daysUntilExpiry: 100, sans: ['example.com'], serialNumber: '1' },
  })),
}));

afterEach(() => vi.clearAllMocks());

test('shows cert info after checking a host', async () => {
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'example.com');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));
  expect(await screen.findByText(/CN=example.com/)).toBeInTheDocument();
  expect(screen.getByText(/100/)).toBeInTheDocument();
});
