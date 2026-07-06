import { useState } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';

interface SslCertInfo {
  subject: string; issuer: string; notBefore: string; notAfter: string;
  expired: boolean; daysUntilExpiry: number; sans: string[]; serialNumber: string;
}

export default function SslTool() {
  const [host, setHost] = useState('');
  const [info, setInfo] = useState<SslCertInfo | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true); setErr(''); setInfo(null);
    const res = await callTool<SslCertInfo>('/api/java/ssl', { host });
    setLoading(false);
    if (res.ok) setInfo(res.data); else setErr(`${res.error.code}: ${res.error.message}`);
  }

  return (
    <div>
      <label>Host <input aria-label="host" value={host} onChange={e => setHost(e.target.value)} placeholder="example.com" /></label>
      <button onClick={check} disabled={loading || !host}>检查</button>
      {loading && <p>检查中…</p>}
      {err && <ErrorView message={err} />}
      {info && (
        <dl>
          <dt>Subject</dt><dd>{info.subject}</dd>
          <dt>Issuer</dt><dd>{info.issuer}</dd>
          <dt>有效期至</dt><dd>{info.notAfter}（{info.expired ? '已过期' : `剩 ${info.daysUntilExpiry} 天`}）</dd>
          <dt>SAN</dt><dd>{info.sans.join(', ')}</dd>
        </dl>
      )}
    </div>
  );
}
