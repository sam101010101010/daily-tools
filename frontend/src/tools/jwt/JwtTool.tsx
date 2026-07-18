import { useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { decodeJwt, formatNumericDate, type DecodedJwt } from './jwt';

const EXAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGFtcGxlLXVzZXIiLCJpYXQiOjE3MDAwMDAwMDB9.c2ln';

const CLAIM_LABELS: ReadonlyArray<readonly [key: 'iss' | 'sub' | 'aud' | 'exp' | 'nbf' | 'iat', label: string]> = [
  ['iss', '签发者（iss）'],
  ['sub', '主题（sub）'],
  ['aud', '受众（aud）'],
  ['exp', '过期时间（exp）'],
  ['nbf', '生效时间（nbf）'],
  ['iat', '签发时间（iat）'],
];

function displayClaim(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayClaim).join('、');
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value) ?? String(value);
  return String(value);
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState('');

  async function copy() {
    const result = await copyText(value);
    setStatus(result.ok ? '已复制' : result.message);
  }

  return (
    <>
      <button className="jwt__copy" data-copy-state={status === '已复制' ? 'success' : 'copy'} onClick={() => void copy()}>{label}</button>
      {status && <span className="jwt__copy-status" role="status" aria-live="polite">{status}</span>}
    </>
  );
}

function ClaimSummary({ payload }: { payload: DecodedJwt['payload'] }) {
  const claims = CLAIM_LABELS.filter(([key]) => Object.hasOwn(payload, key));
  if (claims.length === 0) return <p className="jwt__empty">没有可展示的注册 claims。</p>;

  return (
    <dl className="jwt__claims">
      {claims.map(([key, label]) => {
        const value = payload[key];
        const readableDate = key === 'exp' || key === 'nbf' || key === 'iat' ? formatNumericDate(value) : undefined;
        const expiredLocally = key === 'exp' && readableDate !== undefined
          && typeof value === 'number' && value * 1_000 < Date.now();
        return (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{displayClaim(value)}{readableDate && <span className="jwt__date">可读时间：{readableDate}</span>}{expiredLocally && <span className="jwt__date">时间已过（相对本地时钟）</span>}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function DecodedResults({ value }: { value: DecodedJwt }) {
  const header = JSON.stringify(value.header, null, 2);
  const payload = JSON.stringify(value.payload, null, 2);

  return (
    <div className="jwt__results" aria-label="解码结果">
      <section className="jwt__section">
        <div className="jwt__section-head"><h3>Header</h3><CopyButton label="复制 Header" value={header} /></div>
        <pre aria-label="Header JSON">{header}</pre>
      </section>
      <section className="jwt__section">
        <div className="jwt__section-head"><h3>Payload</h3><CopyButton label="复制 Payload" value={payload} /></div>
        <pre aria-label="Payload JSON">{payload}</pre>
      </section>
      <section className="jwt__section">
        <h3>签名段</h3>
        <pre aria-label="签名段">{value.signature}</pre>
      </section>
      <section className="jwt__section">
        <h3>注册 claims</h3>
        <ClaimSummary payload={value.payload} />
      </section>
    </div>
  );
}

export default function JwtTool() {
  const [input, setInput] = useState(EXAMPLE_JWT);
  const [decoded, setDecoded] = useState<Readonly<{ id: number; value: DecodedJwt }>>();
  const [error, setError] = useState('');
  const resultSequence = useRef(0);

  function decode() {
    setDecoded(undefined);
    setError('');
    const result = decodeJwt(input);
    if (result.ok) setDecoded({ id: ++resultSequence.current, value: result.value });
    else setError(result.error);
  }

  return (
    <div className="jwt">
      <p className="jwt__safety" aria-label="页面安全说明"><strong>已解码，未验证签名</strong><span>。内容仅供查看，请勿据此决定访问权限。</span></p>
      <label className="jwt__label" htmlFor="jwt-input">JWT</label>
      <textarea
        id="jwt-input"
        aria-label="JWT"
        value={input}
        onChange={event => setInput(event.target.value)}
        placeholder="粘贴三段紧凑 JWS"
        rows={7}
      />
      <div className="jwt__actions"><button onClick={decode}>解码</button></div>
      {error && <ErrorView message={error} />}
      {decoded && <DecodedResults key={decoded.id} value={decoded.value} />}
    </div>
  );
}
