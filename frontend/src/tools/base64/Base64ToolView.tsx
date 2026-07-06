import { useState } from 'react';
import { encodeBase64, decodeBase64 } from './base64Tool';
import { ErrorView } from '../../components/ErrorView';

export default function Base64Tool() {
  const [input, setInput] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  return (
    <div>
      <textarea aria-label="base64 输入" value={input} onChange={e => setInput(e.target.value)} rows={6} />
      <label><input type="checkbox" checked={urlSafe} onChange={e => setUrlSafe(e.target.checked)} /> URL-safe</label>
      <div>
        <button onClick={() => { setOut(encodeBase64(input, urlSafe)); setErr(''); }}>编码</button>
        <button onClick={() => { const r = decodeBase64(input); r.ok ? (setOut(r.output ?? ''), setErr('')) : (setErr(r.error ?? '错误'), setOut('')); }}>解码</button>
      </div>
      {err && <ErrorView message={err} />}
      {out && <pre aria-label="base64 输出">{out}</pre>}
    </div>
  );
}
