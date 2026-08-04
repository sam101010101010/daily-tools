/// <reference types="node" />

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CertificationRequest } from 'pkijs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as reportMappers from './report';
import type { CertificateReport } from './report';
import CertDecoderTool from './CertDecoderTool';

const fixtureDirectory = resolve(process.cwd(), 'src/tools/cert-decoder/fixtures');
const fixture = (name: string) => readFileSync(resolve(fixtureDirectory, name), 'utf8');
const ecdsaCertificatePem = fixture('ecdsa-certificate.pem');
const ecdsaCsrTamperedPem = fixture('ecdsa-csr-tampered.pem');
const noSanCsrPem = fixture('no-san-csr.pem');
const rsaCertificatePem = fixture('rsa-certificate.pem');
const rsaCsrPem = fixture('rsa-csr.pem');

const RSA_FINGERPRINT = 'FF:69:D5:D0:34:43:AC:FE:E1:7B:7A:5D:6C:18:7E:70:52:30:C3:A2:80:B4:EC:A2:17:DD:BB:ED:6D:EB:D3:39';

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

function replacePem(value: string) {
  fireEvent.change(screen.getByLabelText('PEM 证书或 CSR'), { target: { value } });
}

async function decodeAs(value: string, reportLabel: '证书报告' | 'CSR 报告') {
  replacePem(value);
  fireEvent.click(screen.getByRole('button', { name: '解码' }));
  return screen.findByRole('region', { name: reportLabel });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

test('prefills a public certificate but waits for explicit decode without network, storage or clipboard access', async () => {
  // Catches eager decoding and any data escape before the user asks to inspect
  // the safe public fixture.
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchSpy);
  setClipboard(writeText);
  const localStorageAccess = vi.spyOn(window, 'localStorage', 'get');
  const sessionStorageAccess = vi.spyOn(window, 'sessionStorage', 'get');

  render(<CertDecoderTool />);

  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveValue(rsaCertificatePem.trim());
  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(localStorageAccess).not.toHaveBeenCalled();
  expect(sessionStorageAccess).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(await screen.findByRole('region', { name: '证书报告' })).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(localStorageAccess).not.toHaveBeenCalled();
  expect(sessionStorageAccess).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled();
});

test('exposes scoped layout hooks and contains report tables for responsive styling', async () => {
  // Catches removing the component boundary or the wrappers that keep wide
  // identity/report data from causing page-level horizontal overflow.
  const { container } = render(<CertDecoderTool />);

  expect(container.firstElementChild).toHaveClass('cert-decoder');
  expect(screen.getByLabelText('处理与验证范围说明')).toHaveClass('cert-decoder__notice');
  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveClass('cert-decoder__editor');
  expect(screen.getByRole('button', { name: '解码' }).parentElement).toHaveClass('cert-decoder__decode-actions');

  const report = await decodeAs(rsaCertificatePem, '证书报告');

  expect(report).toHaveClass('cert-decoder__report', 'cert-decoder__report--certificate');
  expect(report.querySelector(':scope > dl')).toHaveClass('cert-decoder__summary');
  expect(screen.getByRole('button', { name: '复制完整报告' }).parentElement).toHaveClass('cert-decoder__report-actions');
  for (const table of within(report).getAllByRole('table')) {
    expect(table.parentElement).toHaveClass('cert-decoder__table-wrap');
  }
});

test('renders a semantic RSA certificate report with ordered identity, SAN, validity, extensions and algorithms', async () => {
  // Catches selecting the CSR branch, losing DN order, hiding OIDs/SANs, or
  // presenting the controlled-clock validity state as broader trust.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  render(<CertDecoderTool />);

  const report = await decodeAs(rsaCertificatePem, '证书报告');
  const subject = within(report).getByRole('table', { name: '主题 DN' });
  const subjectRows = within(subject).getAllByRole('row');

  expect(subjectRows[1]).toHaveTextContent('Country2.5.4.6US');
  expect(subjectRows[2]).toHaveTextContent('Organization2.5.4.10Daily Tools Lab');
  expect(subjectRows[4]).toHaveTextContent('Common Name2.5.4.3rsa.example.test');
  expect(within(report).getByRole('table', { name: '颁发者 DN' })).toHaveTextContent('ops@example.test');
  expect(within(report).getByRole('table', { name: '主题备用名称' })).toHaveTextContent('DNSrsa.example.test');
  expect(within(report).getByRole('table', { name: '主题备用名称' })).toHaveTextContent('IP192.0.2.42');
  expect(report).toHaveTextContent('2026-08-04T06:38:48.000Z');
  expect(report).toHaveTextContent('2053-12-20T06:38:48.000Z');
  expect(report).toHaveTextContent('位于有效期内（相对本地时钟）');
  expect(report).toHaveTextContent('版本3');
  expect(report).toHaveTextContent('序列号102030405060708090A0B0C0D0E0F010');
  expect(report).toHaveTextContent('RSA（1.2.840.113549.1.1.1）');
  expect(report).toHaveTextContent('SHA-256 with RSA（1.2.840.113549.1.1.11）');
  expect(report).toHaveTextContent('Basic Constraints');
  expect(report).toHaveTextContent('digital-signature');
  expect(report).toHaveTextContent('1.2.3.4.99');
  expect(report).toHaveTextContent(RSA_FINGERPRINT);
  expect(report.querySelector('dl')).not.toBeNull();
});

test('renders an ECDSA certificate through the certificate discriminant with literal algorithm fields', async () => {
  render(<CertDecoderTool />);

  const report = await decodeAs(ecdsaCertificatePem, '证书报告');

  expect(report).toHaveTextContent('ecdsa.example.test');
  expect(report).toHaveTextContent('EC（1.2.840.10045.2.1）');
  expect(report).toHaveTextContent('ECDSA with SHA-384（1.2.840.10045.4.3.3）');
  expect(report).toHaveTextContent('EA:AC:C0:BC:5A:93:BE:D1:89:0B:67:BD:EC:6F:45:33:F1:3E:4B:E6:DD:77:52:A5:D6:4B:6A:13:53:CB:65:6B');
  expect(screen.queryByRole('region', { name: 'CSR 报告' })).not.toBeInTheDocument();
});

describe('CSR discriminated report', () => {
  test('shows a valid RSA CSR signature and requested SANs without making an identity claim', async () => {
    render(<CertDecoderTool />);

    const report = await decodeAs(rsaCsrPem, 'CSR 报告');

    expect(report).toHaveTextContent('rsa-csr.example.test');
    expect(within(report).getByRole('table', { name: '请求的主题备用名称' })).toHaveTextContent('IP192.0.2.77');
    expect(report).toHaveTextContent('RSA（1.2.840.113549.1.1.1）');
    expect(report).toHaveTextContent('SHA-256 with RSA（1.2.840.113549.1.1.11）');
    expect(report).toHaveTextContent('签名有效');
    expect(report).toHaveTextContent('4C:33:14:A0:8D:29:10:FA:BD:2F:44:42:37:A4:F8:ED:81:44:8B:2D:C6:E4:18:E1:BD:A8:70:5E:13:A6:56:F2');
    expect(screen.queryByRole('region', { name: '证书报告' })).not.toBeInTheDocument();
  });

  test('shows a tampered ECDSA CSR signature as invalid', async () => {
    render(<CertDecoderTool />);

    const report = await decodeAs(ecdsaCsrTamperedPem, 'CSR 报告');

    expect(report).toHaveTextContent('ecdsa-csr.example.test');
    expect(report).toHaveTextContent('EC（1.2.840.10045.2.1）');
    expect(report).toHaveTextContent('ECDSA with SHA-384（1.2.840.10045.4.3.3）');
    expect(report).toHaveTextContent('签名无效');
  });

  test('renders a missing requested SAN explicitly as 未包含', async () => {
    render(<CertDecoderTool />);

    const report = await decodeAs(noSanCsrPem, 'CSR 报告');

    expect(report).toHaveTextContent('请求的主题备用名称未包含');
    expect(report).toHaveTextContent('签名有效');
  });

  test('sanitizes unsupported browser verification while retaining the real CSR report', async () => {
    // Catches dropping or mislabelling the unsupported discriminant, leaking a
    // native Web Crypto error, or broadening signature support into trust.
    vi.spyOn(CertificationRequest.prototype, 'verify').mockRejectedValueOnce(
      new DOMException('native algorithm detail must stay private', 'NotSupportedError'),
    );
    render(<CertDecoderTool />);

    const report = await decodeAs(rsaCsrPem, 'CSR 报告');

    expect(report).toHaveTextContent('rsa-csr.example.test');
    expect(report).toHaveTextContent('security@example.test');
    expect(report).toHaveTextContent('RSA（1.2.840.113549.1.1.1）');
    expect(report).toHaveTextContent('4C:33:14:A0:8D:29:10:FA:BD:2F:44:42:37:A4:F8:ED:81:44:8B:2D:C6:E4:18:E1:BD:A8:70:5E:13:A6:56:F2');
    expect(within(report).getByText('当前浏览器不支持验证此签名算法')).toBeInTheDocument();
    expect(report).not.toHaveTextContent(/native algorithm detail|NotSupportedError/);
    expect(report).not.toHaveTextContent(/身份|信任|受信任|已签发/);
  });
});

test('copies the exact fingerprint and a stable JSON-safe full report with accessible success announcements', async () => {
  // Catches copying the PEM/DER instead of the bounded DTO or sending a
  // fingerprint with altered separators/case.
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  render(<CertDecoderTool />);
  await decodeAs(rsaCertificatePem, '证书报告');

  await user.click(screen.getByRole('button', { name: '复制 SHA-256 指纹' }));
  expect(writeText).toHaveBeenLastCalledWith(RSA_FINGERPRINT);
  expect(screen.getByRole('status')).toHaveTextContent('SHA-256 指纹已复制');

  await user.click(screen.getByRole('button', { name: '复制完整报告' }));
  const copiedReport = writeText.mock.calls.at(-1)?.[0] as string;
  const parsed = JSON.parse(copiedReport) as Record<string, unknown>;
  expect(parsed).toMatchObject({
    kind: 'certificate',
    version: 3,
    serialNumber: '102030405060708090A0B0C0D0E0F010',
    fingerprintSha256: RSA_FINGERPRINT,
  });
  expect(copiedReport).not.toContain('-----BEGIN');
  expect(copiedReport).not.toMatch(/private|rawDer|"der"/i);
  expect(screen.getByRole('status')).toHaveTextContent('完整报告已复制');
});

test('sanitizes clipboard rejection through ErrorView and retains the report', async () => {
  const user = userEvent.setup();
  setClipboard(vi.fn().mockRejectedValue(new DOMException('native denied detail', 'NotAllowedError')));
  render(<CertDecoderTool />);
  await decodeAs(rsaCertificatePem, '证书报告');

  await user.click(screen.getByRole('button', { name: '复制完整报告' }));

  expect(screen.getByRole('alert')).toHaveTextContent('复制失败，请手动复制。');
  expect(screen.getByRole('alert')).not.toHaveTextContent('native denied detail');
  expect(screen.getByRole('region', { name: '证书报告' })).toBeInTheDocument();
});

const malformedInputs = [
  ['空输入', '', '提供的内容必须是一个完整的 PEM 块。'],
  ['私钥', '-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----', '不支持该 PEM 标签。'],
  ['多个 PEM 块', `${rsaCertificatePem.trim()}\n${rsaCsrPem.trim()}`, 'PEM 的开始和结束标签必须匹配。'],
  ['超大 PEM', `-----BEGIN CERTIFICATE-----\n${'A'.repeat(1_398_108)}\n-----END CERTIFICATE-----`, 'PEM 解码后的内容超过 1 MiB 限制。'],
  ['非法 Base64', '-----BEGIN CERTIFICATE-----\n%%%\n-----END CERTIFICATE-----', 'PEM 内容不是规范的 Base64 编码。'],
  ['非法 ASN.1', '-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----', '内容不是受支持的有效 ASN.1 证书或证书请求。'],
  [
    '标签与内容不匹配',
    rsaCsrPem.replaceAll('CERTIFICATE REQUEST', 'CERTIFICATE'),
    '内容不是受支持的有效 ASN.1 证书或证书请求。',
  ],
] as const;

test.each(malformedInputs)('renders a stable sanitized error for %s', async (_case, input, message) => {
  render(<CertDecoderTool />);
  replacePem(input);

  fireEvent.click(screen.getByRole('button', { name: '解码' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('alert')).not.toHaveTextContent(/pkijs|asn1js|DOMException|atob/i);
  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
});

test('removes a stale successful report before showing a subsequent decode error', async () => {
  render(<CertDecoderTool />);
  await decodeAs(rsaCertificatePem, '证书报告');

  replacePem('not a PEM');
  fireEvent.click(screen.getByRole('button', { name: '解码' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('提供的内容必须是一个完整的 PEM 块。');
  expect(screen.queryByRole('region', { name: '证书报告' })).not.toBeInTheDocument();
});

test('editing input immediately clears the report, copy controls and derived status', async () => {
  // Catches associating a successfully decoded report or copy state with PEM
  // text that the user has since changed without pressing decode again.
  const user = userEvent.setup();
  setClipboard(vi.fn().mockResolvedValue(undefined));
  render(<CertDecoderTool />);
  await decodeAs(rsaCertificatePem, '证书报告');
  await user.click(screen.getByRole('button', { name: '复制 SHA-256 指纹' }));
  expect(screen.getByRole('status')).toHaveTextContent('SHA-256 指纹已复制');

  replacePem(rsaCsrPem);

  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveValue(rsaCsrPem);
  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /复制 SHA-256 指纹|复制完整报告/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  await decodeAs(rsaCertificatePem, '证书报告');
  setClipboard(vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
  await user.click(screen.getByRole('button', { name: '复制完整报告' }));
  expect(screen.getByRole('alert')).toHaveTextContent('复制失败，请手动复制。');

  replacePem(rsaCsrPem);

  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveValue(rsaCsrPem);
  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('editing input invalidates an in-flight real mapper result', async () => {
  // Catches an old async decode publishing after the textarea has changed.
  // The seam only gates the real mapper; report creation remains production code.
  const realMapCertificate = reportMappers.mapCertificate;
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  let releaseMapper!: () => void;
  const mapperGate = new Promise<void>(resolve => { releaseMapper = resolve; });
  let signalCompleted!: () => void;
  const completed = new Promise<void>(resolve => { signalCompleted = resolve; });
  vi.spyOn(reportMappers, 'mapCertificate').mockImplementationOnce(async (...args) => {
    signalStarted();
    await mapperGate;
    const mapped = await realMapCertificate(...args);
    signalCompleted();
    return mapped;
  });
  render(<CertDecoderTool />);
  replacePem(rsaCertificatePem);
  fireEvent.click(screen.getByRole('button', { name: '解码' }));
  await started;

  replacePem(rsaCsrPem);
  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveValue(rsaCsrPem);

  await act(async () => {
    releaseMapper();
    await completed;
  });

  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /复制 SHA-256 指纹|复制完整报告/ })).not.toBeInTheDocument();
});

test('reset clears report and error and restores the safe public default', async () => {
  const user = userEvent.setup();
  render(<CertDecoderTool />);
  await decodeAs(rsaCertificatePem, '证书报告');
  replacePem('not a PEM');
  fireEvent.click(screen.getByRole('button', { name: '解码' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '重置' }));

  expect(screen.getByLabelText('PEM 证书或 CSR')).toHaveValue(rsaCertificatePem.trim());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /报告/ })).not.toBeInTheDocument();
});

test('renders hostile DN, SAN and unknown-extension strings only as inert React text', async () => {
  // This narrow mapper seam isolates rendering because embedding these strings
  // into a signed certificate fixture is intentionally impractical.
  const hostileReport: CertificateReport = {
    kind: 'certificate',
    version: 3,
    serialNumber: '01',
    subject: [{ oid: '2.5.4.3', name: 'Common Name', value: '<img src=x onerror=alert(1)>' }],
    issuer: [{ oid: '2.5.4.3', name: 'Common Name', value: 'safe issuer' }],
    validity: {
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2027-01-01T00:00:00.000Z',
      state: 'valid',
    },
    publicKeyAlgorithm: { name: 'RSA', oid: '1.2.840.113549.1.1.1' },
    signatureAlgorithm: { name: 'SHA-256 with RSA', oid: '1.2.840.113549.1.1.11' },
    fingerprintSha256: 'AA:BB',
    subjectAlternativeNames: [{ type: 'dns', value: '<script>window.pwned=true</script>' }],
    extensions: {
      basicConstraints: null,
      keyUsage: null,
      extendedKeyUsage: null,
      unrecognized: [{ oid: '1.2.3', critical: false, value: '<img src=x onerror=alert(2)>' }],
    },
  };
  vi.spyOn(reportMappers, 'mapCertificate').mockResolvedValueOnce(hostileReport);
  render(<CertDecoderTool />);

  const report = await decodeAs(rsaCertificatePem, '证书报告');

  expect(within(report).getAllByText('<img src=x onerror=alert(1)>').length).toBeGreaterThan(0);
  expect(within(report).getByText('<script>window.pwned=true</script>')).toBeInTheDocument();
  expect(within(report).getByText('<img src=x onerror=alert(2)>')).toBeInTheDocument();
  expect(report.querySelector('img')).toBeNull();
  expect(report.querySelector('script')).toBeNull();
  expect(report.querySelector('[onerror]')).toBeNull();
});

test('provides labelled keyboard controls and prominent browser-only/trust-boundary guidance', () => {
  render(<CertDecoderTool />);

  expect(screen.getByLabelText('PEM 证书或 CSR')).toBeInstanceOf(HTMLTextAreaElement);
  expect(screen.getByRole('button', { name: '解码' })).toHaveAttribute('type', 'button');
  expect(screen.getByRole('button', { name: '重置' })).toHaveAttribute('type', 'button');
  expect(screen.getByLabelText('处理与验证范围说明')).toHaveTextContent('所有内容仅在当前浏览器本地处理，不会上传');
  expect(screen.getByLabelText('处理与验证范围说明')).toHaveTextContent('证书解析和日期状态不代表证书链信任、主机名匹配或吊销验证');
  expect(screen.getByLabelText('处理与验证范围说明')).toHaveTextContent('CSR 签名有效仅证明签名时持有请求内公钥对应的私钥');
  expect(screen.queryByRole('button', { name: /生成 CSR|上传|私钥/ })).not.toBeInTheDocument();
});
