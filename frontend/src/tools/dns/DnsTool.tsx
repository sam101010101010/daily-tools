import { useState } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';

interface DnsData { domain: string; records: Record<string, string[]>; }

export default function DnsTool() {
  const [domain, setDomain] = useState('');
  const [data, setData] = useState<DnsData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function query() {
    setLoading(true); setErr(''); setData(null);
    const res = await callTool<DnsData>('/api/java/dns', { domain });
    setLoading(false);
    if (res.ok) setData(res.data); else setErr(`${res.error.code}: ${res.error.message}`);
  }

  return (
    <div>
      <label>Domain <input aria-label="domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" /></label>
      <button onClick={query} disabled={loading || !domain}>查询</button>
      {loading && <p>查询中…</p>}
      {err && <ErrorView message={err} />}
      {data && Object.entries(data.records).map(([type, vals]) => (
        <div key={type}>
          <h4>{type}</h4>
          <ul>{vals.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
