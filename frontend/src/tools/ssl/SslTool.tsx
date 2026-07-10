import { useState, type ReactNode } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';

interface CertDetail {
  subjectCN: string | null; subjectO: string | null;
  issuerCN: string | null; issuerO: string | null;
  subjectDN: string; issuerDN: string;
  notBefore: string; notAfter: string;
  expired: boolean; daysUntilExpiry: number;
  keyAlgorithm: string; keySize: number | null;
  signatureAlgorithm: string; weakSignature: boolean;
  sha256Fingerprint: string; serialNumber: string;
  sans: string[];
}
interface ProtocolResult { protocol: string; supported: boolean; weak: boolean; }
interface Validation {
  trusted: boolean; trustError: string | null;
  hostnameMatch: boolean; matchedName: string | null;
  selfSigned: boolean; expired: boolean; daysUntilExpiry: number;
}
interface Negotiated { version: string; cipher: string; }
export interface SslReport {
  host: string; port: number; startTls: string;
  negotiated: Negotiated;
  supportedProtocols: ProtocolResult[];
  validation: Validation;
  chain: CertDetail[];
}

type BadgeTone = 'ok' | 'bad' | 'warn';
function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`ssl__badge ssl__badge--${tone}`}>{children}</span>;
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
    </div>
  );
}
