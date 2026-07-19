import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { decodeUrlComponent, encodeUrlComponent } from './url';

const EXAMPLE_INPUT = 'https://example.com/搜索?q=a b+c';

export default function UrlTool() {
  const [input, setInput] = useState(EXAMPLE_INPUT);
  const [output, setOutput] = useState<string>();
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  function encode() {
    setOutput(encodeUrlComponent(input));
    setError('');
    setCopyStatus('');
  }

  function decode() {
    const result = decodeUrlComponent(input);
    setCopyStatus('');
    if (result.ok) {
      setOutput(result.value);
      setError('');
    } else {
      setOutput(undefined);
      setError(result.error);
    }
  }

  async function copyOutput() {
    if (output === undefined) return;
    const result = await copyText(output);
    setCopyStatus(result.ok ? '已复制' : result.message);
  }

  return (
    <div className="url">
      <p className="url__hint">按 URL 组件规则处理文本。<code>+</code> 保持为加号，不会被转换为空格。</p>
      <label className="url__label" htmlFor="url-input">输入</label>
      <textarea
        id="url-input"
        aria-label="输入"
        value={input}
        onChange={event => setInput(event.target.value)}
        rows={7}
      />
      <div className="url__actions">
        <button onClick={encode}>编码</button>
        <button onClick={decode}>解码</button>
      </div>
      {error && <ErrorView message={error} />}
      {output !== undefined && (
        <section className="url__result" aria-label="输出">
          <div className="url__result-head">
            <h3>输出</h3>
            <button onClick={() => void copyOutput()}>复制输出</button>
          </div>
          <pre>{output}</pre>
          {copyStatus && <span className="url__copy-status" role="status" aria-live="polite">{copyStatus}</span>}
        </section>
      )}
    </div>
  );
}
