import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { callTool } from '../../lib/api';
import { copyText } from '../../lib/copy';

interface RdapEvent {
  action: string | null;
  date: string | null;
  actor: string | null;
}

interface RdapRegistrar {
  name: string | null;
  handle: string | null;
}

interface RdapNameserver {
  ldhName: string | null;
  unicodeName: string | null;
  statuses: string[];
}

interface RdapNotice {
  title: string | null;
  description: string[];
}

export interface RdapReport {
  input: string;
  domain: string;
  found: boolean;
  source: string;
  ldhName: string | null;
  unicodeName: string | null;
  handle: string | null;
  statuses: string[];
  events: RdapEvent[];
  registrar: RdapRegistrar | null;
  nameservers: RdapNameserver[];
  notices: RdapNotice[];
  rawJson: string | null;
}

const missing = '未公开';

function display(value: string | null | undefined) {
  return value || missing;
}

export default function WhoisTool() {
  const [domain, setDomain] = useState('example.com');
  const [report, setReport] = useState<RdapReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  async function query() {
    setLoading(true);
    setReport(null);
    setError('');
    setCopyStatus('');
    const response = await callTool<RdapReport>('/api/java/whois', { domain });
    setLoading(false);
    if (response.ok) {
      setReport(response.data);
    } else {
      setError(`${response.error.code}: ${response.error.message}`);
    }
  }

  async function copyRawJson(rawJson: string) {
    setCopyStatus('');
    const result = await copyText(rawJson);
    setCopyStatus(result.ok ? '已复制' : result.message);
  }

  return (
    <div className="whois">
      <p className="whois__note">
        仅在点击查询后，通过公开 RDAP 服务获取域名注册信息；结果可能因注册局隐私策略而省略。
      </p>
      <div className="whois__form">
        <label htmlFor="whois-domain">域名</label>
        <input
          id="whois-domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
        />
        <button onClick={() => void query()} disabled={loading || !domain.trim()}>
          查询
        </button>
      </div>

      {loading && <p className="whois__loading">查询中…</p>}
      {error && <ErrorView message={error} />}
      {report && !report.found && (
        <div className="whois__not-found">
          <strong>未找到公开注册信息</strong>
          <p>查询域名：{report.domain}</p>
          <p>RDAP 来源：{report.source}</p>
        </div>
      )}
      {report?.found && (
        <div className="whois__result">
          <section className="whois__section" aria-labelledby="whois-summary">
            <h3 id="whois-summary">域名摘要</h3>
            <dl className="whois__summary">
              <dt>规范域名</dt>
              <dd>{report.domain}</dd>
              <dt>LDH 名称</dt>
              <dd>{display(report.ldhName)}</dd>
              <dt>Unicode 名称</dt>
              <dd>{display(report.unicodeName)}</dd>
              <dt>注册句柄</dt>
              <dd>{display(report.handle)}</dd>
              <dt>状态</dt>
              <dd className="whois__statuses">
                {report.statuses.length > 0
                  ? report.statuses.map((status) => (
                    <span
                      className={`whois__status-chip${
                        status.includes('prohibited') ? ' whois__status-chip--restricted' : ''
                      }`}
                      key={status}
                    >
                      {status}
                    </span>
                  ))
                  : missing}
              </dd>
              <dt>RDAP 来源</dt>
              <dd>{report.source}</dd>
            </dl>
          </section>

          <section className="whois__section" aria-labelledby="whois-events">
            <h3 id="whois-events">生命周期</h3>
            {report.events.length > 0 ? (
              <ul className="whois__event-list">
                {report.events.map((event, index) => (
                  <li key={`${event.action}-${event.date}-${index}`}>
                    <strong>{display(event.action)}</strong>
                    <span>{display(event.date)}</span>
                    <span>执行方：{display(event.actor)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="whois__empty">{missing}</p>}
          </section>

          <section className="whois__section" aria-labelledby="whois-registrar">
            <h3 id="whois-registrar">注册商</h3>
            {report.registrar ? (
              <dl className="whois__compact">
                <dt>名称</dt>
                <dd>{display(report.registrar.name)}</dd>
                <dt>句柄</dt>
                <dd>{display(report.registrar.handle)}</dd>
              </dl>
            ) : <p className="whois__empty">{missing}</p>}
          </section>

          <section className="whois__section" aria-labelledby="whois-nameservers">
            <h3 id="whois-nameservers">域名服务器</h3>
            {report.nameservers.length > 0 ? (
              <ul className="whois__nameservers">
                {report.nameservers.map((nameserver, index) => (
                  <li key={`${nameserver.ldhName}-${index}`}>
                    <strong>{display(nameserver.ldhName)}</strong>
                    <span>Unicode 名称：{display(nameserver.unicodeName)}</span>
                    <span>
                      状态：{nameserver.statuses.length > 0
                        ? nameserver.statuses.join('、')
                        : missing}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="whois__empty">{missing}</p>}
          </section>

          <section className="whois__section" aria-labelledby="whois-notices">
            <h3 id="whois-notices">公告</h3>
            {report.notices.length > 0 ? (
              <ul className="whois__notices">
                {report.notices.map((notice, index) => (
                  <li key={`${notice.title}-${index}`}>
                    <strong>{display(notice.title)}</strong>
                    {notice.description.length > 0
                      ? notice.description.map((line, lineIndex) => (
                        <span key={`${line}-${lineIndex}`}>{line}</span>
                      ))
                      : <span>{missing}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="whois__empty">{missing}</p>}
          </section>

          {report.rawJson && (
            <details className="whois__raw">
              <summary>原始 RDAP JSON</summary>
              <button onClick={() => void copyRawJson(report.rawJson as string)}>
                复制原始 JSON
              </button>
              {copyStatus && (
                <span className="whois__copy-status" role="status" aria-live="polite">
                  {copyStatus}
                </span>
              )}
              <pre>{report.rawJson}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
