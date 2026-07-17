import { useEffect, useRef, useState, type ReactNode } from 'react';
import { callTool } from '../../lib/api';
import {
  copyText,
  formatCertSummary,
  formatChainPem,
  formatDiagnosticReport,
} from '../../lib/copy';
import { ErrorView } from '../../components/ErrorView';
import type { CertDetail, SslReport } from './types';

export type { SslReport } from './types';

type BadgeTone = 'ok' | 'bad' | 'warn';
function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`ssl__badge ssl__badge--${tone}`}>{children}</span>;
}

function CopyIcon({ copied = false }: { copied?: boolean }) {
  return copied ? (
    <svg className="ssl__copy-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  ) : (
    <svg className="ssl__copy-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="10" height="10" rx="1" />
      <path d="M15 9V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

function CopyAction({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
  }, []);

  async function copy() {
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    setCopied(false);
    setCopyError('');
    const result = await copyText(value);
    if (!result.ok) {
      setCopyError(result.message);
      return;
    }
    setCopied(true);
    copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="ssl__result-copy-action">
      <button aria-label={label} disabled={!value} onClick={() => void copy()}>
        <CopyIcon copied={copied} />
        <span>{copied ? '已复制' : label}</span>
      </button>
      {copied && <p className="ssl__result-copy-status" role="status" aria-live="polite">已复制</p>}
      {copyError && <ErrorView message={copyError} />}
    </div>
  );
}

function CertCard({ cert, defaultOpen }: { cert: CertDetail; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subject = cert.subjectCN ?? cert.subjectDN;
  const issuer = cert.issuerCN ?? cert.issuerDN;
  const subjectDisplay = `${subject}${cert.subjectO ? ` · ${cert.subjectO}` : ''}`;
  const issuerDisplay = `${issuer}${cert.issuerO ? ` · ${cert.issuerO}` : ''}`;

  useEffect(() => () => {
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
  }, []);

  async function copy(action: string, value: string) {
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    setCopiedAction(null);
    setCopyError('');
    const result = await copyText(value);
    if (!result.ok) {
      setCopyError(result.message);
      return;
    }
    setCopiedAction(action);
    copiedTimeout.current = setTimeout(() => setCopiedAction(null), 2000);
  }

  function copyButton(action: string, label: string, value: string, disabled = false) {
    const copied = copiedAction === action;
    return (
      <button
        className={`ssl__copy-button${copied ? ' ssl__copy-button--copied' : ''}`}
        data-copy-state={copied ? 'success' : 'copy'}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => void copy(action, value)}
      >
        <CopyIcon copied={copied} />
      </button>
    );
  }

  return (
    <div className="ssl__cert">
      <div className="ssl__cert-head-row">
        <button className="ssl__cert-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {subject}
        </button>
        <div className="ssl__cert-actions">
          {copyButton('summary', '复制证书摘要', formatCertSummary(cert))}
          {copyButton('pem', '复制 PEM', cert.pem ?? '', !cert.pem)}
        </div>
      </div>
      {copiedAction && <p className="ssl__copy-status" role="status" aria-live="polite">已复制</p>}
      {copyError && <ErrorView message={copyError} />}
      {open && (
        <dl className="ssl__cert-body">
          <dt>Subject</dt>
          <dd><span>{subjectDisplay}</span>{copyButton('subject', '复制 Subject', subjectDisplay)}</dd>
          <dt>Issuer</dt>
          <dd><span>{issuerDisplay}</span>{copyButton('issuer', '复制 Issuer', issuerDisplay)}</dd>
          <dt>有效期</dt>
          <dd>{cert.notBefore} → {cert.notAfter}（{cert.expired ? '已过期' : `剩 ${cert.daysUntilExpiry} 天`}）</dd>
          <dt>公钥</dt>
          <dd>{cert.keyAlgorithm}{cert.keySize ? ` ${cert.keySize} bit` : ''}</dd>
          <dt>签名算法</dt>
          <dd>{cert.signatureAlgorithm} {cert.weakSignature && <span className="ssl__weak-sig">弱签名</span>}</dd>
          <dt>SHA-256 指纹</dt>
          <dd className="ssl__fp"><span>{cert.sha256Fingerprint}</span>{copyButton('fingerprint', '复制 SHA-256 指纹', cert.sha256Fingerprint)}</dd>
          <dt>序列号</dt>
          <dd><span>{cert.serialNumber}</span>{copyButton('serial', '复制序列号', cert.serialNumber)}</dd>
          {cert.sans.length > 0 && (<><dt>SAN</dt><dd><span>{cert.sans.join(', ')}</span>{copyButton('san', '复制 SAN', cert.sans.join(', '))}</dd></>)}
        </dl>
      )}
    </div>
  );
}

export default function SslTool() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [startTls, setStartTls] = useState('none');
  const [report, setReport] = useState<SslReport | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true); setErr(''); setReport(null);
    const body: { host: string; port?: number; startTls: string } = { host, startTls };
    if (port.trim()) body.port = Number(port);
    const res = await callTool<SslReport>('/api/java/ssl', body);
    setLoading(false);
    if (res.ok) setReport(res.data); else setErr(`${res.error.code}: ${res.error.message}`);
  }

  const v = report?.validation;
  const chainPem = report ? formatChainPem(report.chain) : '';
  return (
    <div className="ssl">
      <div className="ssl__form">
        <label>Host
          <input aria-label="host" value={host} onChange={e => setHost(e.target.value)} placeholder="example.com" />
        </label>
        <label>端口
          <input aria-label="port" value={port} onChange={e => setPort(e.target.value)} placeholder="443" inputMode="numeric" />
        </label>
        <label>STARTTLS
          <select aria-label="starttls" value={startTls} onChange={e => setStartTls(e.target.value)}>
            <option value="none">无（直连 TLS）</option>
            <option value="smtp">SMTP</option>
            <option value="imap">IMAP</option>
            <option value="pop3">POP3</option>
          </select>
        </label>
        <button onClick={check} disabled={loading || !host}>检查</button>
      </div>

      {loading && <p>检查中…</p>}
      {err && <ErrorView message={err} />}

      {v && (
        <div className="ssl__badges" role="list" aria-label="verdict">
          <Badge tone={v.trusted ? 'ok' : 'bad'}>
            {v.trusted ? '✓ 受信任' : `✗ 不受信任${v.trustError ? `：${v.trustError}` : ''}`}
          </Badge>
          <Badge tone={v.hostnameMatch ? 'ok' : 'bad'}>
            {v.hostnameMatch ? `✓ 域名匹配${v.matchedName ? `（${v.matchedName}）` : ''}` : '✗ 域名不匹配'}
          </Badge>
          <Badge tone={v.expired ? 'bad' : 'ok'}>
            {v.expired ? '✗ 已过期' : `✓ 剩 ${v.daysUntilExpiry} 天`}
          </Badge>
          {v.selfSigned && <Badge tone="warn">⚠ 自签名</Badge>}
        </div>
      )}

      {report && (
        <>
          <div className="ssl__report-actions">
            <CopyAction label="复制诊断报告" value={formatDiagnosticReport(report)} />
          </div>

          <p className="ssl__negotiated">
            协商结果：{report.negotiated.version} · {report.negotiated.cipher}
          </p>

          {report.supportedProtocols.length > 0 && (
            <table className="ssl__matrix">
              <thead><tr><th>协议</th><th>支持</th><th></th></tr></thead>
              <tbody>
                {report.supportedProtocols.map(p => (
                  <tr key={p.protocol}>
                    <td>{p.protocol}</td>
                    <td>{p.supported ? '✓' : '✗'}</td>
                    <td>{p.weak && <span className="ssl__weak">弱</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="ssl__chain">
            <div className="ssl__chain-actions">
              <CopyAction label="复制完整链" value={chainPem} />
            </div>
            {report.chain.map((c, i) => <CertCard key={i} cert={c} defaultOpen={i === 0} />)}
          </div>
        </>
      )}
    </div>
  );
}
