import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import { callTool } from '../../lib/api';
import SslTool from './SslTool';

vi.mock('../../lib/api', () => ({ callTool: vi.fn() }));
const mockedCallTool = vi.mocked(callTool);

afterEach(() => vi.clearAllMocks());

function cert(over: Record<string, unknown> = {}) {
  return {
    subjectCN: 'example.com', subjectO: 'Example Org',
    issuerCN: 'DigiCert', issuerO: 'DigiCert Inc',
    subjectDN: 'CN=example.com,O=Example Org', issuerDN: 'CN=DigiCert',
    notBefore: '2020-01-01T00:00:00Z', notAfter: '2030-01-01T00:00:00Z',
    expired: false, daysUntilExpiry: 1000,
    keyAlgorithm: 'RSA', keySize: 2048,
    signatureAlgorithm: 'SHA256withRSA', weakSignature: false,
    sha256Fingerprint: 'AA:BB:CC', serialNumber: '123',
    sans: ['example.com'],
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      host: 'example.com', port: 443, startTls: 'none',
      negotiated: { version: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384' },
      supportedProtocols: [
        { protocol: 'TLSv1', supported: false, weak: true },
        { protocol: 'TLSv1.1', supported: false, weak: true },
        { protocol: 'TLSv1.2', supported: true, weak: false },
        { protocol: 'TLSv1.3', supported: true, weak: false },
      ],
      validation: {
        trusted: true, trustError: null, hostnameMatch: true, matchedName: 'example.com',
        selfSigned: false, expired: false, daysUntilExpiry: 100,
      },
      chain: [cert()],
      ...over,
    },
  };
}

async function runCheck() {
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'example.com');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));
}

// ---- T8: input + verdict badges ----

test('renders verdict badges for a bad cert (untrusted + expired, host matches)', async () => {
  mockedCallTool.mockResolvedValue(report({
    validation: {
      trusted: false, trustError: '无法建立到受信任根的证书链',
      hostnameMatch: true, matchedName: 'expired.example.com',
      selfSigned: false, expired: true, daysUntilExpiry: -5,
    },
  }));
  await runCheck();
  expect(await screen.findByText(/不受信任/)).toBeInTheDocument();
  expect(screen.getByText(/已过期/)).toBeInTheDocument();
  expect(screen.getByText(/域名匹配/)).toBeInTheDocument();
});

test('a hard failure renders the ErrorView', async () => {
  mockedCallTool.mockResolvedValue({
    ok: false, error: { code: 'SSL_HANDSHAKE_FAILED', message: '无法连接或握手失败' },
  });
  await runCheck();
  expect(await screen.findByRole('alert')).toHaveTextContent(/SSL_HANDSHAKE_FAILED/);
});

test('sends the selected STARTTLS mode in the request body', async () => {
  mockedCallTool.mockResolvedValue(report());
  render(<SslTool />);
  await userEvent.type(screen.getByLabelText(/host/i), 'mail.example.com');
  await userEvent.selectOptions(screen.getByLabelText(/starttls/i), 'smtp');
  await userEvent.click(screen.getByRole('button', { name: /检查/ }));
  expect(mockedCallTool).toHaveBeenCalledWith(
    '/api/java/ssl', expect.objectContaining({ startTls: 'smtp' }),
  );
});

// ---- T9: negotiated + version matrix + cert chain ----

test('renders the negotiated protocol and cipher', async () => {
  mockedCallTool.mockResolvedValue(report());
  await runCheck();
  const line = await screen.findByText(/协商结果/);
  expect(line).toHaveTextContent('TLSv1.3');
  expect(line).toHaveTextContent('TLS_AES_256_GCM_SHA384');
});

test('renders the version matrix with weak markers on TLSv1 / TLSv1.1', async () => {
  mockedCallTool.mockResolvedValue(report());
  await runCheck();
  expect(await screen.findByText('TLSv1.2')).toBeInTheDocument();
  // exactly the two legacy protocols carry the "弱" marker
  expect(screen.getAllByText('弱')).toHaveLength(2);
});

test('expands a non-leaf certificate on click (leaf open by default)', async () => {
  mockedCallTool.mockResolvedValue(report({
    chain: [
      cert({ subjectCN: 'leaf.example.com', sha256Fingerprint: 'LE:AF:00' }),
      cert({ subjectCN: 'Intermediate CA', sha256Fingerprint: 'IN:TE:11' }),
    ],
  }));
  await runCheck();
  // leaf body is open by default; intermediate body is collapsed
  expect(await screen.findByText(/LE:AF:00/)).toBeInTheDocument();
  expect(screen.queryByText(/IN:TE:11/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Intermediate CA/ }));
  expect(await screen.findByText(/IN:TE:11/)).toBeInTheDocument();
});

test('flags a weak signature algorithm on a cert card', async () => {
  mockedCallTool.mockResolvedValue(report({
    supportedProtocols: [{ protocol: 'TLSv1.2', supported: true, weak: false }],
    chain: [cert({ signatureAlgorithm: 'SHA1withRSA', weakSignature: true })],
  }));
  await runCheck();
  expect(await screen.findByText(/SHA1withRSA/)).toBeInTheDocument();
  expect(screen.getByText('弱签名')).toBeInTheDocument();
});
