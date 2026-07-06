import { useState } from 'react';
import { formatJson, minifyJson, validateJson } from './jsonTool';
import { ErrorView } from '../../components/ErrorView';

export default function JsonTool() {
  const [input, setInput] = useState('');
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  const run = (fn: (s: string) => { ok: boolean; output?: string; error?: string }) => {
    const r = fn(input);
    if (r.ok) { setOut(r.output ?? ''); setErr(''); } else { setErr(r.error ?? '错误'); setOut(''); }
  };
  return (
    <div>
      <textarea aria-label="json 输入" value={input} onChange={e => setInput(e.target.value)} rows={8} />
      <div>
        <button onClick={() => run(s => formatJson(s))}>格式化</button>
        <button onClick={() => run(minifyJson)}>压缩</button>
        <button onClick={() => run(validateJson)}>校验</button>
      </div>
      {err && <ErrorView message={err} />}
      {out && <pre aria-label="json 输出">{out}</pre>}
    </div>
  );
}
