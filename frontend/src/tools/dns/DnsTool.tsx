import { Fragment, useState } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';

type Resolver = 'system' | 'cloudflare';

interface DnsRecord {
  name: string;
  type: string;
  recordClass: string;
  ttl: number;
  value: string;
  fields: Record<string, string>;
}

interface DnsFlags {
  authoritative: boolean;
  truncated: boolean;
  recursionDesired: boolean;
  recursionAvailable: boolean;
  authenticatedData: boolean;
}

interface DnsQueryResult {
  queryName: string;
  type: string;
  elapsedMs: number;
  rcode: string | null;
  flags: DnsFlags | null;
  error: { code: string; message: string } | null;
  answer: DnsRecord[];
  authority: DnsRecord[];
  additional: DnsRecord[];
}

interface DnsReport {
  input: string;
  resolver: Resolver;
  elapsedMs: number;
  queryCount: number;
  respondedQueryCount: number;
  queries: DnsQueryResult[];
}

const resolverNames: Record<Resolver, string> = {
  system: '服务器系统 DNS',
  cloudflare: 'Cloudflare 1.1.1.1',
};

const fieldLabels: Record<string, string> = {
  preference: '优先级',
  exchange: '目标',
  target: '目标',
  address: '地址',
  hostname: '主机名',
  serial: '序列号',
  refresh: '刷新间隔',
  retry: '重试间隔',
  expire: '过期时间',
  minimum: '最小 TTL',
  flags: '标志',
  tag: '标签',
  issuerCritical: '颁发者关键标志',
  service: '服务',
  protocol: '协议',
  port: '端口',
  algorithm: '算法',
  keyTag: '密钥标签',
  digestType: '摘要类型',
  digest: '摘要',
  key: '公钥',
  typeCovered: '覆盖类型',
  labels: '标签数',
  originalTtl: '原始 TTL',
  signatureExpiration: '签名过期',
  signatureInception: '签名生效',
  signer: '签名者',
  signature: '签名',
};

function formatFlags(flags: DnsFlags | null) {
  if (!flags) return '—';
  return [
    flags.authoritative && 'AA',
    flags.truncated && 'TC',
    flags.recursionDesired && 'RD',
    flags.recursionAvailable && 'RA',
    flags.authenticatedData && 'AD',
  ].filter(Boolean).join(' ') || '—';
}

function formatRecord(record: DnsRecord) {
  return `${record.name} ${record.ttl} ${record.recordClass} ${record.type} ${record.value}`;
}

function RecordList({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) return <p className="dns__empty">没有记录。</p>;
  return (
    <ul>
      {records.map((record, index) => (
        <li key={`${record.name}-${record.type}-${index}`}>
          <strong>{record.value}</strong>
          <dl className="dns__record-meta">
            <dt>名称</dt><dd>{record.name}</dd>
            <dt>类型</dt><dd>{record.type}</dd>
            <dt>响应 TTL</dt><dd>{record.ttl} 秒</dd>
            {Object.entries(record.fields).map(([field, value]) => (
              <Fragment key={field}>
                <dt>{fieldLabels[field] ?? field}</dt><dd>{value}</dd>
              </Fragment>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Section({ name, records, open = false }: { name: string; records: DnsRecord[]; open?: boolean }) {
  return (
    <details className="dns__section" open={open}>
      <summary>{name}（{records.length}）</summary>
      <h4>{name}</h4>
      <RecordList records={records} />
    </details>
  );
}

function QueryResult({ query }: { query: DnsQueryResult }) {
  const raw = [
    ...query.answer.map(formatRecord),
    ...query.authority.map(formatRecord),
    ...query.additional.map(formatRecord),
  ].join('\n') || '（无记录）';
  const isReverse = query.type === 'PTR' && query.queryName.endsWith('.in-addr.arpa.');

  return (
    <details className="dns__query" open>
      <summary>{query.type} · {query.queryName}</summary>
      <dl className="dns__query-meta">
        <dt>查询名称</dt><dd>{query.queryName}{isReverse ? '（反向查询）' : ''}</dd>
        <dt>结果码</dt><dd>{query.rcode ?? '未收到协议响应'}</dd>
        <dt>标志</dt><dd>{formatFlags(query.flags)}</dd>
        <dt>耗时</dt><dd>{query.elapsedMs} ms</dd>
      </dl>
      {query.error && <p className="dns__query-error">{query.error.code}: {query.error.message}</p>}
      <Section name="Answer" records={query.answer} open />
      <Section name="Authority" records={query.authority} />
      <Section name="Additional" records={query.additional} />
      <details className="dns__section dns__raw">
        <summary>原始响应</summary>
        <pre>{raw}</pre>
      </details>
    </details>
  );
}

export default function DnsTool() {
  const [domain, setDomain] = useState('');
  const [resolver, setResolver] = useState<Resolver>('system');
  const [data, setData] = useState<DnsReport | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function query() {
    setLoading(true); setErr(''); setData(null);
    const res = await callTool<DnsReport>('/api/java/dns', { domain, resolver });
    setLoading(false);
    if (res.ok) setData(res.data); else setErr(`${res.error.code}: ${res.error.message}`);
  }

  return (
    <div className="dns">
      <div className="dns__form">
        <label>Domain
          <input aria-label="domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" />
        </label>
        <label>DNS 服务器
          <select aria-label="DNS 服务器" value={resolver} onChange={e => setResolver(e.target.value as Resolver)}>
            <option value="system">服务器系统 DNS</option>
            <option value="cloudflare">Cloudflare 1.1.1.1</option>
          </select>
        </label>
        <button onClick={query} disabled={loading || !domain}>查询</button>
      </div>
      {loading && <p>查询中…</p>}
      {err && <ErrorView message={err} />}
      {data && (
        <>
          <dl className="dns__summary">
            <dt>查询输入</dt><dd>{data.input}</dd>
            <dt>DNS 来源</dt><dd>{resolverNames[data.resolver]}</dd>
            <dt>响应查询</dt><dd>{data.respondedQueryCount} / {data.queryCount}</dd>
            <dt>总耗时</dt><dd>{data.elapsedMs} ms</dd>
          </dl>
          <div className="dns__queries">
            {data.queries.map((item, index) => <QueryResult key={`${item.type}-${index}`} query={item} />)}
          </div>
        </>
      )}
    </div>
  );
}
