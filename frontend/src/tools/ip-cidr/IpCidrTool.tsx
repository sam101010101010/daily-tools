import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import {
  CidrError,
  calculateCidr,
  contains,
  parseCidr,
} from './cidr';
import type { CidrReport } from './cidr';
import { IpParseError } from './ipAddress';

const DEFAULT_CIDR = '192.168.1.42/24';

interface ViewResult {
  readonly report: Readonly<CidrReport>;
  readonly membership?: string;
}

interface ReportRow {
  readonly label: string;
  readonly value: string;
}

export default function IpCidrTool() {
  const [cidrInput, setCidrInput] = useState(DEFAULT_CIDR);
  const [dottedMask, setDottedMask] = useState('');
  const [candidateInput, setCandidateInput] = useState('');
  const [result, setResult] = useState<ViewResult>();
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  function calculate() {
    setCopyStatus('');
    try {
      const cidr = parseCidr(applyOptionalMask(cidrInput, dottedMask));
      const report = calculateCidr(cidr);
      const membership =
        candidateInput.length === 0
          ? undefined
          : `${candidateInput} ${
              contains(cidr, candidateInput) ? '属于' : '不属于'
            }该网段`;

      setResult({ report, membership });
      setError('');
    } catch (caught) {
      setResult(undefined);
      setError(errorMessage(caught));
    }
  }

  async function copyField(label: string, value: string) {
    const copied = await copyText(value);
    setCopyStatus(copied.ok ? `${label}已复制` : copied.message);
  }

  async function copyReport(rows: ReportRow[]) {
    const text = rows
      .map(({ label, value }) => `${label}：${value}`)
      .join('\n');
    const copied = await copyText(text);
    setCopyStatus(copied.ok ? '完整报告已复制' : copied.message);
  }

  const rows = result ? reportRows(result) : [];

  return (
    <section className="ip-cidr">
      <p className="ip-cidr__hint">
        所有解析与计算均在浏览器本地完成，不会上传 IP 地址。
      </p>

      <form
        className="ip-cidr__form"
        onSubmit={(event) => {
          event.preventDefault();
          calculate();
        }}
      >
        <label htmlFor="ip-cidr-input">
          IP 地址 / CIDR
          <input
            id="ip-cidr-input"
            value={cidrInput}
            spellCheck={false}
            onChange={(event) => setCidrInput(event.target.value)}
          />
        </label>

        <label htmlFor="ip-cidr-mask">
          IPv4 点分掩码（可选）
          <input
            id="ip-cidr-mask"
            value={dottedMask}
            spellCheck={false}
            placeholder="例如 255.255.255.0；填写后覆盖 /prefix"
            onChange={(event) => setDottedMask(event.target.value)}
          />
        </label>

        <label htmlFor="ip-cidr-candidate">
          待判断地址（可选）
          <input
            id="ip-cidr-candidate"
            value={candidateInput}
            spellCheck={false}
            onChange={(event) => setCandidateInput(event.target.value)}
          />
        </label>

        <button type="submit">计算</button>
      </form>

      <p className="ip-cidr__allocation-note">
        数学地址范围不等于云厂商、操作系统或协议实际可分配的主机数；这里展示的地址总数仅表示数学范围。
      </p>

      {error && <ErrorView message={error} />}

      {result && (
        <section className="ip-cidr__result">
          <header className="ip-cidr__result-head">
            <h3>计算结果</h3>
            <button
              type="button"
              onClick={() => void copyReport(rows)}
            >
              复制完整报告
            </button>
          </header>

          <dl className="ip-cidr__report" aria-label="计算结果">
            {rows.map(({ label, value }) => (
              <div className="ip-cidr__row" key={label}>
                <dt>{label}</dt>
                <dd>
                  <code aria-label={label}>{value}</code>
                  <button
                    type="button"
                    aria-label={`复制 ${label}`}
                    onClick={() => void copyField(label, value)}
                  >
                    复制
                  </button>
                </dd>
              </div>
            ))}
          </dl>

          {copyStatus && (
            <p
              className="ip-cidr__copy-status"
              role="status"
              aria-live="polite"
            >
              {copyStatus}
            </p>
          )}
        </section>
      )}
    </section>
  );
}

function applyOptionalMask(cidrInput: string, dottedMask: string): string {
  if (dottedMask.length === 0) {
    return cidrInput;
  }

  const slash = cidrInput.indexOf('/');
  if (slash !== cidrInput.lastIndexOf('/')) {
    return cidrInput;
  }
  const address = slash === -1 ? cidrInput : cidrInput.slice(0, slash);
  return `${address}/${dottedMask}`;
}

function reportRows(result: ViewResult): ReportRow[] {
  const { report } = result;
  const rows: ReportRow[] = [
    { label: '规范 CIDR', value: report.normalizedCidr },
    {
      label: '地址族',
      value: report.family === 'ipv4' ? 'IPv4' : 'IPv6',
    },
    { label: '规范地址', value: report.address },
    { label: '网络地址', value: report.network },
    { label: '首地址', value: report.first },
    { label: '末地址', value: report.last },
    { label: '前缀长度', value: `/${report.prefix}` },
    { label: '子网掩码', value: report.netmask },
  ];

  if (report.wildcard !== undefined) {
    rows.push({ label: 'Wildcard mask', value: report.wildcard });
  }
  if (report.broadcast !== undefined) {
    rows.push({ label: '广播地址', value: report.broadcast });
  }
  rows.push({ label: '地址总数', value: report.addressCount });
  if (result.membership !== undefined) {
    rows.push({ label: '成员判断', value: result.membership });
  }
  return rows;
}

function errorMessage(error: unknown): string {
  if (error instanceof CidrError) {
    const messages: Record<CidrError['code'], string> = {
      INVALID_CIDR: 'CIDR 格式无效',
      MISSING_PREFIX: '请输入 CIDR 前缀或 IPv4 点分掩码',
      INVALID_PREFIX: 'CIDR 前缀长度无效',
      INVALID_MASK: 'IPv4 点分掩码必须是连续的 1 后接连续的 0',
      MIXED_FAMILY: '待判断地址必须与网段使用相同的地址族',
    };
    return messages[error.code];
  }

  if (error instanceof IpParseError) {
    const messages: Record<IpParseError['code'], string> = {
      INVALID_IP: 'IP 地址格式无效',
      INVALID_IPV4: 'IPv4 地址格式无效',
      INVALID_IPV6: 'IPv6 地址格式无效',
    };
    return messages[error.code];
  }

  return '无法计算该网段，请检查输入';
}
