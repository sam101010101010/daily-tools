import { useState, type ReactNode } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';
import type { CertDetail, SslReport } from './types';

export type { SslReport } from './types';

type BadgeTone = 'ok' | 'bad' | 'warn';
function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`ssl__badge ssl__badge--${tone}`}>{children}</span>;
}

function CertCard({ cert, defaultOpen }: { cert: CertDetail; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ssl__cert">
      <button className="ssl__cert-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {cert.subjectCN ?? cert.subjectDN}
      </button>
      {open && (
        <dl className="ssl__cert-body">
          <dt>Subject</dt>
          <dd>{cert.subjectCN ?? cert.subjectDN}{cert.subjectO ? ` · ${cert.subjectO}` : ''}</dd>
          <dt>Issuer</dt>
          <dd>{cert.issuerCN ?? cert.issuerDN}{cert.issuerO ? ` · ${cert.issuerO}` : ''}</dd>
          <dt>有效期</dt>
          <dd>{cert.notBefore} → {cert.notAfter}（{cert.expired ? '已过期' : `剩 ${cert.daysUntilExpiry} 天`}）</dd>
          <dt>公钥</dt>
          <dd>{cert.keyAlgorithm}{cert.keySize ? ` ${cert.keySize} bit` : ''}</dd>
          <dt>签名算法</dt>
          <dd>{cert.signatureAlgorithm} {cert.weakSignature && <span className="ssl__weak-sig">弱签名</span>}</dd>
          <dt>SHA-256 指纹</dt>
          <dd className="ssl__fp">{cert.sha256Fingerprint}</dd>
          {cert.sans.length > 0 && (<><dt>SAN</dt><dd>{cert.sans.join(', ')}</dd></>)}
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
