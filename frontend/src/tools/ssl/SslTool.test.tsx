import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import { callTool } from '../../lib/api';
import SslTool from './SslTool';

vi.mock('../../lib/api', () => ({ callTool: vi.fn() }));
const mockedCallTool = vi.mocked(callTool);

afterEach(() => vi.clearAllMocks());

function badReport() {
  return {
    ok: true as const,
    data: {
      host: 'expired.example.com', port: 443, startTls: 'none',
      negotiated: { version: 'TLSv1.2', cipher: 'TLS_AES_128_GCM_SHA256' },
      supportedProtocols: [],
      validation: {
        trusted: false, trustError: '无法建立到受信任根的证书链',
        hostnameMatch: true, matchedName: 'expired.example.com',
        selfSigned: false, expired: true, daysUntilExpiry: -5,
      },
      chain: [],
    },
  };
}

test('renders verdict badges for a bad cert (untrusted + expired, host matches)', async () => {
  mockedCallTool.mockResolvedValue(badReport());
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'expired.example.com');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));

  expect(await screen.findByText(/不受信任/)).toBeInTheDocument();
  expect(screen.getByText(/已过期/)).toBeInTheDocument();
  expect(screen.getByText(/域名匹配/)).toBeInTheDocument();
});

test('a hard failure renders the ErrorView', async () => {
  mockedCallTool.mockResolvedValue({
    ok: false, error: { code: 'SSL_HANDSHAKE_FAILED', message: '无法连接或握手失败' },
  });
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'nope.invalid');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/SSL_HANDSHAKE_FAILED/);
});

test('sends the selected STARTTLS mode in the request body', async () => {
  mockedCallTool.mockResolvedValue(badReport());
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'mail.example.com');
  await userEvent.selectOptions(screen.getByLabelText(/starttls/i), 'smtp');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));

  expect(mockedCallTool).toHaveBeenCalledWith(
    '/api/java/ssl',
    expect.objectContaining({ startTls: 'smtp' }),
  );
});
