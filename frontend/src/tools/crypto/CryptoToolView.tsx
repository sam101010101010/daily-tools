import { useState } from 'react';
import { encodeBase64, decodeBase64, encodeHex, decodeHex } from './codec';
import { ErrorView } from '../../components/ErrorView';

const ENCODING_PROTOCOLS = ['base64', 'base64-url', 'hex'];

type DecodeResult = { ok: boolean; output?: string; error?: string };

export default function CryptoToolView() {
  const [protocol, setProtocol] = useState('base64');
  const [input, setInput] = useState('');
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');

  const isEncoding = ENCODING_PROTOCOLS.includes(protocol);

  function reset() {
    setOut('');
    setErr('');
  }

  function runEncode() {
    reset();
    if (protocol === 'hex') setOut(encodeHex(input));
    else setOut(encodeBase64(input, protocol === 'base64-url'));
  }

  function runDecode() {
    reset();
    const r: DecodeResult = protocol === 'hex' ? decodeHex(input) : decodeBase64(input);
    if (r.ok) setOut(r.output ?? '');
    else setErr(r.error ?? '错误');
  }

  return (
    <div>
      <label>
        协议{' '}
        <select
          aria-label="协议"
          value={protocol}
          onChange={e => { setProtocol(e.target.value); reset(); }}
        >
          <optgroup label="编码">
            <option value="base64">Base64</option>
            <option value="base64-url">Base64（URL-safe）</option>
            <option value="hex">Hex</option>
          </optgroup>
          <optgroup label="加密">
            <option value="AES-ECB">AES-ECB</option>
            <option value="AES-CBC">AES-CBC</option>
            <option value="AES-GCM">AES-GCM</option>
          </optgroup>
        </select>
      </label>

      {isEncoding ? (
        <>
          <textarea
            aria-label="输入"
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={6}
          />
          <div>
            <button onClick={runEncode}>编码</button>
            <button onClick={runDecode}>解码</button>
          </div>
          {err && <ErrorView message={err} />}
          {out && <pre aria-label="输出">{out}</pre>}
        </>
      ) : (
        // The symmetric encrypt/decrypt form is added in T7.
        <p aria-label="加密表单占位">（AES 对称加解密表单）</p>
      )}
    </div>
  );
}
