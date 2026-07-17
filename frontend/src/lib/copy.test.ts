import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  copyText,
  formatCertSummary,
  formatChainPem,
  formatDiagnosticReport,
  type CertDetail,
  type SslReport,
} from './copy';
import type { SslReport as LiveSslReport } from '../tools/ssl/SslTool';

const cert: CertDetail = {
  subjectCN: 'www.example.com', subjectO: null,
  issuerCN: 'Example Issuing CA', issuerO: null,
  subjectDN: 'CN=www.example.com,O=Example', issuerDN: 'CN=Example Issuing CA,O=Example',
  notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z',
  expired: false, daysUntilExpiry: 168,
  keyAlgorithm: 'RSA', keySize: 2048,
  signatureAlgorithm: 'SHA256withRSA', weakSignature: false,
  sha256Fingerprint: 'AA:BB', serialNumber: '1234', sans: ['www.example.com', 'example.com'],
  pem: '-----BEGIN CERTIFICATE-----\nLEAF\n-----END CERTIFICATE-----\n',
};

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('copyText', () => {
  test('writes text through the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    await expect(copyText('export')).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('export');
  });

  test('returns a displayable failure when Clipboard API is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'clipboard');

    await expect(copyText('export')).resolves.toEqual({
      ok: false,
      message: '无法访问剪贴板，请手动复制。',
    });
  });

  test('returns a displayable failure when clipboard permission is rejected', async () => {
    setClipboard(vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')));

    await expect(copyText('export')).resolves.toEqual({
      ok: false,
      message: '复制失败，请手动复制。',
    });
  });

  test('returns a displayable failure when writing text fails', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('write failed')));

    await expect(copyText('export')).resolves.toEqual({
      ok: false,
      message: '复制失败，请手动复制。',
    });
  });
});

test('formats a certificate summary in the specified field order', () => {
  expect(formatCertSummary(cert)).toBe([
    'Subject：www.example.com',
    'Issuer：Example Issuing CA',
    '有效期：2026-01-01T00:00:00Z → 2027-01-01T00:00:00Z（剩 168 天）',
    '公钥：RSA 2048 bit',
    '签名算法：SHA256withRSA',
    'SHA-256 指纹：AA:BB',
    '序列号：1234',
    'SAN：www.example.com, example.com',
  ].join('\n'));
});

test('uses certificate fallbacks and omits conditional summary pieces', () => {
  expect(formatCertSummary({
    ...cert,
    subjectCN: null, issuerCN: null, expired: true, keySize: null,
    weakSignature: true, sans: [],
  })).toBe([
    'Subject：CN=www.example.com,O=Example',
    'Issuer：CN=Example Issuing CA,O=Example',
    '有效期：2026-01-01T00:00:00Z → 2027-01-01T00:00:00Z（已过期）',
    '公钥：RSA',
    '签名算法：SHA256withRSA（弱签名）',
    'SHA-256 指纹：AA:BB',
    '序列号：1234',
    'SAN：—',
  ].join('\n'));
});

test('joins only existing certificate PEM values in chain order', () => {
  expect(formatChainPem([
    cert,
    { ...cert, pem: null },
    { ...cert, pem: '-----BEGIN CERTIFICATE-----\nINTERMEDIATE\n-----END CERTIFICATE-----\n' },
  ])).toBe(
    '-----BEGIN CERTIFICATE-----\nLEAF\n-----END CERTIFICATE-----\n\n-----BEGIN CERTIFICATE-----\nINTERMEDIATE\n-----END CERTIFICATE-----\n',
  );
});

test('inserts one blank line without altering PEM values that lack a trailing newline', () => {
  expect(formatChainPem([
    { ...cert, pem: 'leaf' },
    { ...cert, pem: 'intermediate' },
  ])).toBe('leaf\n\nintermediate');
});

test('returns an empty export when no certificate has PEM', () => {
  expect(formatChainPem([{ ...cert, pem: null }])).toBe('');
});

test('formats a diagnostic report in the specified field and protocol order without PEM', () => {
  const report: SslReport = {
    host: 'example.com', port: 443, startTls: 'smtp',
    negotiated: { version: 'TLSv1.3', cipher: 'TLS_AES_128_GCM_SHA256' },
    supportedProtocols: [
      { protocol: 'TLSv1.3', supported: true, weak: false },
      { protocol: 'TLSv1.0', supported: false, weak: true },
    ],
    validation: {
      trusted: false, trustError: 'Unknown CA', hostnameMatch: true,
      matchedName: 'www.example.com', selfSigned: false, expired: false, daysUntilExpiry: 168,
    },
    chain: [cert],
  };

  expect(formatDiagnosticReport(report)).toBe([
    '目标：example.com:443',
    'STARTTLS：smtp',
    '信任：不受信任：Unknown CA',
    '域名：匹配：www.example.com',
    '有效期：剩 168 天',
    '自签名：否',
    '协商：TLSv1.3 · TLS_AES_128_GCM_SHA256',
    '协议：',
    '- TLSv1.3：支持',
    '- TLSv1.0：不支持（弱）',
    '证书链：',
    '[第 1 张]',
    'Subject：www.example.com',
    'Issuer：Example Issuing CA',
    '有效期：2026-01-01T00:00:00Z → 2027-01-01T00:00:00Z（剩 168 天）',
    '公钥：RSA 2048 bit',
    '签名算法：SHA256withRSA',
    'SHA-256 指纹：AA:BB',
    '序列号：1234',
    'SAN：www.example.com, example.com',
  ].join('\n'));
});

test('uses em dashes for missing diagnostic values', () => {
  const report: SslReport = {
    host: 'example.com', port: 465, startTls: 'none',
    negotiated: { version: 'TLSv1.2', cipher: 'ECDHE' }, supportedProtocols: [],
    validation: {
      trusted: false, trustError: null, hostnameMatch: false, matchedName: null,
      selfSigned: true, expired: true, daysUntilExpiry: 0,
    },
    chain: [],
  };

  expect(formatDiagnosticReport(report)).toContain([
    '信任：不受信任：—',
    '域名：不匹配',
    '有效期：已过期',
    '自签名：是',
  ].join('\n'));
});

test('accepts the live SSL report model', () => {
  const report: LiveSslReport = {
    host: 'example.com', port: 443, startTls: 'none',
    negotiated: { version: 'TLSv1.3', cipher: 'AES' }, supportedProtocols: [],
    validation: {
      trusted: true, trustError: null, hostnameMatch: true, matchedName: 'example.com',
      selfSigned: false, expired: false, daysUntilExpiry: 1,
    },
    chain: [],
  };

  expect(formatDiagnosticReport(report)).toContain('目标：example.com:443');
});
