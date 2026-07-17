import { useEffect, useRef, useState, type ReactNode } from 'react';
import { callTool } from '../../lib/api';
import { copyText, formatCertSummary } from '../../lib/copy';
import { ErrorView } from '../../components/ErrorView';
import type { CertDetail, SslReport } from './types';

export type { SslReport } from './types';

type BadgeTone = 'ok' | 'bad' | 'warn';
function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`ssl__badge ssl__badge--${tone}`}>{children}</span>;
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

  function actionText(action: string, text = '复制') {
    return copiedAction === action ? '已复制' : text;
  }

  return (
    <div className="ssl__cert">
      <div className="ssl__cert-head-row">
        <button className="ssl__cert-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {subject}
        </button>
        <div className="ssl__cert-actions">
          <button aria-label="复制证书摘要" onClick={() => void copy('summary', formatCertSummary(cert))}>
            {actionText('summary', '复制摘要')}
          </button>
          <button
            aria-label="复制 PEM"
            disabled={!cert.pem}
            onClick={() => cert.pem && void copy('pem', cert.pem)}
          >
            {actionText('pem', '复制 PEM')}
          </button>
        </div>
      </div>
      {copiedAction && <p className="ssl__copy-status" role="status" aria-live="polite">已复制</p>}
      {copyError && <ErrorView message={copyError} />}
      {open && (
        <dl className="ssl__cert-body">
          <dt>Subject</dt>
          <dd><span>{subjectDisplay}</span><button aria-label="复制 Subject" onClick={() => void copy('subject', subjectDisplay)}>{actionText('subject')}</button></dd>
          <dt>Issuer</dt>
          <dd><span>{issuerDisplay}</span><button aria-label="复制 Issuer" onClick={() => void copy('issuer', issuerDisplay)}>{actionText('issuer')}</button></dd>
          <dt>有效期</dt>
          <dd>{cert.notBefore} → {cert.notAfter}（{cert.expired ? '已过期' : `剩 ${cert.daysUntilExpiry} 天`}）</dd>
          <dt>公钥</dt>
          <dd>{cert.keyAlgorithm}{cert.keySize ? ` ${cert.keySize} bit` : ''}</dd>
          <dt>签名算法</dt>
          <dd>{cert.signatureAlgorithm} {cert.weakSignature && <span className="ssl__weak-sig">弱签名</span>}</dd>
          <dt>SHA-256 指纹</dt>
          <dd className="ssl__fp"><span>{cert.sha256Fingerprint}</span><button aria-label="复制 SHA-256 指纹" onClick={() => void copy('fingerprint', cert.sha256Fingerprint)}>{actionText('fingerprint')}</button></dd>
          <dt>序列号</dt>
          <dd><span>{cert.serialNumber}</span><button aria-label="复制序列号" onClick={() => void copy('serial', cert.serialNumber)}>{actionText('serial')}</button></dd>
          {cert.sans.length > 0 && (<><dt>SAN</dt><dd><span>{cert.sans.join(', ')}</span><button aria-label="复制 SAN" onClick={() => void copy('san', cert.sans.join(', '))}>{actionText('san')}</button></dd></>)}
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
            {report.chain.map((c, i) => <CertCard key={i} cert={c} defaultOpen={i === 0} />)}
          </div>
        </>
      )}
    </div>
  );
}
