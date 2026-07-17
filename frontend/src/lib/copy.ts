import type { CertDetail, SslReport } from '../tools/ssl/types';

export type { CertDetail, SslReport } from '../tools/ssl/types';

export type CopyResult = { ok: true } | { ok: false; message: string };

const UNAVAILABLE_MESSAGE = '无法访问剪贴板，请手动复制。';
const WRITE_FAILURE_MESSAGE = '复制失败，请手动复制。';

export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, message: WRITE_FAILURE_MESSAGE };
  }
}

export function formatCertSummary(cert: CertDetail): string {
  const subject = cert.subjectCN ?? cert.subjectDN;
  const issuer = cert.issuerCN ?? cert.issuerDN;
  const validity = cert.expired ? '已过期' : `剩 ${cert.daysUntilExpiry} 天`;
  const key = cert.keySize === null ? cert.keyAlgorithm : `${cert.keyAlgorithm} ${cert.keySize} bit`;
  const signature = cert.weakSignature
    ? `${cert.signatureAlgorithm}（弱签名）`
    : cert.signatureAlgorithm;
  const sans = cert.sans.length > 0 ? cert.sans.join(', ') : '—';

  return [
    `Subject：${subject}`,
    `Issuer：${issuer}`,
    `有效期：${cert.notBefore} → ${cert.notAfter}（${validity}）`,
    `公钥：${key}`,
    `签名算法：${signature}`,
    `SHA-256 指纹：${cert.sha256Fingerprint}`,
    `序列号：${cert.serialNumber}`,
    `SAN：${sans}`,
  ].join('\n');
}

export function formatChainPem(chain: CertDetail[]): string {
  const pemValues = chain
    .map((cert) => cert.pem)
    .filter((pem): pem is string => Boolean(pem));

  if (pemValues.length === 0) return '';

  return pemValues.reduce(
    (output, pem) => `${output}${output.endsWith('\n') ? '\n' : '\n\n'}${pem}`,
  );
}

export function formatDiagnosticReport(report: SslReport): string {
  const { validation } = report;
  const trust = validation.trusted
    ? '受信任'
    : `不受信任：${validation.trustError ?? '—'}`;
  const hostname = validation.hostnameMatch
    ? `匹配：${validation.matchedName ?? '—'}`
    : '不匹配';
  const validity = validation.expired ? '已过期' : `剩 ${validation.daysUntilExpiry} 天`;
  const protocols = report.supportedProtocols.map((protocol) => {
    const support = protocol.supported ? '支持' : '不支持';
    return `- ${protocol.protocol}：${support}${protocol.weak ? '（弱）' : ''}`;
  });
  const chain = report.chain.flatMap((cert, index) => [
    `[第 ${index + 1} 张]`,
    formatCertSummary(cert),
  ]);

  return [
    `目标：${report.host}:${report.port}`,
    `STARTTLS：${report.startTls}`,
    `信任：${trust}`,
    `域名：${hostname}`,
    `有效期：${validity}`,
    `自签名：${validation.selfSigned ? '是' : '否'}`,
    `协商：${report.negotiated.version} · ${report.negotiated.cipher}`,
    '协议：',
    ...protocols,
    '证书链：',
    ...chain,
  ].join('\n');
}
