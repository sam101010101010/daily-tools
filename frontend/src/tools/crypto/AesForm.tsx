import { useState } from 'react';
import { callTool } from '../../lib/api';
import { ErrorView } from '../../components/ErrorView';

interface CryptoResult {
  output: string;
  iv: string;
}

type Enc = 'utf8' | 'hex' | 'base64';
const ENCS: Enc[] = ['utf8', 'hex', 'base64'];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function encodeBytes(bytes: Uint8Array, enc: Enc): string {
  if (enc === 'base64') return bytesToBase64(bytes);
  return bytesToHex(bytes); // hex — also the safe fallback for utf8 (random bytes aren't text)
}

function EncSelect({ label, value, onChange }: { label: string; value: Enc; onChange: (e: Enc) => void }) {
  return (
    <label>{label}{' '}
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as Enc)}>
        {ENCS.map(en => <option key={en} value={en}>{en}</option>)}
      </select>
    </label>
  );
}

export default function AesForm({ mode }: { mode: 'ECB' | 'CBC' | 'GCM' }) {
  const isGcm = mode === 'GCM';
  const hasIv = mode !== 'ECB';

  const [padding, setPadding] = useState('PKCS5Padding');
  const [keySource, setKeySource] = useState('raw');
  const [keyHash, setKeyHash] = useState('MD5');
  const [key, setKey] = useState('');
  const [keyEnc, setKeyEnc] = useState<Enc>('utf8');
  const [iv, setIv] = useState('');
  const [ivEnc, setIvEnc] = useState<Enc>('hex');
  const [input, setInput] = useState('');
  const [inputEnc, setInputEnc] = useState<Enc>('utf8');
  const [outputEnc, setOutputEnc] = useState<Enc>('base64');

  const [output, setOutput] = useState('');
  const [ivEcho, setIvEcho] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const isHash = keySource === 'hash';
  const keyLabel = isHash ? '口令' : '密钥';
  const effectivePadding = isGcm ? 'NoPadding' : padding;

  function genIv() {
    const bytes = new Uint8Array(isGcm ? 12 : 16);
    crypto.getRandomValues(bytes);
    setIv(encodeBytes(bytes, ivEnc));
  }

  async function run(op: 'encrypt' | 'decrypt') {
    setLoading(true); setErr(''); setOutput(''); setIvEcho('');
    const body = {
      op, mode, padding: effectivePadding,
      keySource, keyHash: isHash ? keyHash : undefined,
      key, keyEnc,
      iv: hasIv ? iv : undefined, ivEnc: hasIv ? ivEnc : undefined,
      input, inputEnc, outputEnc,
    };
    const res = await callTool<CryptoResult>('/api/java/crypto', body);
    setLoading(false);
    if (res.ok) { setOutput(res.data.output); setIvEcho(res.data.iv); }
    else setErr(`${res.error.code}: ${res.error.message}`);
  }

  return (
    <div>
      {mode === 'ECB' && <p className="crypto-warn">⚠️ ECB 不安全，仅供兼容旧系统</p>}

      <label>填充{' '}
        <select aria-label="填充" value={effectivePadding} disabled={isGcm}
                onChange={e => setPadding(e.target.value)}>
          <option value="PKCS5Padding">PKCS5Padding</option>
          <option value="NoPadding">NoPadding</option>
        </select>
      </label>

      <label>密钥来源{' '}
        <select aria-label="密钥来源" value={keySource} onChange={e => setKeySource(e.target.value)}>
          <option value="raw">直接密钥</option>
          <option value="hash">口令哈希</option>
        </select>
      </label>
      {isHash && (
        <label>哈希算法{' '}
          <select aria-label="哈希算法" value={keyHash} onChange={e => setKeyHash(e.target.value)}>
            <option value="MD5">MD5 → AES-128</option>
            <option value="SHA-256">SHA-256 → AES-256</option>
          </select>
        </label>
      )}

      <label>{keyLabel}{' '}
        <input aria-label={keyLabel} value={key} onChange={e => setKey(e.target.value)} />
      </label>
      <EncSelect label="密钥编码" value={keyEnc} onChange={setKeyEnc} />

      {hasIv && (
        <div>
          <label>IV{' '}
            <input aria-label="IV" value={iv} onChange={e => setIv(e.target.value)} />
          </label>
          <EncSelect label="IV 编码" value={ivEnc} onChange={setIvEnc} />
          <button type="button" onClick={genIv}>生成随机 IV</button>
        </div>
      )}

      <label>输入{' '}
        <textarea aria-label="输入" value={input} onChange={e => setInput(e.target.value)} rows={4} />
      </label>
      <EncSelect label="输入编码" value={inputEnc} onChange={setInputEnc} />
      <EncSelect label="输出编码" value={outputEnc} onChange={setOutputEnc} />

      <div>
        <button onClick={() => run('encrypt')} disabled={loading || !key || !input}>加密</button>
        <button onClick={() => run('decrypt')} disabled={loading || !key || !input}>解密</button>
      </div>

      {loading && <p>处理中…</p>}
      {err && <ErrorView message={err} />}
      {output && <pre aria-label="输出">{output}</pre>}
      {ivEcho && (
        <label>本次 IV{' '}
          <input aria-label="回显 IV" readOnly value={ivEcho} />
        </label>
      )}
    </div>
  );
}
